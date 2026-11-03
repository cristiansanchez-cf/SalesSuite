/**
 * Organigrama (docs/ORG.md). Quién ve qué:
 *  · superadmin: todos los espacios (página Plataforma) y, dentro de cada uno, como un admin;
 *  · admin y gerente global (gerente sin delegación): todo el espacio, y montan el organigrama;
 *  · gerente de delegación: solo su equipo (session.team), y ve su delegación;
 *  · comercial: lo suyo.
 */
import type { AdminDb, Identity } from '../admin/db';
import { AdminError } from '../admin/service';
import { slug } from '../evidence/schema';
import type { AdminSession, MemberRecord } from '../admin/types';
import type { OrgDb } from './db';
import type { Delegation } from './types';
import { inTeam, isGlobal } from './scope';
import { costReport, fixedCostsFromEnv, isMonth, monthRange, storagePerGbFromEnv } from '../usage/report';

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

/**
 * Dirección de un espacio a partir de su nombre: «Ocean Dive Lab» → «ocean-dive-lab». Al cortarla a 40 se quita el guion
 * que quede al final: un subdominio no puede acabar en guion. (La misma cuenta en el script de platform.astro.)
 */
export const slugOf = (name: string) => slug(name).slice(0, 40).replace(/-+$/, '');
export const SPACE_LOCALES = ['es-ES', 'en-GB', 'pt-PT', 'ko-KR', 'ca-ES', 'fr-FR'] as const;

export function createOrgService(db: OrgDb, admin: AdminDb, s: AdminSession, deps: {
  zones: () => Promise<Array<{ id: string; name: string; parentId: string | null }>>;
  /** Para invitar al admin de un espacio nuevo (Plataforma). */
  identity?: Identity | null;
}) {
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

  /** Coste por empresa del mes «2026-11» (docs/COSTES.md). `ready: false` si aún no está la migración del consumo. */
  async function costs(month: string, now = new Date()) {
    if (!s.superadmin) throw new AdminError(403, 'Solo el superadmin');
    if (!isMonth(month)) throw new AdminError(422, 'Mes no válido');
    const { from, to } = monthRange(month);
    const [spaces, rows, storage] = await Promise.all([db.platformOverview(), db.platformUsage?.(from, to) ?? null, db.platformStorage?.().catch(() => null) ?? null]);
    const tenants = (spaces ?? []).map((x) => ({ id: x.id, slug: x.slug, name: x.name, members: x.members, domain: x.domain }));
    return { ready: rows !== null, report: costReport({ rows: rows ?? [], storage: storage ?? [], tenants, month, now, fixed: fixedCostsFromEnv(), storagePerGb: storagePerGbFromEnv() }) };
  }

  /**
   * Alta de una empresa desde Plataforma (docs/ORG.md §Alta de una empresa): crea el espacio en `<dirección>.<base>`
   * (la base tiene el comodín en Vercel y en Supabase Auth, así que no hay que tocar nada más) y, si se da su email,
   * invita a su admin; la invitación le lleva directo a la configuración del espacio.
   */
  async function createSpace(input: { name?: unknown; slug?: unknown; locale?: unknown; adminEmail?: unknown }, o: { base: string; scheme: 'https' | 'http'; port?: string }) {
    if (!s.superadmin) throw new AdminError(403, 'Solo el superadmin da de alta empresas');
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 80) throw new AdminError(422, 'Pon el nombre de la empresa');
    const slug = slugOf(String(input.slug ?? '').trim() || name);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new AdminError(422, 'La dirección solo puede llevar letras, números y guiones');
    const locale = String(input.locale ?? 'es-ES');
    if (!(SPACE_LOCALES as readonly string[]).includes(locale)) throw new AdminError(422, 'Idioma no válido');
    const email = String(input.adminEmail ?? '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminError(422, 'El email del admin no es válido');
    if (email && !deps.identity) throw new AdminError(503, 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para poder invitar (ver docs/SETUP.md)');
    const hostname = `${slug}.${o.base}`;
    let id: string;
    try { id = await db.createTenant({ slug, name, locale, hostname }); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicate|unique/i.test(msg)) throw new AdminError(409, 'Ya hay un espacio con esa dirección: elige otra');
      if (/permission|42501/i.test(msg)) throw new AdminError(403, 'Solo el superadmin da de alta empresas');
      throw e;
    }
    const origin = `${o.scheme}://${hostname}${o.port ? `:${o.port}` : ''}`;
    let invited = false;
    if (email) {
      // El espacio ya existe: si la invitación falla (p. ej. el límite de correos de Supabase), que se sepa y se pueda
      // invitar desde dentro; un reintento aquí daría «ya hay un espacio con esa dirección».
      try {
        const r = await deps.identity!.findOrInvite(email, { redirectTo: `${origin}/admin/auth/confirm?next=${encodeURIComponent('/admin/setup/ia?first=1')}` });
        await db.addTenantAdmin(id, r.userId);
        invited = r.invited;
      } catch (e) {
        console.warn('[platform] invitación del admin:', e instanceof Error ? e.message : e);
        throw new AdminError(503, 'El espacio está creado, pero no se ha podido invitar a su admin: entra en él e invítalo desde Equipo');
      }
    }
    return { id, slug, hostname, origin, invited, adminEmail: email || null };
  }
  return { chart, saveDelegation, deleteDelegation, moveMember, setZone, platform, costs, createSpace };
}

export type OrgService = ReturnType<typeof createOrgService>;
