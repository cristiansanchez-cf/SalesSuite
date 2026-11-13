import type { APIRoute } from 'astro';
import { cookieBase } from '~/lib/admin/auth';
import { enterUrl, HUB_LAST_COOKIE, hubUser } from '~/lib/hub';
import { requestOrigin } from '~/lib/http';

/**
 * Acceso general (docs/HUB.md): entrar en el espacio elegido. Solo uno de los tuyos (o cualquiera, si eres superadmin):
 * se abre sesión allí con un enlace de un solo uso para tu propio email y se entra directo.
 */
export const POST: APIRoute = async (ctx) => {
  if (!ctx.locals.hub) return ctx.redirect('/admin/home', 303);
  const user = await hubUser(ctx);
  if (!user) return ctx.redirect('/admin/login', 303);
  const id = String((await ctx.request.formData()).get('tenant') ?? '');
  const space = user.spaces.find((x) => x.id === id);
  if (!space) return ctx.redirect('/admin/elige', 303);
  const url = await enterUrl(user, space, requestOrigin(ctx.request, ctx.url));
  if (!url) return ctx.redirect('/admin/elige?error=host', 303);
  ctx.cookies.set(HUB_LAST_COOKIE, space.id, { ...cookieBase(ctx.url), maxAge: 60 * 60 * 24 * 365 });
  return ctx.redirect(url, 303);
};
