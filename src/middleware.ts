import { defineMiddleware } from 'astro:middleware';
import { authenticate } from './lib/admin/auth';
import { publicRepository } from './lib/data';
import { env } from './lib/env';
import { isSameOriginWrite, requestHost } from './lib/http';
import { resolveTenant } from './lib/tenant';

// Falsear el Host solo cambia qué tenant se resuelve; el RPC exige que el token sea de ese tenant
// y la sesión de consola exige membership en ese tenant.

/** Rutas de /admin accesibles sin sesión. */
const ADMIN_PUBLIC = new Set(['/admin/login', '/admin/auth/callback', '/admin/forbidden']);

export const onRequest = defineMiddleware(async (context, next) => {
  const host = requestHost(context.request, context.url.host);
  if (!isSameOriginWrite(context.request, host)) {
    return new Response('Origen no permitido', { status: 403 });
  }

  context.locals.tenant ??= await resolveTenant(publicRepository(), host, {
    devTenantSlug: env('DEV_TENANT_SLUG'),
  });
  context.locals.admin ??= null;

  const path = context.url.pathname.replace(/\/$/, '') || '/';
  const isAdmin = path === '/admin' || path.startsWith('/admin/');

  if (isAdmin && !context.locals.tenant) return context.rewrite('/404');

  if (isAdmin && !ADMIN_PUBLIC.has(path) && context.locals.tenant && !context.locals.admin) {
    const auth = await authenticate(context, context.locals.tenant);
    if (auth.kind === 'anonymous') {
      if (path.startsWith('/admin/api/')) return Response.json({ error: 'No autenticado' }, { status: 401 });
      return context.redirect(`/admin/login?next=${encodeURIComponent(context.url.pathname + context.url.search)}`);
    }
    if (auth.kind === 'forbidden') {
      if (path.startsWith('/admin/api/')) return Response.json({ error: 'Sin acceso a este tenant' }, { status: 403 });
      context.locals.forbiddenEmail = auth.email;
      return context.rewrite('/admin/forbidden');
    }
    context.locals.admin = auth.admin;
  }

  const res = await next();

  if (path.startsWith('/d/') || isAdmin) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Cache-Control', 'private, no-store');
  }
  if (isAdmin) res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
});
