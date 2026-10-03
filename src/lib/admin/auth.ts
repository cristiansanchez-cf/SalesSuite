/**
 * Sesión de la consola.
 * - Supabase: @supabase/ssr con cookies httpOnly; el cliente lleva el JWT del usuario → RLS.
 * - Demo (sin Supabase): cookie con el id de un usuario de DEMO_USERS. Solo existe en modo demo.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { appMode } from '../mode';
import { demoDb } from '../data/store';
import { env } from '../env';
import type { TenantContext } from '../types';
import type { AdminDb } from './db';
import type { AssetStore, Identity } from './db';
import { demoAdminDb, demoAssets, demoIdentity } from './db-demo';
import { supabaseAdminDb, supabaseAssets, supabaseIdentity } from './db-supabase';
import { createAdminService, type AdminService } from './service';
import { createTenantAdminService, type TenantAdminService } from './tenant-service';
import type { PlaybookDb } from '../playbook/db';
import { demoPlaybookDb } from '../playbook/db-demo';
import { supabasePlaybookDb } from '../playbook/db-supabase';
import { createPlaybookService, type PlaybookService } from '../playbook/service';
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
  /** Equipo, catálogo y marca (cada método exige rol admin). */
  tenantAdmin: TenantAdminService;
  /** Playbook de ventas (aprender, aportar, votar; editar si admin). */
  playbook: PlaybookService;
  /** Cliente Supabase con la sesión del usuario (solo modo supabase). */
  supabase: SupabaseClient | null;
}

export type AuthResult =
  | { kind: 'ok'; admin: AdminContext }
  | { kind: 'anonymous' }
  | { kind: 'forbidden'; email: string };

export const authMode = (): 'supabase' | 'demo' => (appMode() === 'supabase' ? 'supabase' : 'demo');

const cookieBase = (url: URL) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:' });

export function supabaseServerClient(ctx: RequestLike): SupabaseClient {
  return createServerClient(env('PUBLIC_SUPABASE_URL')!, env('PUBLIC_SUPABASE_ANON_KEY')!, {
    cookies: {
      getAll: () => parseCookieHeader(ctx.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (list) => list.forEach(({ name, value, options }) => ctx.cookies.set(name, value, { ...options, ...cookieBase(ctx.url) })),
    },
  });
}

interface Deps { identity: Identity | null; assets: AssetStore; supabase: SupabaseClient | null; playbookDb: PlaybookDb }

async function build(db: AdminDb, user: { id: string; email: string; name: string | null }, tenant: TenantContext, mode: AdminContext['mode'], deps: Deps): Promise<AuthResult> {
  const role = await db.membershipRole(user.id, tenant.id);
  if (!role) return { kind: 'forbidden', email: user.email };
  const session: AdminSession = { userId: user.id, email: user.email, displayName: user.name, tenantId: tenant.id, role };
  const service = createAdminService(db, session, { defaultLocale: tenant.defaultLocale });
  return {
    kind: 'ok',
    admin: {
      mode, session, supabase: deps.supabase, service,
      tenantAdmin: createTenantAdminService(db, session, { identity: deps.identity, assets: deps.assets }),
      playbook: createPlaybookService(deps.playbookDb, db, session, { admin: service }),
    },
  };
}

/** Service role SOLO para invitar usuarios. Si falta, invitar devuelve un 503 explicativo. */
function serviceIdentity(): Identity | null {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return key ? supabaseIdentity(env('PUBLIC_SUPABASE_URL')!, key) : null;
}

export async function authenticate(ctx: RequestLike, tenant: TenantContext): Promise<AuthResult> {
  if (authMode() === 'demo') {
    const u = demoDb().users.find((x) => x.id === ctx.cookies.get(DEMO_COOKIE)?.value);
    if (!u) return { kind: 'anonymous' };
    return build(demoAdminDb(), { id: u.id, email: u.email, name: u.display_name || null }, tenant, 'demo',
      { identity: demoIdentity(), assets: demoAssets, supabase: null, playbookDb: demoPlaybookDb() });
  }
  const sb = supabaseServerClient(ctx);
  // getUser() valida el JWT contra Supabase Auth (getSession() solo lee la cookie).
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { kind: 'anonymous' };
  return build(supabaseAdminDb(sb), { id: data.user.id, email: data.user.email ?? '', name: (data.user.user_metadata?.name as string) ?? null }, tenant, 'supabase',
    { identity: serviceIdentity(), assets: supabaseAssets(sb), supabase: sb, playbookDb: supabasePlaybookDb(sb) });
}

export function demoLogin(ctx: RequestLike, userId: string): boolean {
  if (authMode() !== 'demo' || !demoDb().users.some((u) => u.id === userId)) return false;
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
