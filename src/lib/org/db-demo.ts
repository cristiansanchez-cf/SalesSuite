import { randomUUID } from 'node:crypto';
import { demoDb } from '../data/store';
import type { OrgDb } from './db';

/**
 * Organigrama en demo: mismas reglas que la RLS de 20261026000000_org.sql (quién puede qué lo comprueba el servicio;
 * aquí, además, el gerente de una delegación pasa a ella, como el trigger delegation_manager_sync).
 */
const db = () => demoDb();
const membership = (tenantId: string, userId: string) => db().users.find((u) => u.id === userId)?.memberships.find((m) => m.tenant_id === tenantId);

export function demoOrgDb(): OrgDb {
  const syncManager = (tenantId: string, id: string, managerId: string | null) => {
    const m = managerId ? membership(tenantId, managerId) : undefined;
    if (m && (m.role === 'rep' || m.role === 'lead')) { m.delegation_id = id; m.role = 'lead'; }
  };
  return {
    async isSuperadmin(userId) { return !!db().users.find((u) => u.id === userId)?.platform_admin; },
    async listDelegations(t) {
      return db().delegation.filter((d) => d.tenant_id === t).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map((d) => ({ id: d.id, tenantId: d.tenant_id, name: d.name, managerId: d.manager_id, position: d.position }));
    },
    async saveDelegation(t, d, id) {
      if (db().delegation.some((x) => x.tenant_id === t && x.id !== id && x.name.toLowerCase() === d.name.toLowerCase())) throw new Error('duplicate key: ya hay una delegación con ese nombre');
      if (id) {
        const cur = db().delegation.find((x) => x.tenant_id === t && x.id === id);
        if (!cur) throw new Error('permission denied: delegación no encontrada');
        cur.name = d.name; cur.manager_id = d.managerId;
      } else {
        id = randomUUID();
        db().delegation.push({ id, tenant_id: t, name: d.name, manager_id: d.managerId, position: db().delegation.filter((x) => x.tenant_id === t).length });
      }
      syncManager(t, id, d.managerId);
      return id;
    },
    async deleteDelegation(t, id) {
      db().delegation = db().delegation.filter((x) => !(x.tenant_id === t && x.id === id));
      for (const u of db().users) for (const m of u.memberships) if (m.tenant_id === t && m.delegation_id === id) m.delegation_id = null;
      for (const z of db().zone) if (z.tenant_id === t && z.delegation_id === id) z.delegation_id = null;
    },
    async memberDelegations(t) {
      return new Map(db().users.flatMap((u) => u.memberships.filter((m) => m.tenant_id === t && m.delegation_id).map((m) => [u.id, m.delegation_id!] as const)));
    },
    async setMemberDelegation(t, userId, delegationId) {
      if (delegationId && !db().delegation.some((d) => d.tenant_id === t && d.id === delegationId)) throw new Error('Delegación no encontrada');
      const m = membership(t, userId);
      if (!m) throw new Error('Esa persona no está en el equipo');
      m.delegation_id = delegationId;
    },
    async zoneDelegations(t) {
      return new Map(db().zone.filter((z) => z.tenant_id === t && z.delegation_id).map((z) => [z.id, z.delegation_id!] as const));
    },
    async setZoneDelegation(t, zoneId, delegationId) {
      const z = db().zone.find((x) => x.tenant_id === t && x.id === zoneId);
      if (!z) throw new Error('permission denied: zona no encontrada');
      z.delegation_id = delegationId;
    },
    async platformOverview() {
      const d = db();
      return d.tenant.map((t) => ({
        id: t.id, slug: t.slug, name: t.name, status: t.status ?? 'active', createdAt: (t as { created_at?: string }).created_at ?? new Date(0).toISOString(),
        domain: d.domain.filter((x) => x.tenant_id === t.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.hostname ?? null,
        members: d.users.filter((u) => u.memberships.some((m) => m.tenant_id === t.id)).length,
        delegations: d.delegation.filter((x) => x.tenant_id === t.id).length,
        dossiers: d.dossier.filter((x) => x.tenant_id === t.id).length,
        published: d.dossier.filter((x) => x.tenant_id === t.id && x.status === 'published').length,
        revenueCents: d.revenue_event.filter((e) => e.tenant_id === t.id && e.status === 'confirmed').reduce((s, e) => s + (e.kind === 'refund' ? -1 : 1) * Number(e.revenue_cents), 0),
      }));
    },
  };
}
