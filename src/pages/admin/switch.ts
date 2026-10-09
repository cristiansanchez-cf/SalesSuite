import type { APIRoute } from 'astro';
import { cookieBase, DEMO_TENANT_COOKIE, serviceIdentity } from '~/lib/admin/auth';
import { mySpaces } from '~/lib/admin/spaces';

/**
 * Cambiar de espacio (abajo a la izquierda). Solo a un espacio en el que estás (o cualquiera, si eres superadmin).
 * - Producción: cada espacio vive en su dominio y la sesión es de ese dominio. Se abre sesión allí con un enlace de un
 *   solo uso para tu propio email (como un enlace mágico, sin email) y se entra directo. Sin service role: a su login.
 * - Demo: el espacio se elige con una cookie (todo vive en el mismo servidor).
 */
export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
  const admin = locals.admin;
  if (!admin) return redirect('/admin/login', 303);
  const id = String((await request.formData()).get('tenant') ?? '');
  const target = (await mySpaces(admin)).find((x) => x.id === id);
  if (!target || target.current) return redirect('/admin', 303);

  if (admin.mode === 'demo') {
    cookies.set(DEMO_TENANT_COOKIE, target.slug, { ...cookieBase(url), maxAge: 60 * 60 * 8 });
    return redirect('/admin', 303);
  }
  if (!target.host) return redirect('/admin?error=space', 303);
  const base = `https://${target.host}`;
  const identity = serviceIdentity();
  try {
    const hash = identity?.oneTimeLogin ? await identity.oneTimeLogin(admin.session.email) : null;
    if (hash) return redirect(`${base}/admin/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(hash)}&next=/admin`, 303);
  } catch (e) {
    console.warn('[switch] sin enlace de un solo uso, al login del otro espacio:', e instanceof Error ? e.message : e);
  }
  return redirect(`${base}/admin/login`, 303);
};
