/**
 * Acceso general (docs/HUB.md): ventas.cofundo.io, sin espacio. Entras con tu email (código o enlace, como siempre) y
 * eliges a qué espacio vas hoy; se abre sesión allí con un enlace de un solo uso para tu propio email (lo mismo que
 * «Cambiar de espacio», /admin/switch) y entras directo.
 *
 * La sesión del acceso general es solo de ventas.cofundo.io (cookie de ese host): no da acceso a ningún espacio por sí
 * sola. Cada espacio sigue comprobando que eres miembro.
 */
import { authMode, DEMO_COOKIE, serviceIdentity, supabaseServerClient, type RequestLike } from './admin/auth';
import { loadSpaces, type Space } from './admin/spaces';
import { demoDb } from './data/store';
import { env } from './env';
import { demoOrgDb } from './org/db-demo';
import { supabaseOrgDb } from './org/db-supabase';
import { normalizeHost } from './tenant';

export const HUB_DEFAULT = 'ventas.cofundo.io';
/** Para probar en local: Chrome y Playwright llevan *.localhost a esta máquina. */
export const HUB_LOCAL = 'hub.localhost';

/** El host del acceso general: PLATFORM_DOMAIN (la base de las direcciones de los espacios) o ventas.cofundo.io. */
export function isHubHost(rawHost: string): boolean {
  const h = normalizeHost(rawHost);
  return h === normalizeHost(env('HUB_HOST') || env('PLATFORM_DOMAIN') || HUB_DEFAULT) || h === HUB_LOCAL;
}

/** La dirección del acceso general vista desde `origin` (requestOrigin; en local, hub.localhost con el mismo puerto). */
export function hubUrl(origin: string): string {
  const here = new URL(origin);
  const h = normalizeHost(here.host);
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return `${here.protocol}//${HUB_LOCAL}${here.port ? `:${here.port}` : ''}`;
  return `https://${normalizeHost(env('HUB_HOST') || env('PLATFORM_DOMAIN') || HUB_DEFAULT)}`;
}

/** Lo que se deja abrir en el acceso general: entrar, confirmar el enlace, elegir, ir y salir. */
const HUB_PATHS = new Set(['/admin/login', '/admin/auth/confirm', '/admin/auth/callback', '/admin/elige', '/admin/ir', '/admin/logout']);
/** Qué hacer con una ruta en el acceso general: dejarla pasar o llevar a la pantalla de elegir. */
export function hubRoute(path: string): 'pass' | 'pick' {
  if (HUB_PATHS.has(path)) return 'pass';
  // Archivos (CSS, JS, iconos) y bloques que carga la página.
  if (path.startsWith('/_astro/') || /\.[a-z0-9]{2,5}$/i.test(path)) return 'pass';
  return 'pick';
}

export interface HubUser { id: string; email: string; name: string | null; spaces: Omit<Space, 'current'>[] }

/** Quién ha entrado en el acceso general y sus espacios. null: nadie (al login). */
export async function hubUser(ctx: RequestLike): Promise<HubUser | null> {
  if (authMode() === 'demo') {
    const u = demoDb().users.find((x) => x.id === ctx.cookies.get(DEMO_COOKIE)?.value);
    if (!u) return null;
    const org = demoOrgDb();
    const superadmin = await org.isSuperadmin(u.id).catch(() => false);
    const spaces = await loadSpaces({ mode: 'demo', userId: u.id, superadmin, supabase: null, platform: async () => (await org.platformOverview()) ?? [] });
    return { id: u.id, email: u.email, name: u.display_name || null, spaces };
  }
  const sb = supabaseServerClient(ctx);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const org = supabaseOrgDb(sb);
  const superadmin = await org.isSuperadmin(data.user.id).catch(() => false);
  const spaces = await loadSpaces({ mode: 'supabase', userId: data.user.id, superadmin, supabase: sb, platform: async () => (await org.platformOverview()) ?? [] }).catch(() => []);
  return { id: data.user.id, email: data.user.email ?? '', name: (data.user.user_metadata?.name as string) ?? null, spaces };
}

/**
 * La dirección para entrar en un espacio: con un enlace de un solo uso para tu email (sin correo de por medio). Sin
 * service role, a su login (tendrá que pedir el código allí). En la demo, al host local del espacio con el mismo puerto.
 */
export async function enterUrl(user: HubUser, space: Omit<Space, 'current'>, origin: string): Promise<string | null> {
  const here = new URL(origin);
  if (authMode() === 'demo') {
    const local = demoDb().domain.find((d) => d.tenant_id === space.id && d.hostname.endsWith('.localhost'))?.hostname;
    if (!local) return null;
    return `${here.protocol}//${local}${here.port ? `:${here.port}` : ''}/admin/auth/confirm?demo_user=${encodeURIComponent(user.id)}&next=/admin/home`;
  }
  if (!space.host) return null;
  const base = `https://${space.host}`;
  try {
    const hash = await serviceIdentity()?.oneTimeLogin?.(user.email);
    if (hash) return `${base}/admin/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(hash)}&next=/admin/home`;
  } catch (e) {
    console.warn('[hub] sin enlace de un solo uso, al login del espacio:', e instanceof Error ? e.message : e);
  }
  return `${base}/admin/login`;
}

/** El último espacio elegido (para ponerlo primero y marcarlo). Solo el id; cookie del acceso general. */
export const HUB_LAST_COOKIE = 'ss_hub_last';
