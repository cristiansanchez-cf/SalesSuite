/**
 * Fotos y vídeos del Instagram o TikTok del cliente para su propuesta (docs/PERSONALIZE.md §Traer de sus redes).
 * Cliente de la API interna de medios (InternalApps, docs/API.md): `media-list` (las publicaciones de un perfil) y
 * `media-download` (los archivos de una publicación, con enlaces que caducan en 1 hora).
 *
 * Reglas de la API (si no, Instagram bloquea): una petición cada vez, nunca en paralelo; 2-3 s entre descargas; no listar
 * el mismo perfil dos veces en una hora (caché en social.ts); pedir solo lo que se va a usar.
 * La clave va en X-API-Key (CONVERT_API_KEY); nunca Origin ni Authorization, nunca en los registros.
 */
export type SocialPlatform = 'instagram' | 'tiktok';
export type PostType = 'image' | 'video' | 'carousel';
export interface SocialPost {
  url: string; shortcode: string | null; type: PostType; itemCount: number | null; takenAt: string | null; pinned: boolean | null;
  caption: string | null; thumbnail: string | null; likes: number | null; comments: number | null; views: number | null;
}
export interface SocialProfile { platform: SocialPlatform; username: string; fullName: string | null; followers: number | null; posts: SocialPost[] }
export interface MediaItem { name: string; type: 'image' | 'video'; size: number | null; url: string }

/** Los códigos de la API (y los nuestros: TIMEOUT, NOT_CONFIGURED). */
export type MediaErrorCode =
  | 'INVALID_URL' | 'INVALID_PROFILE' | 'PROFILE_PRIVATE' | 'PROFILE_NOT_FOUND' | 'NOT_AVAILABLE' | 'NO_MEDIA' | 'LOGIN_REQUIRED'
  | 'FILE_TOO_LARGE' | 'RATE_LIMITED' | 'INVALID_API_KEY' | 'DOWNLOAD_FAILED' | 'LIST_FAILED' | 'SERVER_ERROR' | 'TIMEOUT' | 'NOT_CONFIGURED';
export class MediaApiError extends Error {
  constructor(public code: MediaErrorCode, public status: number, public retryAfter: number | null = null) { super(code); }
}

export interface MediaApi {
  list(profile: string, platform?: SocialPlatform | null, limit?: number): Promise<SocialProfile>;
  download(url: string): Promise<MediaItem[]>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 2000) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const TYPES: PostType[] = ['image', 'video', 'carousel'];
