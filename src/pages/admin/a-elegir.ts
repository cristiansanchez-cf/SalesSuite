import type { APIRoute } from 'astro';
import { authMode, serviceIdentity } from '~/lib/admin/auth';
import { hubUrl, hubUser } from '~/lib/hub';
import { requestOrigin } from '~/lib/http';

/**
 * «Ver tus empresas» desde «Sin acceso» (p. ej. a alguien le quitaron el acceso a este espacio y entró por su dirección):
 * al acceso general (docs/HUB.md) ya con la sesión abierta, para no tener que volver a entrar. Como «Cambiar de espacio»
 * (/admin/switch) pero al revés: un enlace de un solo uso para tu propio email, sin correo de por medio. No hace falta ser
 * miembro de este espacio (por eso no pasa por la comprobación de acceso), pero sí haber entrado: sin sesión, al login.
 */
export const POST: APIRoute = async (ctx) => {
  const hub = hubUrl(requestOrigin(ctx.request, ctx.url));
  const user = await hubUser(ctx).catch(() => null);
  if (!user) return ctx.redirect(`${hub}/admin/login`, 303);
  if (authMode() === 'demo') return ctx.redirect(`${hub}/admin/auth/confirm?demo_user=${encodeURIComponent(user.id)}&next=/admin/elige`, 303);
  try {
    const hash = user.email ? await serviceIdentity()?.oneTimeLogin?.(user.email) : null;
    if (hash) return ctx.redirect(`${hub}/admin/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(hash)}&next=/admin/elige`, 303);
  } catch (e) {
    console.warn('[a-elegir] sin enlace de un solo uso, al login del acceso general:', e instanceof Error ? e.message : e);
  }
  return ctx.redirect(`${hub}/admin/login`, 303);
};
