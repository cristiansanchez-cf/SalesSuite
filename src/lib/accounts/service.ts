/**
 * Cuentas y territorio (docs/ACCOUNTS.md): quién trabaja cada local, con quién comparte zona y si una venta
 * genera comisión. Las reglas las aplica Postgres (RLS + triggers + RPC); aquí se validan entradas, se
 * traducen errores y se arma lo que necesitan las pantallas.
 */
import { z } from 'zod';
import type { AdminDb } from '../admin/db';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import type { AdminSession, DossierRecord, MemberRecord } from '../admin/types';
import type { AccountsDb } from './db';
import { stateFor, withDescendants, zoneCovers, zonePath } from './rules';
import type { Account, AccountDecision, AccountRules, AccountState, AccountTouch, Eligibility, Zone, ZoneAssignment } from './types';

const id = z.string().uuid();
const opt = (n: number) => z.string().trim().max(n).transform((v) => v || null).nullable().optional();
export const accountSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  zoneId: id.nullable().optional().or(z.literal('').transform(() => null)),
  segmentId: id.nullable().optional().or(z.literal('').transform(() => null)),
  address: opt(300), externalRef: opt(120), notes: opt(2000),
});
export const zoneSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  parentId: id.nullable().optional().or(z.literal('').transform(() => null)),
  kind: z.enum(['country', 'region', 'province', 'city', 'area']).default('city'),
  position: z.coerce.number().int().min(0).max(100000).default(0),
});
export const rulesSchema = z.object({
  claimDays: z.coerce.number().int().min(1, 'Mínimo 1 día').max(365, 'Máximo 365 días'),
  strictZones: z.boolean(),
  requireAccount: z.boolean(),
});