export function parseProfile(raw: unknown): SocialProfile {
  const o = (raw ?? {}) as Record<string, unknown>;
  const posts = (Array.isArray(o.posts) ? o.posts : []).flatMap((p): SocialPost[] => {
    const x = (p ?? {}) as Record<string, unknown>;
    const url = str(x.url, 500);
    if (!url || !/^https:\/\//.test(url) || !TYPES.includes(x.type as PostType)) return [];
    return [{
      url, shortcode: str(x.shortcode, 100), type: x.type as PostType, itemCount: num(x.item_count), takenAt: str(x.taken_at, 40),
      pinned: typeof x.pinned === 'boolean' ? x.pinned : null, caption: str(x.caption, 600), thumbnail: str(x.thumbnail, 2000),
      likes: num(x.likes), comments: num(x.comments), views: num(x.views),
    }];
  });
  return { platform: o.platform === 'tiktok' ? 'tiktok' : 'instagram', username: str(o.username, 100) ?? '', fullName: str(o.full_name, 200), followers: num(o.followers), posts };
}
export function parseItems(raw: unknown): MediaItem[] {
  const o = (raw ?? {}) as Record<string, unknown>;
  return (Array.isArray(o.items) ? o.items : []).flatMap((i): MediaItem[] => {
    const x = (i ?? {}) as Record<string, unknown>;
    const url = str(x.url, 4000);
    if (!url || !/^https:\/\//.test(url) || (x.type !== 'image' && x.type !== 'video')) return [];
    return [{ name: str(x.name, 200) ?? '', type: x.type, size: num(x.size), url }];
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Una petición cada vez en esta instancia del servidor (la API no admite llamadas en paralelo). */
let chain: Promise<unknown> = Promise.resolve();
let lastDownload = 0;
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

export function httpMediaApi(o: { base: string; key: string; fetch?: typeof fetch; gapMs?: number; timeoutMs?: number }): MediaApi {
  const f = o.fetch ?? fetch;
  const gap = o.gapMs ?? 2500;
  async function once(path: string, body: unknown): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 60_000);
    try {
      const r = await f(`${o.base.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.key }, body: JSON.stringify(body), signal: ctl.signal });
      const data = (await r.json().catch(() => ({}))) as { code?: string };
      if (r.ok) return data;
      const code = (typeof data.code === 'string' ? data.code : r.status >= 500 ? 'SERVER_ERROR' : 'INVALID_URL') as MediaErrorCode;
      const ra = Number(r.headers.get('retry-after'));
      throw new MediaApiError(code, r.status, Number.isFinite(ra) && ra > 0 ? ra : null);
    } catch (e) {
      if (e instanceof MediaApiError) throw e;
      throw new MediaApiError(ctl.signal.aborted ? 'TIMEOUT' : 'SERVER_ERROR', 0);
    } finally { clearTimeout(timer); }
  }
  /** Reintentos de la API: RATE_LIMITED tras Retry-After (como mucho 20 s); 500 / *_FAILED una vez tras unos segundos. */
  async function call(path: string, body: unknown): Promise<unknown> {
    try { return await once(path, body); } catch (e) {
      if (!(e instanceof MediaApiError)) throw e;
      if (e.code === 'RATE_LIMITED' && (e.retryAfter ?? 5) <= 20) { await sleep((e.retryAfter ?? 5) * 1000); return once(path, body); }
      if (['SERVER_ERROR', 'DOWNLOAD_FAILED', 'LIST_FAILED', 'TIMEOUT'].includes(e.code)) { await sleep(3000); return once(path, body); }
      throw e;
    }
  }
  return {
    list: (profile, platform, limit = 12) => serial(async () =>
      parseProfile(await call('/api/media-list', { profile, ...(platform ? { platform } : {}), limit: Math.max(1, Math.min(12, limit)) }))),
    download: (url) => serial(async () => {
      const wait = lastDownload + gap - Date.now();
      if (wait > 0) await sleep(wait);
      try { return parseItems(await call('/api/media-download', { url })); } finally { lastDownload = Date.now(); }
    }),
  };
}

// ---------------------------------------------------------------- Elegir

export interface Wanted { photos: number; videos: number }
const engagement = (p: SocialPost) => (p.type === 'video' && p.views != null ? p.views : (p.likes ?? 0) + (p.comments ?? 0));
/** Las fijadas primero; después por engagement (likes + comentarios, o reproducciones en vídeo); a igualdad, la más reciente. */
export function rank(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || engagement(b) - engagement(a) || (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
}
/** Qué publicaciones traer: fotos de las de tipo image o carousel, vídeos de las de tipo video. */
export function pickPosts(posts: SocialPost[], want: Wanted): { photos: SocialPost[]; videos: SocialPost[] } {
  const r = rank(posts);
  return { photos: r.filter((p) => p.type !== 'video').slice(0, Math.max(0, want.photos)), videos: r.filter((p) => p.type === 'video').slice(0, Math.max(0, want.videos)) };
}

// ---------------------------------------------------------------- El enlace del CRM

/** De lo que haya en el CRM (enlace, @usuario o usuario) a lo que pide la API. null si no vale. */
export function profileRef(raw: string | null | undefined, platform: SocialPlatform): { profile: string; platform: SocialPlatform | null; key: string } | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const url = /^https?:\/\//i.test(v) ? v : /^(www\.)?(instagram\.com|tiktok\.com)\//i.test(v) ? `https://${v}` : null;
  if (url) {
    const m = /^https?:\/\/(?:www\.|m\.)?(instagram\.com|tiktok\.com)\/(@?[A-Za-z0-9._]{1,40})/i.exec(url);
    if (!m) return null;
    const p: SocialPlatform = m[1].toLowerCase().startsWith('tiktok') ? 'tiktok' : 'instagram';
    const user = m[2].replace(/^@/, '').toLowerCase();
    if (['p', 'reel', 'reels', 'stories', 'explore', 'video'].includes(user)) return null;
    return { profile: p === 'tiktok' ? `https://www.tiktok.com/@${user}` : `https://www.instagram.com/${user}/`, platform: null, key: `${p}:${user}` };
  }
  const user = v.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(user)) return null;
  return { profile: user, platform, key: `${platform}:${user}` };
}

// ---------------------------------------------------------------- Demo y pruebas

/** Un PNG de 1×1 (las pruebas no descargan nada de verdad). */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
export const FIXTURE_BYTES = { image: PNG, video: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]) };
const swatch = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${c}"/></svg>`)}`;
export function fixtureMediaApi(): MediaApi {
  const posts = (user: string): SocialPost[] => ([
    ['image', '#e11d48', true, 40, 2, null], ['video', '#7c3aed', false, 90, 9, 9000], ['carousel', '#0ea5e9', false, 300, 30, null],
    ['image', '#f59e0b', false, 15, 1, null], ['video', '#10b981', true, 20, 0, 1200], ['image', '#64748b', false, 120, 4, null],
  ] as const).map(([type, color, pinned, likes, comments, views], i) => ({
    url: `https://www.instagram.com/p/DEMO${i}${user}/`, shortcode: `DEMO${i}`, type, itemCount: type === 'carousel' ? 3 : 1,
    takenAt: new Date(Date.UTC(2026, 9, 30 - i)).toISOString(), pinned, caption: `Publicación de ejemplo ${i + 1}`, thumbnail: swatch(color), likes, comments, views,
  }));
  return {
    async list(profile, platform) {
      const ref = profileRef(profile, platform ?? 'instagram');
      if (!ref) throw new MediaApiError('INVALID_PROFILE', 400);
      const user = ref.key.split(':')[1];
      if (user.includes('privado')) throw new MediaApiError('PROFILE_PRIVATE', 403);
      return { platform: ref.key.startsWith('tiktok') ? 'tiktok' : 'instagram', username: user, fullName: user, followers: 1234, posts: posts(user) };
    },
    async download(url) {
      if (url.includes('DEMO3')) throw new MediaApiError('NOT_AVAILABLE', 404);
      const video = /DEMO[14]/.test(url);
      return video ? [{ name: 'instagram-01.mp4', type: 'video', size: FIXTURE_BYTES.video.length, url: `https://storage.test/${encodeURIComponent(url)}.mp4` }]
        : [{ name: 'instagram-01.png', type: 'image', size: FIXTURE_BYTES.image.length, url: `https://storage.test/${encodeURIComponent(url)}.png` }];
    },
  };
}
