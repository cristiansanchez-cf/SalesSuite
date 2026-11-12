/**
 * La captura de su web para la propuesta (docs/PERSONALIZE.md §Su web): la página de inicio del cliente, como se ve en
 * un portátil (1440×900), para ponerla en el dossier (p. ej. el sello de SciScreen encima, módulo site-verify).
 *
 * El navegador que la abre es un servicio externo (Microlink: sin clave, unas 50 al día; con MICROLINK_API_KEY, las del
 * plan). Solo recibe la dirección pública de la web, nada del CRM. La imagen se descarga de su CDN y se sube a la carpeta
 * de la propuesta, igual que una subida a mano. Sin red (demo), una web de ejemplo.
 */
import { env } from '../env';
import { appMode } from '../mode';
import type { AdminContext } from '../admin/auth';
import { AdminError } from '../admin/service';
import { meterUnits } from '../usage/meter';

export type ShotErrorCode = 'INVALID_URL' | 'RATE_LIMITED' | 'FAILED' | 'TIMEOUT' | 'TOO_LARGE' | 'NOT_CONFIGURED';
export class ShotError extends Error {
  constructor(public code: ShotErrorCode, public status = 0) { super(code); }
}

/**
 * De lo que haya en el CRM («sorianatural.es», «www.x.com/tienda», «https://x.com») a una dirección que se pueda abrir:
 * solo http(s), con dominio de verdad (nada de IP, localhost ni nombres internos), sin usuario ni contraseña. null si no.
 */
export function siteAddress(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.length > 500 || /\s/.test(v)) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h) || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
  u.hash = '';
  return u.toString();
}
/** Para la barra del navegador del dossier: «sorianatural.es/tienda» (sin https ni www ni la barra final). */
export const shortAddress = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

export interface ShotProvider { shoot(url: string): Promise<{ imageUrl: string }> }

/** El CDN de Microlink: de ahí (y solo de ahí) se descarga la captura. */
export const SHOT_HOST = /^https:\/\/([a-z0-9-]+\.)*microlink\.io\//i;

export function microlink(o: { key?: string | null; fetch?: typeof fetch; timeoutMs?: number } = {}): ShotProvider {
  const f = o.fetch ?? fetch;
  return {
    async shoot(url) {
      const base = o.key ? 'https://pro.microlink.io' : 'https://api.microlink.io';
      const q = new URLSearchParams({
        url, screenshot: 'true', meta: 'false', 'viewport.width': '1440', 'viewport.height': '900', 'viewport.deviceScaleFactor': '1',
        waitUntil: 'networkidle2', adblock: 'true',
      });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 45_000);
      try {
        const r = await f(`${base}/?${q}`, { headers: o.key ? { 'x-api-key': o.key } : {}, signal: ctl.signal });
        const data = (await r.json().catch(() => ({}))) as { status?: string; code?: string; data?: { screenshot?: { url?: string } } };
        if (r.status === 429 || data.code === 'ERATELIMIT') throw new ShotError('RATE_LIMITED', 429);
        if (data.code === 'EINVALURL' || data.code === 'EBADURL') throw new ShotError('INVALID_URL', r.status);
        const img = data.data?.screenshot?.url;
        if (!r.ok || data.status !== 'success' || !img || !SHOT_HOST.test(img)) throw new ShotError('FAILED', r.status);
        return { imageUrl: img };
      } catch (e) {
        if (e instanceof ShotError) throw e;
        throw new ShotError(ctl.signal.aborted ? 'TIMEOUT' : 'FAILED');
      } finally { clearTimeout(timer); }
    },
  };
}

/** Demo (sin red): una web de ejemplo, que se sirve desde la propia app. */
export const DEMO_SHOT = '/demo/web-ejemplo.jpg';
export function fixtureProvider(): ShotProvider {
  return { async shoot(url) { if (url.includes('noexiste')) throw new ShotError('FAILED', 502); return { imageUrl: `https://shots.test${DEMO_SHOT}` }; } };
}

export function shotProvider(): ShotProvider | null {
  if (appMode() === 'demo' && !env('MICROLINK_API_KEY') && env('SITE_SHOT_LIVE') !== '1') return fixtureProvider();
  if (env('SITE_SHOT') === 'off') return null;
  return microlink({ key: env('MICROLINK_API_KEY') ?? null });
}

/** Descarga la captura (solo del CDN del servicio; en demo, la de ejemplo de la app) con tope de tamaño. */
export async function fetchShot(imageUrl: string, max: number, o: { origin: string; fetch?: typeof fetch }): Promise<{ bytes: Uint8Array; type: string }> {
  const f = o.fetch ?? fetch;
  const demo = imageUrl.startsWith('https://shots.test/') && appMode() === 'demo';
  if (!demo && !SHOT_HOST.test(imageUrl)) throw new ShotError('FAILED');
  // En local, el servidor no resuelve *.localhost: el archivo de ejemplo es el mismo para todos los espacios.
  const self = (() => { const u = new URL(o.origin); if (u.hostname.endsWith('.localhost')) u.hostname = '127.0.0.1'; return u.origin; })();
  const r = await f(demo ? `${self}${new URL(imageUrl).pathname}` : imageUrl, { redirect: demo ? 'follow' : 'error' });
  if (!r.ok) throw new ShotError('FAILED', r.status);
  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new ShotError('FAILED', 415);
  if (Number(r.headers.get('content-length') ?? 0) > max) throw new ShotError('TOO_LARGE', 413);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > max) throw new ShotError('TOO_LARGE', 413);
  return { bytes: buf, type };
}

export interface CaptureDeps {
  provider: ShotProvider | null;
  /** La dirección de esta app (en demo, de aquí sale la web de ejemplo). */
  origin: string;
  fetch?: typeof fetch;
  /** Sube los bytes a la URL firmada de la propuesta (social/server.ts → put). */
  put(uploadUrl: string, headers: Record<string, string>, type: string, bytes: Uint8Array): Promise<void>;
}
const MAX_SHOT = 8 * 1024 * 1024;

/**
 * Captura su web y la deja en la propuesta como «Su web» (con la dirección, para la barra del navegador). Un fallo no
 * rompe nada: se devuelve el motivo y se puede subir la captura a mano.
 */
export async function captureSite(admin: AdminContext, dossierId: string, input: { url?: unknown }, deps: CaptureDeps) {
  const st = await admin.service.getState(dossierId);
  if (!st.canEdit) throw new AdminError(403, 'Solo quien hizo la propuesta (o un responsable) la personaliza');
  const address = siteAddress(input.url);
  if (!address) return { ok: false as const, code: 'INVALID_URL' as ShotErrorCode };
  if (!deps.provider) return { ok: false as const, code: 'NOT_CONFIGURED' as ShotErrorCode };
  try {
    const shot = await deps.provider.shoot(address);
    await meterUnits('site.shot', 'media', 1).catch(() => undefined);
    const file = await fetchShot(shot.imageUrl, MAX_SHOT, { origin: deps.origin, fetch: deps.fetch });
    const signed = await admin.service.media.sign(dossierId, { kind: 'site', type: file.type, size: file.bytes.length });
    await deps.put(signed.uploadUrl, signed.headers ?? {}, file.type, file.bytes);
    await admin.service.media.attach(dossierId, { kind: 'site', url: signed.publicUrl, address });
    return { ok: true as const, state: await admin.service.getState(dossierId) };
  } catch (e) {
    if (e instanceof ShotError) {
      if (e.code !== 'INVALID_URL') console.warn('[site-shot]', e.code, e.status);
      return { ok: false as const, code: e.code };
    }
    throw e;
  }
}