export interface AccountView extends Account {
  state: AccountState;
  zonePath: string;
  ownerName: string | null;
  wonByName: string | null;
}
export interface Colleague { userId: string; name: string; email: string; phone: string | null; role: MemberRecord['role']; zones: string[] }
export interface AccountListFilter { scope?: 'zone' | 'mine' | 'all'; state?: AccountState | 'all'; q?: string; zoneId?: string; limit?: number }

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}
function mapError(e: unknown): never {
  if (e instanceof AdminError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/duplicate key|unique/i.test(msg)) throw new AdminError(409, /zone/i.test(msg) ? 'Ya hay una zona con ese nombre en ese nivel' : 'Ya hay una cuenta con esa referencia externa');
  if (/permission denied|insufficient|row-level/i.test(msg)) throw new AdminError(403, msg.replace(/^.*permission denied:\s*/i, '').replace(/^\[supabase\]\s*/, '') || 'Sin permiso para esta operación');
  if (/foreign key/i.test(msg)) throw new AdminError(404, 'Zona o sector no encontrado');
  throw e;
}
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** CSV sencillo (comas o punto y coma, comillas dobles). */
export function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export function createAccountsService(db: AccountsDb, admin: AdminDb, s: AdminSession, opts: { now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date());
  const perms = can(s.role);
  const requireUse = () => { if (!perms.useAccounts) throw new AdminError(403, 'Las cuentas del CRM son del equipo interno'); };
  const requireManager = () => { if (!perms.manageAccounts) throw new AdminError(403, 'Solo un/a admin o gerente'); };
  const requireZones = () => { if (!perms.manageZones) throw new AdminError(403, 'Solo un/a admin define el territorio'); };

  async function territory() {
    requireUse();
    const [zones, assignments, rules] = await Promise.all([db.listZones(s.tenantId), db.listAssignments(s.tenantId), db.getRules(s.tenantId)]);
    const myZoneIds = assignments.filter((a) => a.userId === s.userId).map((a) => a.zoneId);
    return { zones: zones.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'es')), assignments, rules, myZoneIds };
  }
  async function names(): Promise<Map<string, MemberRecord>> {
    return new Map((await admin.listMembers(s.tenantId)).map((m) => [m.userId, m]));
  }
  const label = (m: MemberRecord | undefined) => (m ? m.displayName || m.email : null);
  function view(a: Account, zones: Zone[], members: Map<string, MemberRecord>): AccountView {
    return { ...a, state: stateFor(a, s.userId, now()), zonePath: zonePath(zones, a.zoneId), ownerName: label(members.get(a.ownerId ?? '')), wonByName: label(members.get(a.wonBy ?? '')) };
  }

  async function list(f: AccountListFilter = {}): Promise<{ items: AccountView[]; total: number; scope: 'zone' | 'mine' | 'all' }> {
    const t = await territory();
    let scope = f.scope ?? 'zone';
    if (scope === 'zone' && !t.myZoneIds.length) scope = 'all';
    const zoneIds = f.zoneId ? [...withDescendants(t.zones, [f.zoneId])] : scope === 'zone' ? [...withDescendants(t.zones, t.myZoneIds)] : undefined;
    const rows = await db.listAccounts(s.tenantId, { zoneIds, ownerId: scope === 'mine' ? s.userId : undefined, q: f.q, limit: Math.min(f.limit ?? 500, 2000) });
    const members = await names();
    const all = rows.map((a) => view(a, t.zones, members));
    const ORDER: Record<AccountState, number> = { mine: 0, my_customer: 1, free: 2, taken: 3, customer: 4, blocked: 5 };
    const items = all.filter((a) => !f.state || f.state === 'all' || a.state === f.state)
      .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name, 'es'));
    return { items, total: all.length, scope };
  }

  async function get(accountId: string) {
    requireUse();
    const a = await db.getAccount(accountId);
    if (!a || a.tenantId !== s.tenantId) throw new AdminError(404, 'Cuenta no encontrada');
    const [t, members, touches, dossiers, elig] = await Promise.all([
      territory(), names(), db.listTouches(accountId, 50), admin.listDossiers(s.tenantId), db.preview(accountId).catch(() => null),
    ]);
    return {
      account: view(a, t.zones, members),
      eligibility: elig as Eligibility | null,
      touches: touches.map((x: AccountTouch) => ({ ...x, userName: label(members.get(x.userId ?? '')) })),
      dossiers: dossiers.filter((d: DossierRecord) => d.accountId === accountId).map((d) => ({ ...d, authorName: label(members.get(d.authorId ?? '')) })),
      canEdit: perms.manageAccounts || a.ownerId === s.userId,
      rules: t.rules,
    };
  }

  async function create(input: unknown): Promise<string> {
    requireUse();
    const v = parse(accountSchema, input);
    try {
      return await db.insertAccount(s.tenantId, { name: v.name, zoneId: v.zoneId ?? null, segmentId: v.segmentId ?? null, address: v.address ?? null, externalRef: v.externalRef ?? null, notes: v.notes ?? null });
    } catch (e) { mapError(e); }
  }
  async function update(accountId: string, input: unknown) {
    requireUse();
    const v = parse(accountSchema, input);
    let ok: boolean;
    try { ok = await db.updateAccount(accountId, { name: v.name, zoneId: v.zoneId ?? null, segmentId: v.segmentId ?? null, address: v.address ?? null, externalRef: v.externalRef ?? null, notes: v.notes ?? null }); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(403, 'Solo quien la trabaja o un/a gerente puede editarla');
  }
  async function touch(accountId: string, kind: 'contact' | 'claim' | 'release', note?: string | null): Promise<Eligibility> {
    requireUse();
    const n = note?.trim().slice(0, 500) || null;
    try { return await db.touch(accountId, kind, n); } catch (e) { mapError(e); }
  }
  async function managerPatch(accountId: string, p: Parameters<AccountsDb['updateAccount']>[1]) {
    requireManager();
    let ok: boolean;
    try { ok = await db.updateAccount(accountId, p); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(404, 'Cuenta no encontrada');
  }
  async function block(accountId: string, reason: string) {
    const r = reason.trim();
    if (!r) throw new AdminError(422, 'Explica por qué: lo verá quien intente venderla');
    await managerPatch(accountId, { status: 'blocked', blockedReason: r.slice(0, 300) });
  }
  async function unblock(accountId: string) {
    const a = await db.getAccount(accountId);
    await managerPatch(accountId, { status: a?.wonAt ? 'customer' : 'open', blockedReason: null });
  }
  async function assign(accountId: string, userId: string | null) {
    const rules = await db.getRules(s.tenantId);
    if (userId && !(await names()).has(userId)) throw new AdminError(404, 'Esa persona no está en el equipo');
    await managerPatch(accountId, { ownerId: userId, claimedUntil: userId ? new Date(now().getTime() + rules.claimDays * 86_400_000).toISOString() : null });
  }
  async function remove(accountId: string) {
    requireManager();
    if (!(await db.deleteAccount(accountId))) throw new AdminError(404, 'Cuenta no encontrada');
  }

  /** Compañeros cuya zona se cruza con la mía (misma zona, una dentro de otra). */
  async function colleagues(): Promise<Colleague[]> {
    const t = await territory();
    if (!t.myZoneIds.length) return [];
    const members = await names();
    const byUser = new Map<string, string[]>();
    for (const a of t.assignments) if (a.userId !== s.userId) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a.zoneId]);
    const overlaps = (zs: string[]) => zs.some((z) => t.myZoneIds.some((m) => zoneCovers(t.zones, m, z) || zoneCovers(t.zones, z, m)));
    return [...byUser.entries()].filter(([u, zs]) => members.has(u) && members.get(u)!.role !== 'partner' && overlaps(zs)).map(([u, zs]) => {
      const m = members.get(u)!;
      return { userId: u, name: m.displayName || m.email, email: m.email, phone: m.phone ?? null, role: m.role, zones: zs.map((z) => t.zones.find((x) => x.id === z)?.name ?? '').filter(Boolean) };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // ---- territorio (admins) y asignaciones (admins y jefes/as)
  async function saveZone(input: unknown, zoneId?: string) {
    requireZones();
    const v = parse(zoneSchema, input);
    if (zoneId && v.parentId) {
      const zones = await db.listZones(s.tenantId);
      if (zoneCovers(zones, zoneId, v.parentId)) throw new AdminError(422, 'Una zona no puede estar dentro de sí misma');
    }
    try { return await db.saveZone(s.tenantId, { parentId: v.parentId ?? null, name: v.name, kind: v.kind, position: v.position }, zoneId); } catch (e) { mapError(e); }
  }
  async function deleteZone(zoneId: string) {
    requireZones();
    if (!(await db.deleteZone(zoneId))) throw new AdminError(404, 'Zona no encontrada');
  }
  async function setAssignments(userId: string, zoneIds: string[]) {
    requireManager();
    const m = (await names()).get(userId);
    if (!m || m.role === 'partner') throw new AdminError(404, 'Esa persona no está en el equipo interno');
    const valid = new Set((await db.listZones(s.tenantId)).map((z) => z.id));
    if (zoneIds.some((z) => !valid.has(z))) throw new AdminError(404, 'Zona no encontrada');
    try { await db.setAssignments(s.tenantId, userId, [...new Set(zoneIds)]); } catch (e) { mapError(e); }
  }
  async function saveRules(input: unknown) {
    requireZones();
    const v: AccountRules = parse(rulesSchema, input);
    try { await db.saveRules(s.tenantId, v); } catch (e) { mapError(e); }
  }

  /** Importar cuentas (CSV): nombre, zona/ciudad, dirección, referencia, notas. Las zonas se buscan por nombre. */
  async function importCsv(text: string) {
    requireManager();
    const rows = parseCsv(text);
    if (rows.length < 2) throw new AdminError(422, 'El CSV necesita una cabecera y al menos una fila');
    const head = rows[0].map(norm);
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const c = { name: col('nombre', 'name', 'cuenta', 'local'), zone: col('zona', 'ciudad', 'city', 'zone', 'localidad'), address: col('direccion', 'address'),
      ref: col('referencia', 'ref', 'external_ref', 'id externo', 'id'), notes: col('notas', 'notes') };
    if (c.name < 0) throw new AdminError(422, 'Falta la columna «nombre»');
    const zones = await db.listZones(s.tenantId);
    const byName = new Map(zones.map((z) => [norm(z.name), z.id]));
    const out = { created: 0, duplicates: 0, unknownZones: [] as string[], errors: [] as string[] };
    for (const [k, r] of rows.slice(1).entries()) {
      const name = r[c.name]?.trim();
      if (!name) continue;
      const zoneName = c.zone >= 0 ? r[c.zone]?.trim() : '';
      const zoneId = zoneName ? byName.get(norm(zoneName)) ?? null : null;
      if (zoneName && !zoneId && !out.unknownZones.includes(zoneName)) out.unknownZones.push(zoneName);
      try {
        await db.insertAccount(s.tenantId, { name: name.slice(0, 160), zoneId, segmentId: null, address: c.address >= 0 ? r[c.address]?.slice(0, 300) || null : null,
          externalRef: c.ref >= 0 ? r[c.ref]?.slice(0, 120) || null : null, notes: c.notes >= 0 ? r[c.notes]?.slice(0, 2000) || null : null });
        out.created++;
      } catch (e) {
        if (/duplicate key|unique/i.test(String(e))) out.duplicates++;
        else out.errors.push(`Fila ${k + 2}: ${String(e).slice(0, 120)}`);
      }
      if (out.created + out.duplicates > 5000) { out.errors.push('Máximo 5.000 filas por importación'); break; }
    }
    return out;
  }

  /** Ventas ganadas que no generan comisión y esperan decisión. */
  async function conflicts() {
    requireManager();
    const [ds, members] = await Promise.all([admin.listDossiers(s.tenantId), names()]);
    return ds.filter((d) => d.outcome === 'won' && d.accountEligibility && d.accountEligibility !== 'eligible' && !d.accountDecision)
      .map((d) => ({ ...d, authorName: label(members.get(d.authorId ?? '')) }));
  }
  async function decide(dossierId: string, decision: AccountDecision | null) {
    requireManager();
    let ok: boolean;
    try { ok = await db.decide(dossierId, decision); } catch (e) { mapError(e); }
    if (!ok) throw new AdminError(404, 'Propuesta no encontrada');
  }

  return {
    territory, list, get, create, update, touch, block, unblock, assign, remove, colleagues,
    saveZone, deleteZone, setAssignments, saveRules, importCsv, conflicts, decide,
    preview: (accountId: string) => db.preview(accountId).catch(mapError),
    mine: async () => (perms.useAccounts ? (await list({ scope: 'mine' })).items : []),
    get rulesFor() { return db.getRules(s.tenantId); },
  };
}
export type AccountsService = ReturnType<typeof createAccountsService>;

/** Para contextos sin cuentas (tests de otros módulos). */
export const emptyAccountsDb: AccountsDb = {
  async listZones() { return []; }, async saveZone() { throw new Error('sin cuentas'); }, async deleteZone() { return false; },
  async listAssignments() { return []; }, async setAssignments() {}, async getRules() { return { claimDays: 30, strictZones: false, requireAccount: false }; },
  async saveRules() {}, async listAccounts() { return []; }, async getAccount() { return null; }, async insertAccount() { throw new Error('sin cuentas'); },
  async updateAccount() { return false; }, async deleteAccount() { return false; }, async touch() { return 'eligible'; }, async listTouches() { return []; },
  async preview() { return 'eligible'; }, async decide() { return false; },
};
export type { ZoneAssignment };
