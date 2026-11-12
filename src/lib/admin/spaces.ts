/**
 * «Cambiar de espacio» (abajo a la izquierda): los espacios a los que tiene acceso quien entra, para ir de uno a otro
 * sin tocar la URL. En producción cada espacio vive en su dominio; en demo, en una cookie.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import { parseBrand } from '../brand';
import type { Role } from './types';
import type { AdminContext } from './auth';

export interface Space { id: string; slug: string; name: string; host: string | null; role: Role | 'superadmin'; current: boolean; logoUrl?: string | null }
/** Quién pide la lista: desde un espacio (AdminContext) o desde el acceso general sin espacio (hub.ts). */
export interface SpacesWho {
  mode: 'supabase' | 'demo'; userId: string; superadmin: boolean; supabase: SupabaseClient | null;
  /** Superadmin: todos los espacios de la plataforma. */
  platform: () => Promise<Array<{ id: string; slug: string; name: string; domain: string | null }>>;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; spaces: Omit<Space, 'current'>[] }>();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

const logoOf = (raw: unknown) => { const u = parseBrand(raw).logoUrl; return u && /^https:\/\//.test(u) ? u : null; };

export async function loadSpaces(who: SpacesWho): Promise<Omit<Space, 'current'>[]> {
  const { userId, superadmin } = who;
  if (superadmin) {
    const all = await who.platform().catch(() => []);
    // Los logos, aparte (la lista de la plataforma no los trae); si no se pueden leer, sin logo.
    const brands = new Map<string, unknown>(who.mode === 'demo'
      ? demoDb().tenant.map((t) => [t.id, t.brand] as const)
      : ((await who.supabase?.from('tenant').select('id, brand').in('id', all.map((t) => t.id)))?.data ?? []).map((t) => [t.id as string, t.brand] as const));
    return all.map((t) => ({ id: t.id, slug: t.slug, name: t.name, host: t.domain, role: 'superadmin' as const, logoUrl: logoOf(brands.get(t.id)) })).sort(byName);
  }
  if (who.mode === 'demo') {
    const d = demoDb();
    const me = d.users.find((u) => u.id === userId);
    return (me?.memberships ?? []).flatMap((m) => {
      const t = d.tenant.find((x) => x.id === m.tenant_id);
      if (!t) return [];
      const host = d.domain.filter((x) => x.tenant_id === t.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.hostname ?? null;
      return [{ id: t.id, slug: t.slug, name: t.name, host, role: m.role, logoUrl: logoOf((t as { brand?: unknown }).brand) }];
    }).sort(byName);
  }
  // Supabase: la RLS solo deja ver los espacios de los que eres miembro (y sus dominios).
  const sb = who.supabase;
  if (!sb) return [];
  const { data: ms } = await sb.from('membership').select('tenant_id, role').eq('user_id', userId);
  const ids = (ms ?? []).map((m) => m.tenant_id as string);
  if (!ids.length) return [];
  const [{ data: ts }, { data: ds }] = await Promise.all([
    sb.from('tenant').select('id, slug, name, brand').in('id', ids),
    sb.from('domain').select('tenant_id, hostname, is_primary').in('tenant_id', ids),
  ]);
  return (ts ?? []).map((t) => ({
    id: t.id as string, slug: t.slug as string, name: t.name as string,
    host: ((ds ?? []).filter((x) => x.tenant_id === t.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.hostname as string | undefined) ?? null,
    role: (ms ?? []).find((m) => m.tenant_id === t.id)?.role as Role, logoUrl: logoOf(t.brand),
  })).sort(byName);
}

/** Tus espacios, el actual marcado. Se guarda un minuto por persona (se pinta en cada página). */
export async function mySpaces(admin: AdminContext): Promise<Space[]> {
  const key = `${admin.mode}:${admin.session.userId}`;
  const hit = cache.get(key);
  let spaces = hit && Date.now() - hit.at < TTL_MS ? hit.spaces : null;
  if (!spaces) {
    spaces = await loadSpaces({ mode: admin.mode, userId: admin.session.userId, superadmin: !!admin.session.superadmin, supabase: admin.supabase,
      platform: () => admin.org.platform() }).catch(() => []);
    cache.set(key, { at: Date.now(), spaces });
  }
  return spaces.map((x) => ({ ...x, current: x.id === admin.session.tenantId }));
}
export function clearSpacesCache() { cache.clear(); }
