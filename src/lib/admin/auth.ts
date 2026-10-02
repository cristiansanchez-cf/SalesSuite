/**
 * Sesión de la consola.
 * - Supabase: @supabase/ssr con cookies httpOnly; el cliente lleva el JWT del usuario → RLS.
 * - Demo (sin Supabase): cookie con el id de un usuario de DEMO_USERS. Solo existe en modo demo.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { supabaseConfigured } from '../data/supabase';
import { DEMO_USERS } from '../data/store';
import { env } from '../env';
import type { TenantContext } from '../types';
import type { AdminDb } from './db';
import { demoAdminDb } from './db-demo';
import { supabaseAdminDb } from './db-supabase';
import { createAdminService, type AdminService } from './service';
import type { AdminSession } from './types';

export const DEMO_COOKIE = 'ss_demo_user';

export interface RequestLike {
  request: Request;
  cookies: AstroCookies;
  url: URL;
}

export interface AdminContext {
  mode: 'supabase' | 'demo';
  session: AdminSession;
  service: AdminService;
}

export type AuthResult =
  | { kind: 'ok'; admin: AdminContext }
  | { kind: 'anonymous' }
  | { kind: 'forbidden'; email: string };

export const authMode = (): 'supabase' | 'demo' => (supabaseConfigured() ? 'supabase' : 'demo');

const cookieBase = (url: URL) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:' });

export function supabaseServerClient(ctx: RequestLike): SupabaseClient {
  return createServerClient(env('PUBLIC_SUPABASE_URL')!, env('PUBLIC_SUPABASE_ANON_KEY')!, {
    cookies: {
      getAll: () => parseCookieHeader(ctx.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (list) => list.forEach(({ name, value, options }) => ctx.cookies.set(name, value, { ...options, ...cookieBase(ctx.url) })),
    },
  });
}

async function build(db: AdminDb, user: { id: string; email: string; name: string | null }, tenant: TenantContext, mode: AdminContext['mode']): Promise<AuthResult> {
  const role = await db.membershipRole(user.id, tenant.id);
  if (!role) return { kind: 'forbidden', email: user.email };
  const session: AdminSession = { userId: user.id, email: user.email, displayName: user.name, tenantId: tenant.id, role };
  return { kind: 'ok', admin: { mode, session, service: createAdminService(db, session, { defaultLocale: tenant.defaultLocale }) } };
}

export async function authenticate(ctx: RequestLike, tenant: TenantContext): Promise<AuthResult> {
  if (authMode() === 'demo') {
    const u = DEMO_USERS.find((x) => x.id === ctx.cookies.get(DEMO_COOKIE)?.value);
    if (!u) return { kind: 'anonymous' };
    return build(demoAdminDb(), { id: u.id, email: u.email, name: u.display_name }, tenant, 'demo');
  }
  const sb = supabaseServerClient(ctx);
  // getUser() valida el JWT contra Supabase Auth (getSession() solo lee la cookie).
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { kind: 'anonymous' };
  return build(supabaseAdminDb(sb), { id: data.user.id, email: data.user.email ?? '', name: (data.user.user_metadata?.name as string) ?? null }, tenant, 'supabase');
}

export function demoLogin(ctx: RequestLike, userId: string): boolean {
  if (authMode() !== 'demo' || !DEMO_USERS.some((u) => u.id === userId)) return false;
  ctx.cookies.set(DEMO_COOKIE, userId, { ...cookieBase(ctx.url), maxAge: 60 * 60 * 8 });
  return true;
}

export async function logout(ctx: RequestLike): Promise<void> {
  ctx.cookies.delete(DEMO_COOKIE, { path: '/' });
  if (authMode() === 'supabase') await supabaseServerClient(ctx).auth.signOut();
}

/** Solo rutas internas de la consola (evita open redirect). */
export function safeNext(raw: string | null | undefined): string {
  return raw && /^\/admin(\/[\w\-/.]*)?(\?[\w\-=&%.]*)?$/.test(raw) && !raw.includes('//') ? raw : '/admin';
}
