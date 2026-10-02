import type { APIRoute } from 'astro';
import { authMode, safeNext, supabaseServerClient } from '~/lib/admin/auth';

/** Vuelta del magic link (PKCE): canjea el code por sesión (cookies) y entra en la consola. */
export const GET: APIRoute = async (ctx) => {
  const code = ctx.url.searchParams.get('code');
  const next = safeNext(ctx.url.searchParams.get('next'));
  if (authMode() !== 'supabase' || !code) return ctx.redirect('/admin/login', 303);
  const { error } = await supabaseServerClient(ctx).auth.exchangeCodeForSession(code);
  return ctx.redirect(error ? '/admin/login' : next, 303);
};
