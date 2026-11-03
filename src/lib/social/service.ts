/**
 * Traer fotos y vídeos de su Instagram o TikTok a la propuesta (docs/PERSONALIZE.md §Traer de sus redes).
 * 1) list: las publicaciones del perfil que tiene la empresa en el CRM (caché de 1 hora por perfil y espacio) y una
 *    selección propuesta (las fijadas y las de más engagement).
 * 2) import: una publicación cada vez (el navegador espera 2-3 s entre una y otra): se descarga del enlace temporal de la
 *    API, se sube a la carpeta de la propuesta y se añade como foto o vídeo, igual que una subida a mano.
 * Un fallo no rompe nada: se devuelve el código y la propuesta sigue con lo que haya.
 */
import type { AdminContext } from '../admin/auth';
import { env } from '../env';
import { AdminError } from '../admin/service';
import { MediaApiError, pickPosts, profileRef, type MediaApi, type MediaErrorCode, type MediaItem, type SocialPlatform, type SocialPost, type SocialProfile } from './media-api';

export const CACHE_MS = 60 * 60_000;
export const PHOTO_MAX = 8 * 1024 * 1024;
export const VIDEO_MAX = 30 * 1024 * 1024;
export const MAX_PHOTOS = 8;
/** «Cargar más»: hasta 10 páginas (120 publicaciones) por perfil en la caché. */
export const MAX_POSTS = 120;
/** Instagram bloqueando: se vuelve a probar una sola vez pasados 20 minutos; si sigue, sin Instagram durante 6 horas. */
export const IG_RETRY_MS = 20 * 60_000;
export const IG_GIVE_UP_MS = 6 * 3_600_000;
/** Instagram: como mucho un perfil nuevo cada 2 minutos (lo pide la API de medios). */
export const IG_GAP_MS = 2 * 60_000;
/** Sin sesión, Instagram solo da la primera página: «Cargar más» solo para TikTok (o con SOCIAL_INSTAGRAM_PAGES=1). */
const igPages = () => env('SOCIAL_INSTAGRAM_PAGES') === '1';
/** Lo que se guarda de cada perfil: sus páginas juntas, el cursor de la siguiente y si Instagram está bloqueando. */
interface Cached extends SocialProfile { blocked?: { at: string; tries: number }; noMore?: boolean }
const lastIg = new Map<string, number>();
/** Para las pruebas. */
export const resetIgPacing = () => lastIg.clear();

export interface SocialCache {
  get(tenantId: string, key: string): Promise<{ result: SocialProfile; fetchedAt: string } | null>;
  put(tenantId: string, key: string, result: SocialProfile): Promise<void>;
}
export interface SocialDeps {
  api: MediaApi | null;
  cache: SocialCache;
  /** Descarga el archivo del enlace temporal (con tope de tamaño). */
  fetchFile(url: string, max: number): Promise<{ bytes: Uint8Array; type: string | null }>;
  /** Sube los bytes a la URL firmada de la propuesta. */
  put(uploadUrl: string, headers: Record<string, string>, type: string, bytes: Uint8Array): Promise<void>;
  now?: () => number;
}

/** Las redes que tiene la empresa en el CRM (lo que se puede traer). */
export function socialSources(a: { instagram?: string | null; tiktok?: string | null } | null | undefined) {
  if (!a) return [];
  return (['instagram', 'tiktok'] as const).flatMap((p) => {
    const ref = profileRef(a[p], p);
    return ref ? [{ platform: p, key: ref.key, handle: ref.key.split(':')[1] }] : [];
  });
}

const EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };
const OK_TYPES = new Set(Object.values(EXT));
function mimeOf(item: MediaItem, fetched: string | null): string | null {
  const ext = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(item.name)?.[1]?.toLowerCase();
  const byExt = ext ? EXT[ext] : undefined;
  const byHeader = fetched?.split(';')[0].trim().toLowerCase();
  const t = byExt ?? (byHeader && OK_TYPES.has(byHeader) ? byHeader : null);
  return t && t.startsWith(item.type === 'image' ? 'image/' : 'video/') ? t : null;
}

/** Enlace de una publicación suelta de Instagram o TikTok (no un perfil): normalizado, o null. */
export function postLink(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  const ig = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/i.exec(v);
  if (ig) return `https://www.instagram.com/${ig[1].toLowerCase() === 'reels' ? 'reel' : ig[1].toLowerCase()}/${ig[2]}/`;
  const tt = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([\w.]{1,40})\/(video|photo)\/(\d{5,30})/i.exec(v);
  if (tt) return `https://www.tiktok.com/@${tt[1]}/${tt[2].toLowerCase()}/${tt[3]}`;
  const short = /^https?:\/\/(vm|vt)\.tiktok\.com\/([A-Za-z0-9]{5,20})\/?/i.exec(v);
  if (short) return `https://${short[1].toLowerCase()}.tiktok.com/${short[2]}/`;
  return null;
}

