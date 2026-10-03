/**
 * Comisiones en memoria (modo DEMO). Replica la RLS y los triggers de
 * supabase/migrations/20261013000000_commissions.sql (mismos errores, mismas transiciones).
 */
import { randomUUID } from 'node:crypto';
import { demoDb, type CommissionEntryRow, type RevenueEventRow } from '../data/store';
import { notifyRoles, resolveNotifications, userLabel } from '../notify/db-demo';
import type { CommissionsDb, IngestDb } from './db';
import type { Entry, EventKind, EventStatus, Plan, RevenueEvent } from './types';

const db = () => demoDb();
const now = () => new Date().toISOString();
const deny = (m: string): never => { throw new Error(`permission denied: ${m}`); };
const check = (m: string): never => { throw new Error(`check_violation: ${m}`); };

const toEvent = (r: RevenueEventRow): RevenueEvent => ({
  id: r.id, tenantId: r.tenant_id, source: r.source, externalId: r.external_id, kind: r.kind as EventKind, status: r.status as EventStatus,
  occurredAt: r.occurred_at, amountCents: r.amount_cents, revenueCents: r.revenue_cents, currency: r.currency, accountId: r.account_id,
  dossierId: r.dossier_id, sellerId: r.seller_id, offer: r.offer, metric: r.metric, quantity: r.quantity, refundsEventId: r.refunds_event_id,
  note: r.note, createdAt: r.created_at,
});
const toEntry = (r: CommissionEntryRow): Entry => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, eventId: r.event_id, dedupeKey: r.dedupe_key, kind: r.kind as Entry['kind'], ruleId: r.rule_id,
  ruleLabel: r.rule_label, baseCents: r.base_cents, amountCents: r.amount_cents, currency: r.currency, period: r.period, status: r.status as Entry['status'],
  reason: r.reason, accountId: r.account_id, payoutId: r.payout_id, createdAt: r.created_at,
});
function notifyUser(t: string, userId: string, kind: string, entity: string, params: Record<string, unknown>) {
  const s = db();
  if (s.notification.some((n) => n.user_id === userId && n.tenant_id === t && n.kind === kind && n.entity_key === entity)) return;
  s.notification.push({ id: randomUUID(), tenant_id: t, user_id: userId, kind, severity: 'info', entity_key: entity, params, created_at: now(),
    read_at: null, dismissed_at: null, emailed_at: null, resolved_at: null });
}
const roleOf = (t: string, u: string) => db().users.find((x) => x.id === u)?.memberships.find((m) => m.tenant_id === t)?.role ?? null;

function insertEventRow(t: string, e: Parameters<CommissionsDb['insertEvent']>[1], actor: string | null): string {
  const s = db();
  if (s.revenue_event.some((x) => x.tenant_id === t && x.source === e.source && x.external_id === e.externalId)) throw new Error('duplicate key: revenue_event');
  if (e.amountCents < 0 || e.revenueCents < 0 || !Number.isSafeInteger(e.amountCents) || !Number.isSafeInteger(e.revenueCents)) check('importe');
  if (e.kind === 'refund' && !e.refundsEventId) check('devolución sin original');
  const row: RevenueEventRow = {
    id: randomUUID(), tenant_id: t, source: e.source, external_id: e.externalId, kind: e.kind, status: e.status, occurred_at: e.occurredAt,
    amount_cents: e.amountCents, revenue_cents: e.revenueCents, currency: e.currency, account_id: e.accountId, dossier_id: e.dossierId, seller_id: e.sellerId,
    offer: e.offer, metric: e.metric, quantity: e.quantity, refunds_event_id: e.refundsEventId, note: e.note, created_by: actor, created_at: now(),
    confirmed_by: e.status === 'confirmed' ? actor : null, confirmed_at: e.status === 'confirmed' ? now() : null,
  };
  s.revenue_event.push(row);
  // = notify_revenue
  if (row.status === 'pending') notifyRoles(t, ['admin'], 'sale_to_confirm', 'action', row.id, { seller: userLabel(row.seller_id ?? row.created_by), amount: row.amount_cents, currency: row.currency, offer: row.offer }, actor);
  return row.id;
}

