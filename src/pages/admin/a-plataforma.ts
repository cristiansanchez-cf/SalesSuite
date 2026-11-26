import type { APIRoute } from 'astro';
import { platformUrl } from '~/lib/hub';
import { requestOrigin } from '~/lib/http';

/**
 * «Superadmin» (menú de la cuenta): el panel de la plataforma se sirve en el acceso general (ventas.cofundo.io), no
 * dentro de un espacio. Desde aquí se va allí con un enlace de un solo uso, sin volver a entrar.
 */
export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin?.session.superadmin) return ctx.redirect('/admin/home', 303);
  const next = ctx.url.searchParams.get('next') ?? '/admin/platform';
  return ctx.redirect(await platformUrl({ id: admin.session.userId, email: admin.session.email }, requestOrigin(ctx.request, ctx.url), next), 303);
};
