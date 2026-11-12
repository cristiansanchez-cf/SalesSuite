/**
 * Lo que necesita «Traer de sus redes» en el servidor: la API de medios (CONVERT_API_KEY; MEDIA_API_URL si cambia la
 * dirección), la caché de perfiles listados y la descarga y subida de archivos. En demo sin clave, unas publicaciones de
 * ejemplo (sin salir a internet).
 */
import type { AdminContext } from '../admin/auth';
import { env } from '../env';
import { appMode } from '../mode';
import { FIXTURE_BYTES, fixtureMediaApi, httpMediaApi, MediaApiError, type MediaApi, type SocialProfile } from './media-api';
import { createSocialService, type SocialCache, type SocialDeps } from './service';

export const MEDIA_API_DEFAULT = 'https://pdf-compressor-703586002564.europe-west1.run.app';
export const socialConfigured = () => !!env('CONVERT_API_KEY') || appMode() === 'demo';

function apiFromEnv(): MediaApi | null {
  const key = env('CONVERT_API_KEY');
  if (key) return httpMediaApi({ base: env('MEDIA_API_URL') || MEDIA_API_DEFAULT, key });
  return appMode() === 'demo' ? fixtureMediaApi() : null;
}

const DEMO_CACHE: Map<string, { result: SocialProfile; fetchedAt: string }> = ((globalThis as { __socialCache?: Map<string, { result: SocialProfile; fetchedAt: string }> }).__socialCache ??= new Map());
export const demoSocialCache: SocialCache = {
  async get(t, k) { return structuredClone(DEMO_CACHE.get(`${t}|${k}`) ?? null); },
  async put(t, k, r) { DEMO_CACHE.set(`${t}|${k}`, { result: structuredClone(r), fetchedAt: new Date().toISOString() }); },
};
export function resetDemoSocialCache() { DEMO_CACHE.clear(); }

/** Los enlaces de descarga son de Storage de Google; nada más (el servidor no descarga de cualquier sitio). */
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)?storage\.googleapis\.com\//i;
export async function fetchFile(url: string, max: number, f: typeof fetch = fetch): Promise<{ bytes: Uint8Array; type: string | null }> {
  if (url.startsWith('https://storage.test/') && appMode() === 'demo') return { bytes: url.endsWith('.mp4') ? FIXTURE_BYTES.video : FIXTURE_BYTES.image, type: null };
  if (!ALLOWED.test(url)) throw new MediaApiError('DOWNLOAD_FAILED', 0);
  const r = await f(url, { redirect: 'error' });
  if (!r.ok || !r.body) throw new MediaApiError('DOWNLOAD_FAILED', r.status);
  if (Number(r.headers.get('content-length') ?? 0) > max) throw new MediaApiError('FILE_TOO_LARGE', 413);
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); throw new MediaApiError('FILE_TOO_LARGE', 413); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out, type: r.headers.get('content-type') };
}

export async function put(uploadUrl: string, headers: Record<string, string>, type: string, bytes: Uint8Array) {
  if (uploadUrl.startsWith('/demo-media/')) {
    const { demoMediaPut } = await import('../admin/db-demo');
    if (!demoMediaPut(uploadUrl.slice('/demo-media/'.length), type, bytes)) throw new Error('demo-media');
    return;
  }
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { ...headers, 'content-type': type }, body: new Blob([bytes as BlobPart], { type }) });
  if (!r.ok) throw new Error(`[storage] subida: ${r.status}`);
}

function supabaseCache(admin: AdminContext): SocialCache {
  const sb = admin.supabase!;
  return {
    async get(t, k) {
      const { data, error } = await sb.from('social_profile_cache').select('result, fetched_at').eq('tenant_id', t).eq('profile', k).maybeSingle();
      if (error) throw new Error(`[supabase] ${error.message}`);
      return data ? { result: data.result as SocialProfile, fetchedAt: data.fetched_at as string } : null;
    },
    async put(t, k, r) {
      const { error } = await sb.from('social_profile_cache').upsert({ tenant_id: t, profile: k, result: r, fetched_at: new Date().toISOString() }, { onConflict: 'tenant_id,profile' });
      if (error) throw new Error(`[supabase] ${error.message}`);
    },
  };
}

/** Las miniaturas solo de los servidores de imágenes de Instagram y TikTok. */
export const THUMB_HOST = /^https:\/\/[a-z0-9.-]*\b(cdninstagram\.com|fbcdn\.net|tiktokcdn(-[a-z]+)?\.com|ibyteimg\.com|muscdn\.com)\//i;

export function socialFor(admin: AdminContext, over: Partial<SocialDeps> = {}) {
  const cache = admin.mode === 'supabase' && admin.supabase ? supabaseCache(admin) : demoSocialCache;
  return createSocialService(admin, { api: apiFromEnv(), cache, fetchFile: (u, m) => fetchFile(u, m), put, ...over });
}
