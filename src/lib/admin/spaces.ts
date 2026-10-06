/**
 * «Cambiar de espacio» (abajo a la izquierda): los espacios a los que tiene acceso quien entra, para ir de uno a otro
 * sin tocar la URL. En producción cada espacio vive en su dominio; en demo, en una cookie.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import type { Role } from './types';
import type { AdminContext } from './auth';

export interface Space { id: string; slug: string; name: string; host: string | null; role: Role | 'superadmin'; current: boolean }

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; spaces: Omit<Space, 'current'>[] }>();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

async function load(admin: AdminContext): Promise<Omit<Space, 'current'>[]> {
  const { userId, superadmin } = admin.session;
  if (superadmin) {
    const all = await admin.org.platform().catch(() => []);
    return all.map((t) => ({ id: t.id, slug: t.slug, name: t.name, host: t.domain, role: 'superadmin' as const })).sort(byName);
  }
  if (admin.mode === 'demo') {
    const d = demoDb();
    const me = d.users.find((u) => u.id === userId);
    return (me?.memberships ?? []).flatMap((m) => {
      const t = d.tenant.find((x) => x.id === m.tenant_id);
      if (!t) return [];
      const host = d.domain.filter((x) => x.tenant_id === t.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.hostname ?? null;
      return [{ id: t.id, slug: t.slug, name: t.name, host, role: m.role }];
    }).sort(byName);
  }
  // Supabase: la RLS solo deja ver los espacios de los que eres miembro (y sus dominios).
  const sb = admin.supabase as SupabaseClient | null;
  if (!sb) return [];
  const { data: ms } = await sb.from('membership').select('tenant_id, role').eq('user_id', userId);
  const ids = (ms ?? []).map((m) => m.tenant_id as string);
  if (!ids.length) return [];
  const [{ data: ts }, { data: ds }] = await Promise.all([
    sb.from('tenant').select('id, slug, name').in('id', ids),
    sb.from('domain').select('tenant_id, hostname, is_primary').in('tenant_id', ids),
  ]);
  return (ts ?? []).map((t) => ({
    id: t.id as string, slug: t.slug as string, name: t.name as string,
    host: ((ds ?? []).filter((x) => x.tenant_id === t.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.hostname as string | undefined) ?? null,
    role: (ms ?? []).find((m) => m.tenant_id === t.id)?.role as Role,
  })).sort(byName);
}

/** Tus espacios, el actual marcado. Se guarda un minuto por persona (se pinta en cada página). */
export async function mySpaces(admin: AdminContext): Promise<Space[]> {
  const key = `${admin.mode}:${admin.session.userId}`;
  const hit = cache.get(key);
  let spaces = hit && Date.now() - hit.at < TTL_MS ? hit.spaces : null;
  if (!spaces) {
    spaces = await load(admin).catch(() => []);
    cache.set(key, { at: Date.now(), spaces });
  }
  return spaces.map((x) => ({ ...x, current: x.id === admin.session.tenantId }));
}
export function clearSpacesCache() { cache.clear(); }
