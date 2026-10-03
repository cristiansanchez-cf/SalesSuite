/**
 * Comisiones (docs/COMMISSIONS.md): planes, ingresos, cálculo, aprobación y liquidaciones.
 * El cálculo es del motor puro (engine.ts); aquí se carga el contexto, se valida y se escribe.
 * Postgres impide duplicados y cambios en lo aprobado aunque este código fallara.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { AccountsDb } from '../accounts/db';
import type { AdminDb } from '../admin/db';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import type { AdminSession, MemberRecord } from '../admin/types';
import type { CommissionsDb } from './db';
import { computeCommissions } from './engine';
import { parseMapping } from './ingest';
import { parseMoney, periodOf } from './money';
import { declareSchema, planSchema, ruleSchema } from './schema';
import type { EngineContext, Entry, EntryStatus, Plan, RevenueEvent, Rule } from './types';
import { z } from 'zod';

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}
function mapError(e: unknown): never {
  if (e instanceof AdminError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  const clean = msg.replace(/^(permission denied|check_violation|duplicate key|\[supabase\]):\s*/i, '');
  if (/duplicate key|unique/i.test(msg)) throw new AdminError(409, /default/i.test(msg) ? 'Ya hay un plan por defecto' : /payout/i.test(msg) ? 'Ya hay una liquidación de ese periodo para esa persona' : 'Ya existe');
  if (/permission denied|row-level/i.test(msg)) throw new AdminError(403, clean || 'Sin permiso');
  if (/check_violation|check constraint/i.test(msg)) throw new AdminError(409, clean);
  throw e;
}
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function createCommissionsService(db: CommissionsDb, deps: { admin: AdminDb; accounts: AccountsDb }, s: AdminSession, opts: { now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date());
  const perms = can(s.role);
  const requireAdmin = () => { if (!perms.manageCommissions) throw new AdminError(403, 'Solo un/a admin gestiona las comisiones'); };
  const requireRead = () => { if (!perms.manageTeam) throw new AdminError(403, 'Solo admins y jefes/as de ventas ven las comisiones del equipo'); };

  async function members(): Promise<Map<string, MemberRecord>> {
    return new Map((await deps.admin.listMembers(s.tenantId)).map((m) => [m.userId, m]));
  }

  // ---------------------------------------------------------------- planes
  async function plans() {
    const [ps, pm] = await Promise.all([db.listPlans(s.tenantId), db.listPlanMembers(s.tenantId)]);
    return { plans: ps.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'es')), assignments: pm };
  }
  async function savePlan(input: unknown, id?: string) {
    requireAdmin();
    const v = parse(planSchema, input);
    try { return await db.savePlan(s.tenantId, { name: v.name, isDefault: v.isDefault, rules: v.rules as Rule[], referral: v.referral ?? null }, id); } catch (e) { mapError(e); }
  }
  async function getPlan(id: string): Promise<Plan> {
    const p = (await db.listPlans(s.tenantId)).find((x) => x.id === id);
    if (!p) throw new AdminError(404, 'Plan no encontrado');
    return p;
  }
  const writePlan = async (p: Plan) => { try { await db.savePlan(s.tenantId, { name: p.name, isDefault: p.isDefault, rules: p.rules, referral: p.referral }, p.id); } catch (e) { mapError(e); } };

  /** MVP: «¿Comisiones iguales en todo? Sí: X %». Crea o actualiza el plan por defecto; la regla general va la última. */
  async function setFlat(pctInput: unknown) {
    requireAdmin();
    const pct = Number(String(pctInput).replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new AdminError(422, 'El porcentaje debe estar entre 0 y 100');
    const bps = Math.round(pct * 100);
    const flat: Rule = { id: 'todo-igual', label: `Todo igual: ${pct.toLocaleString('es-ES')} %`, when: {}, pay: { type: 'percent', bps } };
    const def = (await db.listPlans(s.tenantId)).find((p) => p.isDefault);
    if (!def) {
      try { return await db.savePlan(s.tenantId, { name: 'General', isDefault: true, rules: [flat], referral: null }); } catch (e) { mapError(e); }
    }
    await writePlan({ ...def, rules: [...def.rules.filter((r) => r.id !== 'todo-igual'), flat] });
    return def.id;
  }
  async function addRule(planId: string, input: unknown) {
    requireAdmin();
    const r = parse(ruleSchema, input) as Rule;
    const p = await getPlan(planId);
    // Las excepciones van ENCIMA de la regla general («gana la primera que encaja»).
    const general = p.rules.findIndex((x) => x.id === 'todo-igual');
    const rules = [...p.rules];
    rules.splice(general >= 0 ? general : rules.length, 0, r);
    await writePlan({ ...p, rules });
    return r.id;
  }
  async function removeRule(planId: string, ruleId: string) {
    requireAdmin();
    const p = await getPlan(planId);
    await writePlan({ ...p, rules: p.rules.filter((r) => r.id !== ruleId) });
  }
  async function moveRule(planId: string, ruleId: string, dir: -1 | 1) {
    requireAdmin();
    const p = await getPlan(planId);
    const i = p.rules.findIndex((r) => r.id === ruleId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.rules.length) return;
    const rules = [...p.rules];
    [rules[i], rules[j]] = [rules[j], rules[i]];
    await writePlan({ ...p, rules });
  }
  async function setReferral(planId: string, input: { pct: unknown; months: unknown }) {
    requireAdmin();
    const pct = Number(String(input.pct ?? '0').replace(',', '.'));
    const months = Number(input.months ?? 12);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || !Number.isInteger(months) || months < 1 || months > 120) throw new AdminError(422, 'Referidos: % entre 0 y 100 y de 1 a 120 meses');
    const p = await getPlan(planId);
    await writePlan({ ...p, referral: pct > 0 ? { bps: Math.round(pct * 100), months } : null });
  }
  async function deletePlan(id: string) {
    requireAdmin();
    const p = await getPlan(id);
    if (p.isDefault) throw new AdminError(409, 'El plan por defecto no se borra: es el que se aplica a quien no tiene otro');
    if (!(await db.deletePlan(id))) throw new AdminError(404, 'Plan no encontrado');
  }
  async function assignPlan(userId: string, planId: string | null) {
    requireAdmin();
    if (!(await members()).has(userId)) throw new AdminError(404, 'Esa persona no está en el equipo');
    if (planId) await getPlan(planId);
    try { await db.setPlanMember(s.tenantId, userId, planId); } catch (e) { mapError(e); }
  }

  // ---------------------------------------------------------------- ingresos
  /** Venta declarada al ganar: queda pendiente hasta que un admin la confirma. */
  async function declareSale(dossierId: string, input: unknown) {
    const v = parse(declareSchema, input);
    const d = await deps.admin.getDossier(dossierId);
    if (!d || d.tenantId !== s.tenantId) throw new AdminError(404, 'Propuesta no encontrada');
    if (d.authorId !== s.userId) throw new AdminError(403, 'Solo quien hizo la propuesta declara su venta');
    if (d.outcome !== 'won') throw new AdminError(409, 'Márcala como ganada antes de declarar la venta');
    try {
      return await db.insertEvent(s.tenantId, {
        source: 'manual', externalId: `dossier:${d.id}:${v.occurredAt}:${v.kind}`, kind: v.kind, status: 'pending', occurredAt: new Date(`${v.occurredAt}T12:00:00Z`).toISOString(),
        amountCents: v.amount, revenueCents: v.amount, currency: d.currency || 'EUR', accountId: d.accountId, dossierId: d.id, sellerId: s.userId,
        offer: v.offer, metric: null, quantity: null, refundsEventId: null, note: v.note,
      });
    } catch (e) {
      if (/duplicate key/i.test(String(e))) throw new AdminError(409, 'Ya declaraste esta venta con esa fecha');
      mapError(e);
    }
  }
  async function confirmEvent(id: string) { requireAdmin(); try { if (!(await db.setEventStatus(id, 'confirmed'))) throw new AdminError(404, 'Ingreso no encontrado'); } catch (e) { mapError(e); } }
  async function voidEvent(id: string) { requireAdmin(); try { if (!(await db.setEventStatus(id, 'void'))) throw new AdminError(404, 'Ingreso no encontrado'); } catch (e) { mapError(e); } }
  async function events(f: { status?: RevenueEvent['status'] } = {}) {
    return db.listEvents(s.tenantId, { ...f, limit: 500 });
  }

  // ---------------------------------------------------------------- cálculo
  async function context(evs: RevenueEvent[], existing: Entry[]): Promise<EngineContext> {
    const [ps, pm, ms, dossiers, zones] = await Promise.all([
      db.listPlans(s.tenantId), db.listPlanMembers(s.tenantId), deps.admin.listMembers(s.tenantId), deps.admin.listDossiers(s.tenantId), deps.accounts.listZones(s.tenantId),
    ]);
    const dossierIds = new Set(evs.map((e) => e.dossierId).filter(Boolean) as string[]);
    const ds = dossiers.filter((d) => dossierIds.has(d.id));
    const accountIds = [...new Set([...evs.map((e) => e.accountId), ...ds.map((d) => d.accountId)].filter(Boolean) as string[])];
    const accounts = accountIds.length ? await deps.accounts.listAccounts(s.tenantId, { ids: accountIds, limit: accountIds.length }) : [];
    return {
      plans: ps,
      planOf: new Map(pm.map((x) => [x.userId, x.planId])),
      members: new Map(ms.map((m) => [m.userId, { role: m.role, invitedBy: m.invitedBy, joinedAt: m.joinedAt }])),
      accounts: new Map(accounts.map((a) => [a.id, { zoneId: a.zoneId, wonAt: a.wonAt, wonBy: a.wonBy, ownerId: a.ownerId, status: a.status }])),
      dossiers: new Map(ds.map((d) => [d.id, { authorId: d.authorId, accountId: d.accountId, eligibility: d.accountEligibility, decision: d.accountDecision }])),
      zones: zones.map((z) => ({ id: z.id, parentId: z.parentId })),
      existing,
    };
  }
  /** Calcula lo nuevo. Volver a llamarlo no cambia nada (claves únicas). */
  async function process() {
    requireAdmin();
    const [evs, existing] = await Promise.all([db.listEvents(s.tenantId), db.listEntries(s.tenantId)]);
    const r = computeCommissions(evs.filter((e) => e.status !== 'void'), await context(evs, existing));
    let created: number;
    try { created = await db.insertEntries(s.tenantId, r.entries); } catch (e) { mapError(e); }
    const reasons = new Map<string, number>();
    for (const x of r.skipped) reasons.set(x.reason, (reasons.get(x.reason) ?? 0) + 1);
    return { created, skipped: [...reasons.entries()].map(([reason, count]) => ({ reason, count })) };
  }
  /** Tras cambiar un plan: borra lo pendiente (nunca lo aprobado) y vuelve a calcular. */
  async function recalculate() {
    requireAdmin();
    const pend = (await db.listEntries(s.tenantId)).filter((e) => (e.status === 'pending' || e.status === 'ineligible') && e.kind !== 'adjustment');
    try { await db.deleteEntries(pend.map((e) => e.id)); } catch (e) { mapError(e); }
    return { removed: pend.length, ...(await process()) };
  }

  // ---------------------------------------------------------------- libro
  async function setStatus(ids: string[], status: Extract<EntryStatus, 'approved' | 'void'>) {
    requireAdmin();
    try { return await db.setEntryStatus(ids, status); } catch (e) { mapError(e); }
  }
  async function approvePeriod(period: string) {
    requireAdmin();
    const ids = (await db.listEntries(s.tenantId)).filter((e) => e.status === 'pending' && e.period <= period).map((e) => e.id);
    return setStatus(ids, 'approved');
  }
  async function adjust(input: { userId: string; amount: unknown; reason: string; period?: string }) {
    requireAdmin();
    if (!(await members()).has(input.userId)) throw new AdminError(404, 'Esa persona no está en el equipo');
    let cents: number;
    try { cents = parseMoney(String(input.amount)); } catch { throw new AdminError(422, 'Importe no válido'); }
    if (cents === 0) throw new AdminError(422, 'Un ajuste de 0 € no hace nada');
    const reason = input.reason.trim();
    if (!reason) throw new AdminError(422, 'Explica el motivo: lo verá la persona');
    const period = input.period && /^\d{4}-\d{2}$/.test(input.period) ? input.period : periodOf(now().toISOString());
    try {
      await db.insertEntries(s.tenantId, [{
        userId: input.userId, eventId: null, dedupeKey: `adj:${now().getTime()}:${randomBytes(4).toString('hex')}`, kind: 'adjustment', ruleId: null,
        ruleLabel: 'Ajuste manual', baseCents: 0, amountCents: cents, currency: 'EUR', period, status: 'pending', reason: reason.slice(0, 300), accountId: null,
      }]);
    } catch (e) { mapError(e); }
  }

  /** Liquida lo aprobado hasta `period`: una liquidación por persona y moneda, con el total congelado. */
  async function settle(period: string) {
    requireAdmin();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AdminError(422, 'Periodo no válido (AAAA-MM)');
    const open = (await db.listEntries(s.tenantId)).filter((e) => e.status === 'approved' && !e.payoutId && e.period <= period);
    const groups = new Map<string, Entry[]>();
    for (const e of open) groups.set(`${e.userId}|${e.currency}`, [...(groups.get(`${e.userId}|${e.currency}`) ?? []), e]);
    const created: string[] = [];
    const held: string[] = [];
    for (const [k, es] of groups) {
      const [userId, currency] = k.split('|');
      const total = es.reduce((a, e) => a + e.amountCents, 0);
      // Un saldo negativo (devoluciones) no se liquida: se compensa con lo siguiente.
      if (total <= 0) { held.push(userId); continue; }
      try { created.push(await db.createPayout(s.tenantId, { userId, period, currency, totalCents: total, entryIds: es.map((e) => e.id) })); } catch (e) { mapError(e); }
    }
    return { created: created.length, held: held.length };
  }
  async function markPaid(id: string) { requireAdmin(); try { if (!(await db.markPayoutPaid(id))) throw new AdminError(404, 'Liquidación no encontrada'); } catch (e) { mapError(e); } }
  async function deletePayout(id: string) { requireAdmin(); try { if (!(await db.deletePayout(id))) throw new AdminError(404, 'Liquidación no encontrada'); } catch (e) { mapError(e); } }

  /** Resumen por persona: pendiente, aprobado por liquidar, liquidado sin pagar y pagado. */
  function totals(entries: Entry[]) {
    const t = { pending: 0, ineligible: 0, approved: 0, settled: 0, paid: 0 };
    for (const e of entries) {
      if (e.status === 'pending') t.pending += e.amountCents;
      else if (e.status === 'ineligible') t.ineligible += e.amountCents;
      else if (e.status === 'approved') { if (e.payoutId) t.settled += e.amountCents; else t.approved += e.amountCents; }
      else if (e.status === 'paid') t.paid += e.amountCents;
    }
    return t;
  }
  async function team() {
    requireRead();
    const [entries, payouts, ms, p] = await Promise.all([db.listEntries(s.tenantId), db.listPayouts(s.tenantId), members(), plans()]);
    const planOf = new Map(p.assignments.map((a) => [a.userId, a.planId]));
    const def = p.plans.find((x) => x.isDefault);
    const people = [...ms.values()].map((m) => ({
      userId: m.userId, name: m.displayName || m.email, role: m.role, plan: p.plans.find((x) => x.id === planOf.get(m.userId)) ?? def ?? null,
      totals: totals(entries.filter((e) => e.userId === m.userId)),
    }));
    return { people, entries, payouts, totals: totals(entries), plans: p, names: new Map([...ms].map(([k, v]) => [k, v.displayName || v.email])) };
  }
  async function mine() {
    const [entries, payouts] = await Promise.all([db.listEntries(s.tenantId, { userId: s.userId }), db.listPayouts(s.tenantId, { userId: s.userId })]);
    const mineOnly = entries.filter((e) => e.userId === s.userId);
    return { entries: mineOnly, payouts: payouts.filter((p) => p.userId === s.userId), totals: totals(mineOnly) };
  }

  // ---------------------------------------------------------------- API
  async function createApiKey(name: string) {
    requireAdmin();
    const n = name.trim().slice(0, 80);
    if (!n) throw new AdminError(422, 'Ponle un nombre (p. ej. «Pasarela Oquea»)');
    const key = `ss_live_${randomBytes(24).toString('base64url')}`;
    await db.createApiKey(s.tenantId, { name: n, keyHash: hashKey(key), prefix: key.slice(0, 12) });
    return key;  // solo se muestra una vez
  }
  async function revokeApiKey(id: string) { requireAdmin(); if (!(await db.revokeApiKey(id))) throw new AdminError(404, 'Clave no encontrada'); }
  async function saveConnector(input: { key: string; name: string; mapping: string; active?: boolean }, id?: string) {
    requireAdmin();
    const key = input.key.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(key)) throw new AdminError(422, 'Clave: minúsculas, números y guiones (p. ej. oquea-pagos)');
    let mapping: unknown;
    try { mapping = JSON.parse(input.mapping); parseMapping(mapping); } catch (e) { throw new AdminError(422, `Mapeo no válido: ${e instanceof Error ? e.message : e}`); }
    try { return await db.saveConnector(s.tenantId, { key, name: input.name.trim().slice(0, 80) || key, mapping: mapping as Record<string, unknown>, active: input.active ?? true }, id); } catch (e) { mapError(e); }
  }

  return {
    plans, savePlan, setFlat, addRule, removeRule, moveRule, setReferral, deletePlan, assignPlan,
    declareSale, confirmEvent, voidEvent, events, process, recalculate,
    approve: (ids: string[]) => setStatus(ids, 'approved'), voidEntries: (ids: string[]) => setStatus(ids, 'void'), approvePeriod, adjust,
    settle, markPaid, deletePayout, team, mine,
    apiKeys: async () => { requireAdmin(); return db.listApiKeys(s.tenantId); }, createApiKey, revokeApiKey,
    connectors: async () => { requireAdmin(); return db.listConnectors(s.tenantId); }, saveConnector,
    deleteConnector: async (id: string) => { requireAdmin(); if (!(await db.deleteConnector(id))) throw new AdminError(404, 'Conector no encontrado'); },
    canManage: perms.manageCommissions, canReadTeam: perms.manageTeam,
  };
}
export type CommissionsService = ReturnType<typeof createCommissionsService>;

/** Para contextos sin comisiones (tests de otros módulos). */
export const emptyCommissionsDb: CommissionsDb = {
  async listPlans() { return []; }, async savePlan() { throw new Error('permission denied: sin comisiones'); }, async deletePlan() { return false; },
  async listPlanMembers() { return []; }, async setPlanMember() {}, async listEvents() { return []; }, async findEvent() { return null; },
  async insertEvent() { throw new Error('permission denied: sin comisiones'); }, async setEventStatus() { return false; }, async listEntries() { return []; },
  async insertEntries() { return 0; }, async setEntryStatus() { return 0; }, async deleteEntries() { return 0; }, async listPayouts() { return []; },
  async createPayout() { throw new Error('permission denied: sin comisiones'); }, async markPayoutPaid() { return false; }, async deletePayout() { return false; },
  async listApiKeys() { return []; }, async createApiKey() { throw new Error('permission denied: sin comisiones'); }, async revokeApiKey() { return false; },
  async listConnectors() { return []; }, async saveConnector() { throw new Error('permission denied: sin comisiones'); }, async deleteConnector() { return false; },
};
