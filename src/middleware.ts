import { defineMiddleware } from 'astro:middleware';
import { publicRepository } from './lib/data';
import { env } from './lib/env';
import { resolveTenant } from './lib/tenant';

/**
 * Host real de la petición. Detrás de un proxy/CDN (Vercel, Cloud Run, Cloudflare for SaaS)
 * el host original llega en X-Forwarded-Host: solo se usa si TRUST_FORWARDED_HOST=1.
 * Falsear el Host solo cambia qué tenant se resuelve; el RPC exige que el token sea de ese tenant.
 */
function requestHost(req: Request, fallback: string): string {
  const fwd = env('TRUST_FORWARDED_HOST') === '1' ? req.headers.get('x-forwarded-host')?.split(',')[0] : null;
  return fwd || req.headers.get('host') || fallback;
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.tenant ??= await resolveTenant(publicRepository(), requestHost(context.request, context.url.host), {
    devTenantSlug: env('DEV_TENANT_SLUG'),
  });

  const res = await next();

  if (context.url.pathname.startsWith('/d/')) {
    // El token va en la URL: no indexar, no filtrar por Referer, no cachear en compartidas.
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Cache-Control', 'private, no-store');
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
});
