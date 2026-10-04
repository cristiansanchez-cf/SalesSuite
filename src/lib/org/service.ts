/**
 * Organigrama (docs/ORG.md). Quién ve qué:
 *  · superadmin: todos los espacios (página Plataforma) y, dentro de cada uno, como un admin;
 *  · admin y gerente global (gerente sin delegación): todo el espacio, y montan el organigrama;
 *  · gerente de delegación: solo su equipo (session.team), y ve su delegación;
 *  · comercial: lo suyo.
 */
import type { AdminDb } from '../admin/db';
import { AdminError } from '../admin/service';
import type { AdminSession, MemberRecord } from '../admin/types';
import type { OrgDb } from './db';
import type { Delegation } from './types';
import { inTeam, isGlobal } from './scope';

export { inTeam, isGlobal };

export interface ChartDelegation extends Delegation { manager: MemberRecord | null; members: MemberRecord[]; zones: Array<{ id: string; name: string }> }
export interface Chart {
  /** Dirección: admins y gerentes globales. */
  globals: MemberRecord[];
  delegations: ChartDelegation[];
  /** Comerciales sin delegación. */
  unassigned: MemberRecord[];
  canEdit: boolean;
}

export function createOrgService(db: OrgDb, admin: AdminDb, s: AdminSession, deps: { zones: () => Promise<Array<{ id: string; name: string; parentId: string | null }>> }) {
  const requireGlobal = () => { if (!isGlobal(s)) throw new AdminError(403, 'Solo el admin o un gerente global monta el organigrama'); };
  const mapError = (e: unknown): never => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|unique/i.test(msg)) throw new AdminError(409, 'Ya hay una delegación con ese nombre');
    if (/permission|42501|Solo el admin/i.test(msg)) throw new AdminError(403, 'No tienes permiso para cambiar el organigrama');
    if (/no encontrad|no está/i.test(msg)) throw new AdminError(404, msg.replace(/^\[supabase\]\s*/, ''));
    throw e;
  };

  async function chart(): Promise<Chart> {
    const [ds, members, byUser, byZone, zones] = await Promise.all([
      db.listDelegations(s.tenantId), admin.listMembers(s.tenantId), db.memberDelegations(s.tenantId), db.zoneDelegations(s.tenantId), deps.zones().catch(() => []),
    ]);
    const team = members.filter((m) => m.role !== 'partner');
    const zoneName = new Map(zones.map((z) => [z.id, z.name]));
    const all: ChartDelegation[] = ds.map((d) => ({
      ...d,
      manager: team.find((m) => m.userId === d.managerId) ?? null,
      members: team.filter((m) => byUser.get(m.userId) === d.id && m.userId !== d.managerId),
      zones: [...byZone].filter(([, id]) => id === d.id).map(([zid]) => ({ id: zid, name: zoneName.get(zid) ?? '—' })),
    }));
    return {
      globals: team.filter((m) => m.role === 'admin' || (m.role === 'lead' && !byUser.has(m.userId))),
      // El gerente de una delegación ve solo la suya.
      delegations: isGlobal(s) ? all : all.filter((d) => d.id === s.delegationId),
      unassigned: isGlobal(s) ? team.filter((m) => m.role === 'rep' && !byUser.has(m.userId)) : [],
      canEdit: isGlobal(s),
    };
  }

  async function saveDelegation(input: { name: unknown; managerId?: unknown }, id?: string) {
    requireGlobal();
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 80) throw new AdminError(422, 'Ponle un nombre corto (p. ej. «Levante»)');
    const managerId = String(input.managerId ?? '') || null;
    if (managerId) {
      const m = (await admin.listMembers(s.tenantId)).find((x) => x.userId === managerId);
      if (!m || (m.role !== 'rep' && m.role !== 'lead')) throw new AdminError(422, 'El gerente tiene que ser alguien del equipo comercial');
    }
    try { return await db.saveDelegation(s.tenantId, { name, managerId }, id); } catch (e) { return mapError(e); }
  }
  async function deleteDelegation(id: string) { requireGlobal(); try { await db.deleteDelegation(s.tenantId, id); } catch (e) { mapError(e); } }
  async function moveMember(userId: string, delegationId: string | null) {
    requireGlobal();
    try { await db.setMemberDelegation(s.tenantId, userId, delegationId || null); } catch (e) { mapError(e); }
  }
  async function setZone(zoneId: string, delegationId: string | null) {
    requireGlobal();
    try { await db.setZoneDelegation(s.tenantId, zoneId, delegationId || null); } catch (e) { mapError(e); }
  }
  async function platform() {
    if (!s.superadmin) throw new AdminError(403, 'Solo el superadmin');
    return (await db.platformOverview()) ?? [];
  }
  return { chart, saveDelegation, deleteDelegation, moveMember, setZone, platform };
}

export type OrgService = ReturnType<typeof createOrgService>;
