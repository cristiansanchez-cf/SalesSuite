import { LOCALE_COOKIE } from './lib/i18n';
import { resolveLocale } from './lib/i18n/core';
import { withRequestLocale } from './lib/i18n/request';
import { defineMiddleware } from 'astro:middleware';
import { authenticate } from './lib/admin/auth';
import { publicRepository } from './lib/data';
import { env } from './lib/env';
import { isSameOriginWrite, requestHost } from './lib/http';
import { appMode } from './lib/mode';
import { resolveTenant } from './lib/tenant';
import { noteTeamNetwork } from './lib/analytics/internal';
import { serverTiming } from './lib/timing';
import { isSetupPath, onboardedAt } from './lib/onboarding';
import { can } from './lib/admin/permissions';

// Falsear el Host solo cambia qué tenant se resuelve; el RPC exige que el token sea de ese tenant
// y la sesión de consola exige membership en ese tenant.

/** Rutas de /admin accesibles sin sesión. */
const ADMIN_PUBLIC = new Set(['/admin/login', '/admin/auth/callback', '/admin/auth/confirm', '/admin/forbidden']);

const MISCONFIGURED_HTML = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Configuración pendiente</title><body style="font-family:system-ui;max-width:36rem;margin:15vh auto;padding:0 1rem">
<h1>Configuración pendiente</h1><p>Faltan variables de entorno de Supabase. Detalle en <code>/api/health</code>; guía en <code>docs/SETUP.md</code>.</p>`;

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname === '/api/health') return next();
  if (appMode() === 'misconfigured') {
    return new Response(MISCONFIGURED_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '300' } });
  }

  // API pública de ingresos: se autentica con clave (Bearer), no con cookies; el CSRF no aplica (docs/COMMISSIONS.md).
  if (context.url.pathname.startsWith('/api/v1/')) return next();

  const host = requestHost(context.request, context.url.host);
  if (!isSameOriginWrite(context.request, host)) {
    return new Response('Origen no permitido', { status: 403 });
  }

  const timing = serverTiming();
  context.locals.tenant ??= await resolveTenant(publicRepository(), host, {
    devTenantSlug: env('DEV_TENANT_SLUG'),
    // Demo pública (p. ej. demo-ventas.cofundo.io): sin Supabase y con DEMO_MODE=1 explícito.
    demoAnyHost: appMode() === 'demo' && env('DEMO_MODE') === '1',
  });
  context.locals.admin ??= null;
  timing.mark('tenant');

  const path = context.url.pathname.replace(/\/$/, '') || '/';
  // Bloques que la consola carga después (server islands, con su shimmer): misma sesión y mismo idioma que la consola.
  const isIsland = path.startsWith('/_server-islands/');
  const isAdmin = path === '/admin' || path.startsWith('/admin/') || isIsland;

  if (isAdmin && !context.locals.tenant) return context.rewrite('/404');

  if (isAdmin && !ADMIN_PUBLIC.has(path) && context.locals.tenant && !context.locals.admin) {
    const auth = await authenticate(context, context.locals.tenant);
    if (auth.kind === 'anonymous') {
      if (path.startsWith('/admin/api/') || isIsland) return Response.json({ error: 'No autenticado' }, { status: 401 });
      return context.redirect(`/admin/login?next=${encodeURIComponent(context.url.pathname + context.url.search)}`);
    }
    if (auth.kind === 'forbidden') {
      if (path.startsWith('/admin/api/') || isIsland) return Response.json({ error: 'Sin acceso a este tenant' }, { status: 403 });
      context.locals.forbiddenEmail = auth.email;
      if (auth.reason === 'partner-expired') context.locals.forbiddenReason = { kind: 'partner-expired', expiresAt: auth.expiresAt ?? null };
      return context.rewrite('/admin/forbidden');
    }
    context.locals.admin = auth.admin;
  }
  timing.mark('auth');

  // La primera vez en un espacio (docs/FOUNDATIONS.md §4.1): al entrar, la bienvenida; la primera vez en Configurar (admins),
  // la bienvenida de Configurar. Se mira una vez por navegador (cookie por espacio) y solo con acceso real (en la demo y en
  // los smokes se entra a mano por /admin/welcome y /admin/setup/welcome).
  const admin0 = context.locals.admin;
  if (admin0 && admin0.mode === 'supabase' && !admin0.session.superadmin && context.request.method === 'GET' && !isIsland && !path.startsWith('/admin/api/')) {
    const tid = admin0.session.tenantId;
    const once = { path: '/admin', maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax' as const, secure: context.url.protocol === 'https:' };
    const landing = path === '/admin' || path === '/admin/inicio' || path === '/admin/start';
    const wk = `ss_wel_${tid.slice(0, 8)}`;
    if (landing && !context.url.searchParams.size && context.cookies.get(wk)?.value !== '1') {
      context.cookies.set(wk, '1', once);
      if (!(await onboardedAt(admin0).catch(() => 'x'))) return context.redirect('/admin/welcome');
    }
    const ck = `ss_cfg_${tid.slice(0, 8)}`;
    if (can(admin0.session.role).configure && isSetupPath(path) && context.cookies.get(ck)?.value !== '1') {
      context.cookies.set(ck, '1', once);
      if (!(await onboardedAt(admin0, 'setup').catch(() => 'x'))) return context.redirect(`/admin/setup/welcome?next=${encodeURIComponent(path)}`);
    }
  }

  // Idioma (docs/I18N.md): preferencia guardada → cookie → navegador → idioma del espacio → español.
  if (isAdmin) {
    const admin = context.locals.admin;
    const [saved] = await Promise.all([
      admin ? admin.notifications.locale().catch(() => null) : null,
      // Red del equipo: sus aperturas del enlace público no cuentan (docs/ANALYTICS.md §Internas).
      admin && context.locals.tenant && context.request.method === 'GET' ? noteTeamNetwork(admin, context.request, context.locals.tenant.id) : null,
    ]);
    context.locals.locale = resolveLocale({
      user: saved, cookie: context.cookies.get(LOCALE_COOKIE)?.value, tenant: context.locals.tenant?.defaultLocale, accept: context.request.headers.get('accept-language'),
    });
  }

  timing.mark('prep');
  // Los errores del servidor salen en el idioma de quien lee (src/lib/i18n/errors.ts).
  const res = context.locals.locale ? await withRequestLocale(context.locals.locale, next) : await next();
  timing.mark('page');
  // Cuánto tarda cada parte (DevTools → Network → Timing) y aviso en los registros si una página va lenta.
  res.headers.set('Server-Timing', timing.header());
  if (timing.total() > 1500) console.warn(`[lento] ${context.request.method} ${path} ${timing.header()}`);

  if (path.startsWith('/d/') || isAdmin) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Cache-Control', 'private, no-store');
  }
  if (isAdmin) res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
});