export function demoCommissionsDb(actor: string): CommissionsDb {
  const isAdmin = (t: string) => roleOf(t, actor) === 'admin';
  const isManager = (t: string) => ['admin', 'lead'].includes(roleOf(t, actor) ?? '');
  const admin = (t: string) => { if (!isAdmin(t)) deny('solo admin'); };
  return {
    async listPlans(t) {
      if (!roleOf(t, actor) || roleOf(t, actor) === 'partner') return [];
      return db().commission_plan.filter((p) => p.tenant_id === t).map((p) => ({ id: p.id, tenantId: p.tenant_id, name: p.name, isDefault: p.is_default, rules: structuredClone(p.rules) as Plan['rules'], referral: (p.referral as Plan['referral']) ?? null, updatedAt: p.updated_at }));
    },
    async savePlan(t, p, id) {
      admin(t);
      const s = db();
      if (p.isDefault && s.commission_plan.some((x) => x.tenant_id === t && x.is_default && x.id !== id)) throw new Error('duplicate key: commission_plan_default_uidx');
      const row = { id: id ?? randomUUID(), tenant_id: t, name: p.name, is_default: p.isDefault, rules: structuredClone(p.rules), referral: p.referral, updated_at: now() };
      s.commission_plan = [...s.commission_plan.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async deletePlan(id) {
      const s = db();
      const p = s.commission_plan.find((x) => x.id === id);
      if (!p || !isAdmin(p.tenant_id)) return false;
      s.commission_plan = s.commission_plan.filter((x) => x.id !== id);
      s.commission_plan_member = s.commission_plan_member.filter((x) => x.plan_id !== id);
      return true;
    },
    async listPlanMembers(t) {
      return db().commission_plan_member.filter((x) => x.tenant_id === t && (isManager(t) || x.user_id === actor)).map((x) => ({ userId: x.user_id, planId: x.plan_id }));
    },
    async setPlanMember(t, userId, planId) {
      admin(t);
      const s = db();
      s.commission_plan_member = s.commission_plan_member.filter((x) => !(x.tenant_id === t && x.user_id === userId));
      if (planId) s.commission_plan_member.push({ tenant_id: t, user_id: userId, plan_id: planId });
    },

    async listEvents(t, f = {}) {
      return db().revenue_event.filter((e) => e.tenant_id === t && (isManager(t) || e.seller_id === actor || e.created_by === actor) && (!f.status || e.status === f.status))
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, f.limit ?? 5000).map(toEvent);
    },
    async findEvent(t, source, externalId) {
      const e = db().revenue_event.find((x) => x.tenant_id === t && x.source === source && x.external_id === externalId);
      return e && (isManager(t) || e.seller_id === actor || e.created_by === actor) ? toEvent(e) : null;
    },
    async insertEvent(t, e) {
      if (!isAdmin(t)) {
        // = revenue_event_declare
        const d = db().dossier.find((x) => x.id === e.dossierId);
        const ok = roleOf(t, actor) && e.source === 'manual' && e.status === 'pending' && ['sale', 'recurring'].includes(e.kind) && e.sellerId === actor && d?.author_id === actor;
        if (!ok) deny('row-level security');
      }
      return insertEventRow(t, e, actor);
    },
    async setEventStatus(id, status) {
      const s = db();
      const e = s.revenue_event.find((x) => x.id === id);
      if (!e || !isAdmin(e.tenant_id)) return false;
      if (e.status === status) return true;
      if (e.status === 'void') check('Un ingreso anulado no se recupera');
      if (status === 'void') {
        if (s.commission_entry.some((x) => x.event_id === id && ['approved', 'paid'].includes(x.status))) check('Tiene comisiones aprobadas o pagadas: corrígelo con una devolución');
        s.commission_entry = s.commission_entry.filter((x) => !(x.event_id === id && ['pending', 'ineligible'].includes(x.status)));
      }
      if (status === 'confirmed') { e.confirmed_at = now(); e.confirmed_by = actor; }
      e.status = status;
      resolveNotifications(e.tenant_id, 'sale_to_confirm', id);
      return true;
    },

    async listEntries(t, f = {}) {
      return db().commission_entry.filter((x) => x.tenant_id === t && (isManager(t) || x.user_id === actor) && (!f.userId || x.user_id === f.userId))
        .sort((a, b) => b.period.localeCompare(a.period) || b.created_at.localeCompare(a.created_at)).map(toEntry);
    },
    async insertEntries(t, drafts) {
      admin(t);
      const s = db();
      let n = 0;
      for (const d of drafts) {
        if (!['pending', 'ineligible'].includes(d.status)) check('Una línea nace pendiente o no elegible');
        if (!Number.isSafeInteger(d.amountCents) || (d.amountCents < 0 && !['refund', 'adjustment'].includes(d.kind))) check('importe');
        if (d.kind === 'adjustment' && !d.reason?.trim()) check('ajuste sin motivo');
        if (s.commission_entry.some((x) => x.tenant_id === t && x.dedupe_key === d.dedupeKey)) continue;  // on conflict do nothing
        s.commission_entry.push({
          id: randomUUID(), tenant_id: t, user_id: d.userId, event_id: d.eventId, dedupe_key: d.dedupeKey, kind: d.kind, rule_id: d.ruleId, rule_label: d.ruleLabel,
          base_cents: d.baseCents, amount_cents: d.amountCents, currency: d.currency, period: d.period, status: d.status, reason: d.reason, account_id: d.accountId,
          payout_id: null, created_by: actor, created_at: now(), approved_by: null, approved_at: null,
        });
        n++;
      }
      return n;
    },
    async setEntryStatus(ids, status) {
      let n = 0;
      for (const e of db().commission_entry.filter((x) => ids.includes(x.id))) {
        if (!isAdmin(e.tenant_id)) continue;
        if (!['pending', 'ineligible'].includes(e.status)) check(`Cambio de estado no permitido (${e.status} → ${status})`);
        e.status = status;
        if (status === 'approved') { e.approved_at = now(); e.approved_by = actor; }
        n++;
      }
      return n;
    },
    async deleteEntries(ids) {
      const s = db();
      const gone = s.commission_entry.filter((x) => ids.includes(x.id) && isAdmin(x.tenant_id));
      if (gone.some((x) => !['pending', 'ineligible', 'void'].includes(x.status))) deny('Una línea aprobada o pagada no se borra: crea un ajuste');
      s.commission_entry = s.commission_entry.filter((x) => !gone.includes(x));
      return gone.length;
    },

    async listPayouts(t, f = {}) {
      return db().payout.filter((p) => p.tenant_id === t && (isManager(t) || p.user_id === actor) && (!f.userId || p.user_id === f.userId))
        .sort((a, b) => b.period.localeCompare(a.period))
        .map((p) => ({ id: p.id, tenantId: p.tenant_id, userId: p.user_id, period: p.period, totalCents: p.total_cents, currency: p.currency, status: p.status, paidAt: p.paid_at, createdAt: p.created_at }));
    },
    async createPayout(t, p) {
      admin(t);
      const s = db();
      if (s.payout.some((x) => x.tenant_id === t && x.user_id === p.userId && x.period === p.period && x.currency === p.currency)) throw new Error('duplicate key: payout');
      const lines = s.commission_entry.filter((x) => p.entryIds.includes(x.id));
      if (lines.some((x) => x.status !== 'approved' || x.payout_id)) check('Solo se liquida lo aprobado, una vez');
      const id = randomUUID();
      s.payout.push({ id, tenant_id: t, user_id: p.userId, period: p.period, total_cents: p.totalCents, currency: p.currency, status: 'open', paid_at: null, created_by: actor, created_at: now() });
      for (const x of lines) x.payout_id = id;
      notifyUser(t, p.userId, 'payout_ready', id, { period: p.period, amount: p.totalCents, currency: p.currency });  // = notify_payout
      return id;
    },
    async markPayoutPaid(id) {
      const s = db();
      const p = s.payout.find((x) => x.id === id);
      if (!p || !isAdmin(p.tenant_id)) return false;
      if (p.status === 'paid') return true;
      const lines = s.commission_entry.filter((x) => x.payout_id === id);
      if (lines.reduce((a, x) => a + x.amount_cents, 0) !== p.total_cents) check('Las líneas no cuadran con el total de la liquidación');
      p.status = 'paid'; p.paid_at = now();
      for (const x of lines) if (x.status === 'approved') x.status = 'paid';
      notifyUser(p.tenant_id, p.user_id, 'payout_paid', id, { period: p.period, amount: p.total_cents, currency: p.currency });
      return true;
    },
    async deletePayout(id) {
      const s = db();
      const p = s.payout.find((x) => x.id === id);
      if (!p || !isAdmin(p.tenant_id)) return false;
      if (p.status === 'paid') deny('Una liquidación pagada no se borra');
      for (const x of s.commission_entry) if (x.payout_id === id) x.payout_id = null;
      s.payout = s.payout.filter((x) => x.id !== id);
      return true;
    },

    async listApiKeys(t) {
      if (!isAdmin(t)) return [];
      return db().api_key.filter((k) => k.tenant_id === t).map((k) => ({ id: k.id, tenantId: k.tenant_id, name: k.name, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at }));
    },
    async createApiKey(t, k) {
      admin(t);
      const id = randomUUID();
      db().api_key.push({ id, tenant_id: t, name: k.name, key_hash: k.keyHash, prefix: k.prefix, created_by: actor, created_at: now(), last_used_at: null, revoked_at: null });
      return id;
    },
    async revokeApiKey(id) {
      const k = db().api_key.find((x) => x.id === id);
      if (!k || !isAdmin(k.tenant_id)) return false;
      k.revoked_at ??= now();
      return true;
    },
    async listConnectors(t) {
      if (!isAdmin(t)) return [];
      return db().connector.filter((c) => c.tenant_id === t).map((c) => ({ id: c.id, tenantId: c.tenant_id, key: c.key, name: c.name, mapping: structuredClone(c.mapping), active: c.active }));
    },
    async saveConnector(t, c, id) {
      admin(t);
      const s = db();
      if (s.connector.some((x) => x.tenant_id === t && x.key === c.key && x.id !== id)) throw new Error('duplicate key: connector');
      const row = { id: id ?? randomUUID(), tenant_id: t, key: c.key, name: c.name, mapping: structuredClone(c.mapping), active: c.active };
      s.connector = [...s.connector.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async listCoupons(t) {
      if (!['admin', 'lead', 'rep'].includes(roleOf(t, actor) ?? '')) return [];
      const s = db();
      return s.coupon.filter((c) => c.tenant_id === t).map((c) => ({
        id: c.id, tenantId: c.tenant_id, code: c.code, label: c.label, kind: c.kind, value: c.value, maxUses: c.max_uses, validUntil: c.valid_until,
        active: c.active, note: c.note, uses: s.dossier.filter((d) => d.coupon_id === c.id).length,
      }));
    },
    async saveCoupon(t, c, id) {
      admin(t);
      const s = db();
      if (s.coupon.some((x) => x.tenant_id === t && x.code === c.code && x.id !== id)) throw new Error('duplicate key: coupon');
      const row = { id: id ?? randomUUID(), tenant_id: t, code: c.code, label: c.label, kind: c.kind, value: c.value, max_uses: c.maxUses,
        valid_until: c.validUntil, active: c.active, note: c.note, created_at: s.coupon.find((x) => x.id === id)?.created_at ?? now() };
      s.coupon = [...s.coupon.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async listConditions(t) {
      return db().member_conditions.filter((c) => c.tenant_id === t && (isManager(t) || c.user_id === actor))
        .map((c) => ({ userId: c.user_id, visible: c.visible, note: c.note, agreedAt: c.agreed_at }));
    },
    async setConditions(t, userId, c) {
      admin(t);
      const s = db();
      if (!roleOf(t, userId)) throw new Error('violates foreign key: member_conditions → membership');
      const cur = s.member_conditions.find((x) => x.tenant_id === t && x.user_id === userId);
      const agreed = c.visible ? (cur?.agreed_at ?? now()) : (cur?.agreed_at ?? null);
      s.member_conditions = [...s.member_conditions.filter((x) => x !== cur), { tenant_id: t, user_id: userId, visible: c.visible, note: c.note, agreed_at: agreed }];
    },
    async myConditions(t) {
      // = RPC my_conditions
      if (!roleOf(t, actor)) deny('Sin acceso');
      const s = db();
      const c = s.member_conditions.find((x) => x.tenant_id === t && x.user_id === actor);
      if (!c?.visible) return { visible: false, note: null, agreedAt: null, plan: null };
      const planId = s.commission_plan_member.find((x) => x.tenant_id === t && x.user_id === actor)?.plan_id;
      const p = s.commission_plan.find((x) => x.tenant_id === t && (planId ? x.id === planId : x.is_default));
      return { visible: true, note: c.note, agreedAt: c.agreed_at, plan: p ? { name: p.name, rules: structuredClone(p.rules) as Plan['rules'], referral: (p.referral as Plan['referral']) ?? null } : null };
    },
    async deleteConnector(id) {
      const s = db();
      const c = s.connector.find((x) => x.id === id);
      if (!c || !isAdmin(c.tenant_id)) return false;
      s.connector = s.connector.filter((x) => x.id !== id);
      return true;
    },
  };
}

/** = trigger dossier_coupon_apply: valida y guarda una copia del cupón en la propuesta. */
export function demoApplyCoupon(d: import('../data/store').DossierRow, couponId: string | null) {
  if (couponId === (d.coupon_id ?? null)) return;
  if (!couponId) { d.coupon_id = null; d.discount = null; return; }
  const s = db();
  const c = s.coupon.find((x) => x.id === couponId && x.tenant_id === d.tenant_id);
  if (!c || !c.active) check('Cupón no disponible');
  if (c!.valid_until && c!.valid_until < new Date().toISOString().slice(0, 10)) check('El cupón ha caducado');
  if (c!.max_uses != null && s.dossier.filter((x) => x.coupon_id === c!.id && x.id !== d.id).length >= c!.max_uses) check('El cupón ya no tiene usos disponibles');
  d.coupon_id = c!.id;
  d.discount = { code: c!.code, label: c!.label, kind: c!.kind, value: c!.value };
}

/** = el servidor con service role: ve todos los tenants. */
export function demoIngestDb(): IngestDb {
  return {
    async tenantForKey(hash) {
      const k = db().api_key.find((x) => x.key_hash === hash && !x.revoked_at);
      return k ? { tenantId: k.tenant_id, keyId: k.id } : null;
    },
    async touchKey(id) { const k = db().api_key.find((x) => x.id === id); if (k) k.last_used_at = now(); },
    async connector(t, key) {
      const c = db().connector.find((x) => x.tenant_id === t && x.key === key && x.active);
      return c ? { id: c.id, tenantId: c.tenant_id, key: c.key, name: c.name, mapping: structuredClone(c.mapping), active: c.active } : null;
    },
    async findEvent(t, source, externalId) {
      const e = db().revenue_event.find((x) => x.tenant_id === t && x.source === source && x.external_id === externalId);
      return e ? toEvent(e) : null;
    },
    async insertEvent(t, e) { return insertEventRow(t, e, null); },
    async accountByRef(t, ref) { return db().account.find((a) => a.tenant_id === t && a.external_ref === ref)?.id ?? null; },
    async userByEmail(t, email) {
      const u = db().users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.memberships.some((m) => m.tenant_id === t));
      return u?.id ?? null;
    },
  };
}
