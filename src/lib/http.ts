import { env } from './env';

/**
 * Host/origen reales de la petición. Detrás de un proxy/CDN (Vercel, Cloud Run, Cloudflare for SaaS)
 * el host original llega en X-Forwarded-Host: solo se usa si TRUST_FORWARDED_HOST=1.
 * (Astro.url no sirve: con el adapter Node refleja el host interno, no el dominio del tenant.)
 */
export function requestHost(req: Request, fallback = ''): string {
  const fwd = env('TRUST_FORWARDED_HOST') === '1' ? req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() : null;
  return (fwd || req.headers.get('host') || fallback).toLowerCase();
}

export function requestOrigin(req: Request, fallbackUrl: URL): string {
  const proto = env('TRUST_FORWARDED_HOST') === '1' ? req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() : null;
  return `${proto || fallbackUrl.protocol.replace(':', '')}://${requestHost(req, fallbackUrl.host)}`;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: toda petición con efectos debe venir del mismo host que sirve la página.
 * Origin manda; si el navegador no lo envía, se acepta solo Sec-Fetch-Site: same-origin.
 */
export function isSameOriginWrite(req: Request, host: string): boolean {
  if (SAFE.has(req.method)) return true;
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null') {
    try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin';
}