/** Lo que ve el editor de cada publicación (sin enlaces caducables salvo la miniatura, que pasa por el servidor). */
export interface PostView { i: number; type: SocialPost['type']; itemCount: number | null; pinned: boolean; takenAt: string | null; caption: string | null; likes: number | null; comments: number | null; views: number | null; url: string; thumb: string | null }

export function createSocialService(admin: AdminContext, deps: SocialDeps) {
  const s = admin.session;
  const now = deps.now ?? Date.now;
  async function dossier(id: string) {
    const st = await admin.service.getState(id);
    if (!st.canEdit) throw new AdminError(403, 'Solo quien hizo la propuesta (o un responsable) la personaliza');
    const account = st.dossier.accountId ? await admin.accounts.get(st.dossier.accountId).then((x) => x.account).catch(() => null) : null;
    return { st, sources: socialSources(account) };
  }
  const profileUrl = (key: string, platform: SocialPlatform) => {
    const user = key.split(':')[1];
    return platform === 'tiktok' ? `https://www.tiktok.com/@${user}` : `https://www.instagram.com/${user}/`;
  };
  /** Los pies de foto, cortos: con varias páginas, la fila de la caché crece. */
  const slim = (ps: SocialPost[]) => ps.map((p) => ({ ...p, caption: p.caption?.slice(0, 200) ?? null }));
  /**
   * La primera página (de la caché si tiene menos de una hora). Instagram bloqueando (LOGIN_REQUIRED en la primera
   * página): queda pendiente y se vuelve a probar una sola vez pasados 20 minutos; si sigue, sin Instagram un rato.
   */
  async function listing(key: string, platform: SocialPlatform): Promise<Cached> {
    const hit = await deps.cache.get(s.tenantId, key).catch(() => null);
    const r = hit?.result as Cached | undefined;
    const blocked = r?.blocked;
    if (blocked) {
      const since = now() - Date.parse(blocked.at);
      if (blocked.tries >= 2 && since < IG_GIVE_UP_MS) throw new MediaApiError('IG_BLOCKED', 422);
      if (blocked.tries < 2 && since < IG_RETRY_MS) throw new MediaApiError('IG_PENDING', 422, Math.ceil((IG_RETRY_MS - since) / 1000));
    } else if (hit && r && now() - Date.parse(hit.fetchedAt) < CACHE_MS) return r;
    if (!deps.api) throw new MediaApiError('NOT_CONFIGURED', 503);
    if (platform === 'instagram') {
      const last = lastIg.get(s.tenantId) ?? 0;
      if (now() - last < IG_GAP_MS) throw new MediaApiError('IG_WAIT', 429, Math.ceil((IG_GAP_MS - (now() - last)) / 1000));
      lastIg.set(s.tenantId, now());
    }
    let res: SocialProfile;
    try { res = await deps.api.list(profileUrl(key, platform), null, 12); } catch (e) {
      if (e instanceof MediaApiError && e.code === 'LOGIN_REQUIRED' && platform === 'instagram') {
        const tries = blocked && now() - Date.parse(blocked.at) < IG_GIVE_UP_MS ? blocked.tries + 1 : 1;
        const mark: Cached = { platform, username: key.split(':')[1], fullName: null, followers: null, posts: [], nextCursor: null, blocked: { at: new Date(now()).toISOString(), tries } };
        await deps.cache.put(s.tenantId, key, mark).catch(() => undefined);
        console.warn(`[social] Instagram bloqueando (${tries}.º intento)`, e.detail ?? '');
        throw tries >= 2 ? new MediaApiError('IG_BLOCKED', 422) : new MediaApiError('IG_PENDING', 422, Math.ceil(IG_RETRY_MS / 1000));
      }
      throw e;
    }
    const fresh: Cached = { ...res, posts: slim(res.posts).slice(0, MAX_POSTS) };
    await deps.cache.put(s.tenantId, key, fresh).catch((e) => console.warn('[social] caché', e instanceof Error ? e.message : e));
    return fresh;
  }
  const hasMore = (r: Cached) => !!r.nextCursor && !r.noMore && r.posts.length < MAX_POSTS && (r.platform === 'tiktok' || igPages());
  const thumbOf = (dossierId: string, key: string, p: SocialPost, i: number) =>
    !p.thumbnail ? null : p.thumbnail.startsWith('data:') ? p.thumbnail : `/admin/api/dossiers/${dossierId}/social?key=${encodeURIComponent(key)}&thumb=${i}`;
  const viewOf = (dossierId: string, key: string, p: SocialPost, i: number): PostView => ({ i, type: p.type, itemCount: p.itemCount, pinned: !!p.pinned, takenAt: p.takenAt,
    caption: p.caption?.slice(0, 160) ?? null, likes: p.likes, comments: p.comments, views: p.views, url: p.url, thumb: thumbOf(dossierId, key, p, i) });

  async function list(id: string, input: { platform?: unknown }) {
    const { st, sources } = await dossier(id);
    if (!sources.length) return { ok: false as const, code: 'NO_PROFILE' as const, sources };
    const src = sources.find((x) => x.platform === input.platform) ?? sources[0];
    try {
      const r = await listing(src.key, src.platform);
      const media = st.dossier.clientMedia ?? {};
      const free = Math.max(0, MAX_PHOTOS - (media.photos?.length ?? 0));
      const pick = pickPosts(r.posts, { photos: Math.min(4, free), videos: media.video ? 0 : 1 });
      const idx = (p: SocialPost) => r.posts.indexOf(p);
      return {
        ok: true as const, sources, platform: src.platform, key: src.key, username: r.username, fullName: r.fullName, followers: r.followers,
        free, hasVideo: !!media.video,
        posts: r.posts.map((p, i) => viewOf(id, src.key, p, i)),
        suggested: { photos: pick.photos.map(idx), videos: pick.videos.map(idx) },
        more: hasMore(r),
      };
    } catch (e) {
      if (e instanceof MediaApiError) {
        if (e.code === 'INVALID_API_KEY' || e.code === 'NOT_CONFIGURED') console.error('[social] la clave de la API de medios no vale o falta (CONVERT_API_KEY)');
        return { ok: false as const, code: e.code, sources, platform: src.platform, retryAfter: e.retryAfter };
      }
      throw e;
    }
  }

  /**
   * «Cargar más»: la página siguiente, que se añade a lo ya listado (las posiciones no cambian). Una petición cada vez.
   * TikTok caído un rato (UPSTREAM_UNAVAILABLE): se dice cuánto esperar y el editor lo reintenta una vez.
   */
  async function more(id: string, input: { key?: unknown }) {
    const { sources } = await dossier(id);
    const src = sources.find((x) => x.key === input.key);
    if (!src) throw new AdminError(422, 'Datos no válidos');
    const hit = await deps.cache.get(s.tenantId, src.key).catch(() => null);
    const r = hit?.result as Cached | undefined;
    // Si la lista ha caducado (más de una hora), se vuelve a abrir.
    if (!hit || !r || r.blocked || now() - Date.parse(hit.fetchedAt) >= CACHE_MS) return { ok: false as const, code: 'EXPIRED' as const, more: false };
    if (!hasMore(r)) return { ok: true as const, posts: [] as PostView[], more: false };
    if (!deps.api) return { ok: false as const, code: 'NOT_CONFIGURED' as MediaErrorCode, more: false };
    let page: SocialProfile;
    try { page = await deps.api.list(profileUrl(src.key, src.platform), null, 12, r.nextCursor); } catch (e) {
      if (!(e instanceof MediaApiError)) throw e;
      // Instagram sin sesión no da más; un cursor que ya no vale, tampoco: no se reintenta.
      if (e.code === 'LOGIN_REQUIRED' || e.code === 'INVALID_CURSOR') {
        const done: Cached = { ...r, noMore: true };
        await deps.cache.put(s.tenantId, src.key, done).catch(() => undefined);
        return { ok: false as const, code: e.code === 'LOGIN_REQUIRED' ? 'NO_MORE_PAGES' as const : e.code, more: false };
      }
      if (e.code === 'INVALID_API_KEY') console.error('[social] la clave de la API de medios no vale (CONVERT_API_KEY)');
      const later = e.code === 'UPSTREAM_UNAVAILABLE' || e.code === 'RATE_LIMITED';
      return { ok: false as const, code: e.code, more: later, retryAfter: later ? e.retryAfter ?? 60 : null };
    }
    const seen = new Set(r.posts.map((p) => p.url));
    const add = slim(page.posts.filter((p) => !seen.has(p.url))).slice(0, MAX_POSTS - r.posts.length);
    const merged: Cached = { ...r, posts: [...r.posts, ...add], nextCursor: page.nextCursor ?? null, noMore: !page.nextCursor || (!add.length && !page.posts.length) };
    await deps.cache.put(s.tenantId, src.key, merged).catch((e) => console.warn('[social] caché', e instanceof Error ? e.message : e));
    return { ok: true as const, posts: add.map((p, k) => viewOf(id, src.key, p, r.posts.length + k)), more: hasMore(merged) };
  }

  /** Trae una publicación como foto o vídeo. Devuelve el estado del editor o el motivo por el que no se pudo. */
  async function importPost(id: string, input: { key?: unknown; index?: unknown; url?: unknown; link?: unknown; kind?: unknown }) {
    const { st, sources } = await dossier(id);
    let postUrl: string;
    if (input.link !== undefined) {
      // Una publicación pegada a mano (de las que no salen en las 12 últimas): solo enlaces de publicaciones sueltas.
      const link = postLink(input.link);
      if (!link) return { ok: false as const, code: 'INVALID_URL' as MediaErrorCode };
      postUrl = link;
    } else {
      const src = sources.find((x) => x.key === input.key);
      if (!src) throw new AdminError(422, 'Datos no válidos');
      const r = await listing(src.key, src.platform).catch((e) => { if (e instanceof MediaApiError) return e; throw e; });
      if (r instanceof MediaApiError) return { ok: false as const, code: r.code };
      // Por su enlace (si el listado se ha renovado, las posiciones pueden cambiar); si no, por su posición.
      const post = r.posts.find((p) => p.url === input.url) ?? (Number.isInteger(Number(input.index)) ? r.posts[Number(input.index)] : undefined);
      if (!post) return { ok: false as const, code: 'NOT_AVAILABLE' as MediaErrorCode };
      postUrl = post.url;
    }
    if (!deps.api) return { ok: false as const, code: 'NOT_CONFIGURED' as MediaErrorCode };
    let items: MediaItem[];
    try { items = await deps.api.download(postUrl); } catch (e) {
      if (e instanceof MediaApiError) return { ok: false as const, code: e.code };
      throw e;
    }
    // «auto» (enlace pegado): un vídeo va como vídeo si aún no hay; si no, su foto.
    const hasVideo = !!st.dossier.clientMedia?.video;
    const kind: 'photo' | 'video' = input.kind === 'video' ? 'video' : input.kind === 'auto'
      ? (items[0]?.type === 'video' && !hasVideo) || !items.some((x) => x.type === 'image') ? 'video' : 'photo' : 'photo';
    const max = kind === 'video' ? VIDEO_MAX : PHOTO_MAX;
    // Del carrusel, la primera foto (o el primer vídeo); lo que pase del tamaño de la propuesta no vale.
    const wanted = items.filter((x) => x.type === (kind === 'video' ? 'video' : 'image'));
    if (!wanted.length) return { ok: false as const, code: 'NO_MEDIA' as MediaErrorCode };
    const item = wanted.find((x) => x.size == null || x.size <= max);
    if (!item) return { ok: false as const, code: 'FILE_TOO_LARGE' as MediaErrorCode };
    let file: { bytes: Uint8Array; type: string | null };
    try { file = await deps.fetchFile(item.url, max); } catch (e) {
      return { ok: false as const, code: (e instanceof MediaApiError ? e.code : 'DOWNLOAD_FAILED') as MediaErrorCode };
    }
    const type = mimeOf(item, file.type);
    if (!type) return { ok: false as const, code: 'UNSUPPORTED' as const };
    // Las mismas comprobaciones que una subida a mano (permiso, tipo, tamaño, 8 fotos como mucho) y a su carpeta.
    const signed = await admin.service.media.sign(id, { kind, type, size: file.bytes.length });
    await deps.put(signed.uploadUrl, signed.headers ?? {}, type, file.bytes);
    await admin.service.media.attach(id, { kind, url: signed.publicUrl });
    return { ok: true as const, state: await admin.service.getState(id) };
  }

  /** La miniatura de una publicación listada (pasa por aquí: Instagram no deja enseñarlas desde otra web). */
  async function thumb(key: string, index: number) {
    // Solo lo ya listado en este espacio (la RLS de la caché deja leer solo al equipo del espacio).
    if (!/^(instagram|tiktok):[a-z0-9._]{1,40}$/.test(key) || !Number.isInteger(index)) return null;
    const hit = await deps.cache.get(s.tenantId, key).catch(() => null);
    const t = hit?.result.posts[index]?.thumbnail;
    return t && /^https:\/\//.test(t) ? t : null;
  }

  return { list, more, importPost, thumb };
}
export type SocialService = ReturnType<typeof createSocialService>;
