import type { APIRoute } from 'astro';
import { cookieBase } from '~/lib/admin/auth';
import { HOME_COOKIE, homePath } from '~/lib/admin/home';

/** Al entrar en un espacio (login, cambiar de espacio, acceso general, el logo): su pantalla de inicio (el CRM). */
export const GET: APIRoute = ({ locals, redirect, cookies, url }) => {
  if (!locals.admin) return redirect('/admin/login', 302);
  cookies.set(HOME_COOKIE, '1', cookieBase(url)); // de sesión: hasta cerrar el navegador
  return redirect(homePath(locals.admin.session.role), 302);
};
