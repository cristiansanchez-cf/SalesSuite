import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgDb } from './db';
import type { Delegation, PlatformSetup, PlatformTenant } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`[supabase] ${r.error.message}`);
  return r.data;
}
/** Antes de aplicar la migración del organigrama, sin delegaciones (no rompe la consola). */
const missing = (e: { message: string } | null) => !!e && /delegation|platform_admin|is_superadmin|function .* does not exist|schema cache/i.test(e.message);
const toDelegation = (r: Row): Delegation => ({ id: r.id, tenantId: r.tenant_id, name: r.name, managerId: r.manager_id ?? null, position: r.position ?? 0 });

export function supabaseOrgDb(sb: SupabaseClient): OrgDb {
  return {
    async isSuperadmin() {
      const r = await sb.rpc('is_superadmin');
      if (missing(r.error)) return false;
      return !!check(r);
    },
    async listDelegations(t) {
      const r = await sb.from('delegation').select('*').eq('tenant_id', t).order('position').order('name');
      if (missing(r.error)) return [];
      return (check(r) ?? []).map(toDelegation);
    },
    async saveDelegation(t, d, id) {
      const row = { tenant_id: t, name: d.name, manager_id: d.managerId };
      const r = id ? await sb.from('delegation').update(row).eq('tenant_id', t).eq('id', id).select('id').single()
        : await sb.from('delegation').insert(row).select('id').single();
      return (check(r) as Row).id;
    },
    async deleteDelegation(t, id) { check(await sb.from('delegation').delete().eq('tenant_id', t).eq('id', id)); },
    async memberDelegations(t) {
      const r = await sb.from('membership').select('user_id, delegation_id').eq('tenant_id', t).not('delegation_id', 'is', null);
      if (missing(r.error)) return new Map();
      return new Map((check(r) ?? []).map((x: Row) => [x.user_id, x.delegation_id]));
    },
    async setMemberDelegation(t, userId, delegationId) {
      check(await sb.rpc('set_member_delegation', { p_tenant: t, p_user: userId, p_delegation: delegationId }));
    },
    async zoneDelegations(t) {
      const r = await sb.from('zone').select('id, delegation_id').eq('tenant_id', t).not('delegation_id', 'is', null);
      if (missing(r.error)) return new Map();
      return new Map((check(r) ?? []).map((x: Row) => [x.id, x.delegation_id]));
    },
    async setZoneDelegation(t, zoneId, delegationId) {
      const rows = check(await sb.from('zone').update({ delegation_id: delegationId }).eq('tenant_id', t).eq('id', zoneId).select('id')) ?? [];
      if (!rows.length) throw new Error('permission denied: zona no encontrada o sin permiso');
    },
    async createTenant(t) {
      return check(await sb.rpc('platform_create_tenant', { p_slug: t.slug, p_name: t.name, p_locale: t.locale, p_hostname: t.hostname })) as string;
    },
    async addTenantAdmin(tenantId, userId) { check(await sb.rpc('platform_add_admin', { p_tenant: tenantId, p_user: userId })); },
    async platformOverview() {
      const r = await sb.rpc('platform_overview');
      if (missing(r.error)) return null;
      const rows = check(r) as Row[] | null;
      return rows ? rows.map((x): PlatformTenant => ({
        id: x.id, slug: x.slug, name: x.name, status: x.status, createdAt: x.created_at, domain: x.domain ?? null,
        members: Number(x.members), delegations: Number(x.delegations), dossiers: Number(x.dossiers), published: Number(x.published), revenueCents: Number(x.revenue_cents),
        setup: setupOf(x.setup),
      })) : null;
    },
  };
}

/** El «setup» de platform_overview (sin él, si la migración aún no está: todo a cero). */
function setupOf(v: unknown): PlatformSetup {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (k: string) => Number(o[k] ?? 0) || 0;
  return { admins: n('admins'), pitch: n('pitch'), segments: n('segments'), personas: n('personas'), facets: n('facets'), plays: n('plays'), prices: n('prices'), logo: o.logo === true, accounts: n('accounts') };
}
