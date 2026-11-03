/**
 * Traer fotos y vídeos de su Instagram o TikTok a la propuesta (docs/PERSONALIZE.md §Traer de sus redes).
 * 1) list: las publicaciones del perfil que tiene la empresa en el CRM (caché de 1 hora por perfil y espacio) y una
 *    selección propuesta (las fijadas y las de más engagement).
 * 2) import: una publicación cada vez (el navegador espera 2-3 s entre una y otra): se descarga del enlace temporal de la
 *    API, se sube a la carpeta de la propuesta y se añade como foto o vídeo, igual que una subida a mano.
 * Un fallo no rompe nada: se devuelve el código y la propuesta sigue con lo que haya.
 */
import type { AdminContext } from '../admin/auth';
import { AdminError } from '../admin/service';
import { MediaApiError, pickPosts, profileRef, type MediaApi, type MediaErrorCode, type MediaItem, type SocialPlatform, type SocialPost, type SocialProfile } from './media-api';

export const CACHE_MS = 60 * 60_000;
export const PHOTO_MAX = 8 * 1024 * 1024;
export const VIDEO_MAX = 30 * 1024 * 1024;
export const MAX_PHOTOS = 8;

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
  /** El listado (de la caché si tiene menos de una hora). */
  async function listing(key: string, platform: SocialPlatform): Promise<SocialProfile> {
    const hit = await deps.cache.get(s.tenantId, key).catch(() => null);
    if (hit && now() - Date.parse(hit.fetchedAt) < CACHE_MS) return hit.result;
    if (!deps.api) throw new MediaApiError('NOT_CONFIGURED', 503);
    const user = key.split(':')[1];
    const profile = platform === 'tiktok' ? `https://www.tiktok.com/@${user}` : `https://www.instagram.com/${user}/`;
    const r = await deps.api.list(profile, null, 12);
    await deps.cache.put(s.tenantId, key, r).catch((e) => console.warn('[social] caché', e instanceof Error ? e.message : e));
    return r;
  }
  const thumbOf = (dossierId: string, key: string, p: SocialPost, i: number) =>
    !p.thumbnail ? null : p.thumbnail.startsWith('data:') ? p.thumbnail : `/admin/api/dossiers/${dossierId}/social?key=${encodeURIComponent(key)}&thumb=${i}`;

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
        posts: r.posts.map((p, i): PostView => ({ i, type: p.type, itemCount: p.itemCount, pinned: !!p.pinned, takenAt: p.takenAt, caption: p.caption?.slice(0, 160) ?? null,
          likes: p.likes, comments: p.comments, views: p.views, url: p.url, thumb: thumbOf(id, src.key, p, i) })),
        suggested: { photos: pick.photos.map(idx), videos: pick.videos.map(idx) },
      };
    } catch (e) {
      if (e instanceof MediaApiError) {
        if (e.code === 'INVALID_API_KEY' || e.code === 'NOT_CONFIGURED') console.error('[social] la clave de la API de medios no vale o falta (CONVERT_API_KEY)');
        return { ok: false as const, code: e.code, sources, platform: src.platform };
      }
      throw e;
    }
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

  return { list, importPost, thumb };
}
export type SocialService = ReturnType<typeof createSocialService>;
