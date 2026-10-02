import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { authMode, safeNext, supabaseServerClient } from '~/lib/admin/auth';

const TYPES = new Set<EmailOtpType>(['invite', 'magiclink', 'recovery', 'email', 'signup', 'email_change']);

/**
 * Destino de TODOS los emails de Auth (invitación, enlace mágico, recuperación).
 * - token_hash + type: plantillas de supabase/templates (recomendado; funciona aunque se abra en otro dispositivo).
 * - code: plantillas por defecto con PKCE (mismo navegador que pidió el enlace).
 * Invitación y recuperación llevan a /admin/account para fijar la contraseña.
 */
export const GET: APIRoute = async (ctx) => {
  if (authMode() !== 'supabase') return ctx.redirect('/admin/login', 303);
  const q = ctx.url.searchParams;
  const sb = supabaseServerClient(ctx);
  const type = q.get('type') as EmailOtpType | null;
  const tokenHash = q.get('token_hash');
  const code = q.get('code');

  let ok = false;
  if (tokenHash && type && TYPES.has(type)) ok = !(await sb.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;

  if (!ok) return ctx.redirect('/admin/login?error=link', 303);
  const needsPassword = type === 'invite' || type === 'recovery';
  return ctx.redirect(needsPassword ? '/admin/account?setup=1' : safeNext(q.get('next')), 303);
};
