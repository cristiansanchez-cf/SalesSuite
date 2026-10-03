import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommissionsDb, IngestDb } from './db';
import type { Entry, Plan, RevenueEvent } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === '42501') throw new Error(`permission denied: ${res.error.message}`);
    if (res.error.code === '23514') throw new Error(`check_violation: ${res.error.message}`);
    if (res.error.code === '23505') throw new Error(`duplicate key: ${res.error.message}`);
    throw new Error(`[supabase] ${res.error.message}`);
  }
  return res.data;
}
const big = (v: unknown) => (v == null ? 0 : Number(v));
const toEvent = (r: Row): RevenueEvent => ({
  id: r.id, tenantId: r.tenant_id, source: r.source, externalId: r.external_id, kind: r.kind, status: r.status, occurredAt: r.occurred_at,
  amountCents: big(r.amount_cents), revenueCents: big(r.revenue_cents), currency: r.currency, accountId: r.account_id, dossierId: r.dossier_id,
  sellerId: r.seller_id, offer: r.offer, metric: r.metric, quantity: r.quantity == null ? null : Number(r.quantity), refundsEventId: r.refunds_event_id,
  note: r.note, createdAt: r.created_at,
});
const toEntry = (r: Row): Entry => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, eventId: r.event_id, dedupeKey: r.dedupe_key, kind: r.kind, ruleId: r.rule_id, ruleLabel: r.rule_label,
  baseCents: big(r.base_cents), amountCents: big(r.amount_cents), currency: r.currency, period: r.period, status: r.status, reason: r.reason,
  accountId: r.account_id, payoutId: r.payout_id, createdAt: r.created_at,
});
const eventRow = (t: string, e: Omit<RevenueEvent, 'id' | 'tenantId' | 'createdAt'>) => ({
  tenant_id: t, source: e.source, external_id: e.externalId, kind: e.kind, status: e.status, occurred_at: e.occurredAt, amount_cents: e.amountCents,
  revenue_cents: e.revenueCents, currency: e.currency, account_id: e.accountId, dossier_id: e.dossierId, seller_id: e.sellerId, offer: e.offer,
  metric: e.metric, quantity: e.quantity, refunds_event_id: e.refundsEventId, note: e.note,
});

export function supabaseCommissionsDb(sb: SupabaseClient): CommissionsDb {
  return {
    async listPlans(t) {
      return (check(await sb.from('commission_plan').select('*').eq('tenant_id', t)) ?? []).map((p: Row): Plan => ({
        id: p.id, tenantId: p.tenant_id, name: p.name, isDefault: p.is_default, rules: p.rules ?? [], referral: p.referral ?? null, updatedAt: p.updated_at,
      }));
    },
    async savePlan(t, p, id) {
      const row = { tenant_id: t, name: p.name, is_default: p.isDefault, rules: p.rules, referral: p.referral };
      if (id) {
        if (!(check(await sb.from('commission_plan').update(row).eq('id', id).select('id')) ?? []).length) throw new Error('permission denied: plan');
        return id;
      }
      return (check(await sb.from('commission_plan').insert(row).select('id').single()) as Row).id;
    },
    async deletePlan(id) { return (check(await sb.from('commission_plan').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async listPlanMembers(t) {
      return (check(await sb.from('commission_plan_member').select('user_id, plan_id').eq('tenant_id', t)) ?? []).map((r: Row) => ({ userId: r.user_id, planId: r.plan_id }));
    },
    async setPlanMember(t, userId, planId) {
      // upsert (no borrar + insertar): el historial de condiciones registra un solo cambio.
      if (planId) check(await sb.from('commission_plan_member').upsert({ tenant_id: t, user_id: userId, plan_id: planId }));
      else check(await sb.from('commission_plan_member').delete().eq('tenant_id', t).eq('user_id', userId));
    },

    async listEvents(t, f = {}) {
      let q = sb.from('revenue_event').select('*').eq('tenant_id', t);
      if (f.status) q = q.eq('status', f.status);
      return (check(await q.order('occurred_at', { ascending: false }).limit(f.limit ?? 5000)) ?? []).map(toEvent);
    },
    async findEvent(t, source, externalId) {
      const r = check(await sb.from('revenue_event').select('*').eq('tenant_id', t).eq('source', source).eq('external_id', externalId).maybeSingle());
      return r ? toEvent(r) : null;
    },
    async insertEvent(t, e) { return (check(await sb.from('revenue_event').insert(eventRow(t, e)).select('id').single()) as Row).id; },
    async setEventStatus(id, status) { return (check(await sb.from('revenue_event').update({ status }).eq('id', id).select('id')) ?? []).length > 0; },

    async listEntries(t, f = {}) {
      let q = sb.from('commission_entry').select('*').eq('tenant_id', t);
      if (f.userId) q = q.eq('user_id', f.userId);
      return (check(await q.order('period', { ascending: false }).order('created_at', { ascending: false }).limit(20000)) ?? []).map(toEntry);
    },
    async insertEntries(t, drafts) {
      if (!drafts.length) return 0;
      let n = 0;
      for (let i = 0; i < drafts.length; i += 500) {
        const rows = drafts.slice(i, i + 500).map((d) => ({
          tenant_id: t, user_id: d.userId, event_id: d.eventId, dedupe_key: d.dedupeKey, kind: d.kind, rule_id: d.ruleId, rule_label: d.ruleLabel,
          base_cents: d.baseCents, amount_cents: d.amountCents, currency: d.currency, period: d.period, status: d.status, reason: d.reason, account_id: d.accountId,
        }));
        n += (check(await sb.from('commission_entry').upsert(rows, { onConflict: 'tenant_id,dedupe_key', ignoreDuplicates: true }).select('id')) ?? []).length;
      }
      return n;
    },
    async setEntryStatus(ids, status) {
      if (!ids.length) return 0;
      return (check(await sb.from('commission_entry').update({ status }).in('id', ids).select('id')) ?? []).length;
    },
    async deleteEntries(ids) {
      if (!ids.length) return 0;
      return (check(await sb.from('commission_entry').delete().in('id', ids).select('id')) ?? []).length;
    },

    async listPayouts(t, f = {}) {
      let q = sb.from('payout').select('*').eq('tenant_id', t);
      if (f.userId) q = q.eq('user_id', f.userId);
      return (check(await q.order('period', { ascending: false })) ?? []).map((p: Row) => ({
        id: p.id, tenantId: p.tenant_id, userId: p.user_id, period: p.period, totalCents: big(p.total_cents), currency: p.currency, status: p.status, paidAt: p.paid_at, createdAt: p.created_at,
      }));
    },
    async createPayout(t, p) {
      const id = (check(await sb.from('payout').insert({ tenant_id: t, user_id: p.userId, period: p.period, currency: p.currency, total_cents: p.totalCents }).select('id').single()) as Row).id as string;
      try {
        const rows = check(await sb.from('commission_entry').update({ payout_id: id }).in('id', p.entryIds).select('id')) ?? [];
        if (rows.length !== p.entryIds.length) throw new Error('check_violation: no se pudieron liquidar todas las líneas');
      } catch (e) {
        await sb.from('payout').delete().eq('id', id);
        throw e;
      }
      return id;
    },
    async markPayoutPaid(id) { return (check(await sb.from('payout').update({ status: 'paid' }).eq('id', id).select('id')) ?? []).length > 0; },
    async deletePayout(id) { return (check(await sb.from('payout').delete().eq('id', id).select('id')) ?? []).length > 0; },

    async listApiKeys(t) {
      return (check(await sb.from('api_key').select('id, tenant_id, name, prefix, created_at, last_used_at, revoked_at').eq('tenant_id', t).order('created_at')) ?? [])
        .map((k: Row) => ({ id: k.id, tenantId: k.tenant_id, name: k.name, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at }));
    },
    async createApiKey(t, k) { return (check(await sb.from('api_key').insert({ tenant_id: t, name: k.name, key_hash: k.keyHash, prefix: k.prefix }).select('id').single()) as Row).id; },
    async revokeApiKey(id) { return (check(await sb.from('api_key').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id')) ?? []).length > 0; },
    async listConnectors(t) {
      return (check(await sb.from('connector').select('*').eq('tenant_id', t).order('key')) ?? []).map((c: Row) => ({ id: c.id, tenantId: c.tenant_id, key: c.key, name: c.name, mapping: c.mapping, active: c.active }));
    },
    async saveConnector(t, c, id) {
      const row = { tenant_id: t, key: c.key, name: c.name, mapping: c.mapping, active: c.active, updated_at: new Date().toISOString() };
      if (id) { check(await sb.from('connector').update(row).eq('id', id)); return id; }
      return (check(await sb.from('connector').insert(row).select('id').single()) as Row).id;
    },
    async deleteConnector(id) { return (check(await sb.from('connector').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async listCoupons(t) {
      const [cs, ds] = await Promise.all([
        sb.from('coupon').select('*').eq('tenant_id', t).order('created_at'),
        sb.from('dossier').select('coupon_id').eq('tenant_id', t).not('coupon_id', 'is', null),
      ]);
      const uses = new Map<string, number>();
      for (const d of check(ds) ?? []) uses.set((d as Row).coupon_id, (uses.get((d as Row).coupon_id) ?? 0) + 1);
      return (check(cs) ?? []).map((c: Row) => ({
        id: c.id, tenantId: c.tenant_id, code: c.code, label: c.label, kind: c.kind, value: c.value, maxUses: c.max_uses, validUntil: c.valid_until,
        active: c.active, note: c.note, uses: uses.get(c.id) ?? 0,
      }));
    },
    async listConditions(t) {
      return (check(await sb.from('member_conditions').select('user_id, visible, note, agreed_at').eq('tenant_id', t)) ?? [])
        .map((r: Row) => ({ userId: r.user_id, visible: r.visible, note: r.note, agreedAt: r.agreed_at }));
    },
    async setConditions(t, userId, c) {
      const cur = check(await sb.from('member_conditions').select('agreed_at').eq('tenant_id', t).eq('user_id', userId).maybeSingle()) as Row | null;
      check(await sb.from('member_conditions').upsert({
        tenant_id: t, user_id: userId, visible: c.visible, note: c.note, agreed_at: cur?.agreed_at ?? (c.visible ? new Date().toISOString() : null),
      }));
    },
    async conditionsHistory(t, userId) {
      let q = sb.from('member_conditions_history').select('user_id, visible, note, plan, changed_by, changed_at').eq('tenant_id', t);
      if (userId) q = q.eq('user_id', userId);
      return (check(await q.order('changed_at', { ascending: false }).limit(200)) ?? [])
        .map((r: Row) => ({ userId: r.user_id, visible: r.visible, note: r.note, plan: r.plan ?? null, changedBy: r.changed_by, changedAt: r.changed_at }));
    },
    async myConditions(t) {
      const r = check(await sb.rpc('my_conditions', { p_tenant: t })) as Row;
      return { visible: !!r?.visible, note: r?.note ?? null, agreedAt: r?.agreedAt ?? null, plan: r?.plan ?? null };
    },
    async saveCoupon(t, c, id) {
      const row = { tenant_id: t, code: c.code, label: c.label, kind: c.kind, value: c.value, max_uses: c.maxUses, valid_until: c.validUntil, active: c.active, note: c.note };
      if (id) {
        if (!(check(await sb.from('coupon').update(row).eq('id', id).select('id')) ?? []).length) throw new Error('permission denied: cupón');
        return id;
      }
      return (check(await sb.from('coupon').insert(row).select('id').single()) as Row).id;
    },
  };
}

/** SOLO con service role (rutas /api/v1): el tenant lo fija la clave API, nunca el cuerpo de la petición. */
export function supabaseIngestDb(sb: SupabaseClient): IngestDb {
  return {
    async tenantForKey(hash) {
      const k = check(await sb.from('api_key').select('id, tenant_id').eq('key_hash', hash).is('revoked_at', null).maybeSingle()) as Row | null;
      return k ? { tenantId: k.tenant_id, keyId: k.id } : null;
    },
    async touchKey(id) { await sb.from('api_key').update({ last_used_at: new Date().toISOString() }).eq('id', id); },
    async connector(t, key) {
      const c = check(await sb.from('connector').select('*').eq('tenant_id', t).eq('key', key).eq('active', true).maybeSingle()) as Row | null;
      return c ? { id: c.id, tenantId: c.tenant_id, key: c.key, name: c.name, mapping: c.mapping, active: c.active } : null;
    },
    async findEvent(t, source, externalId) {
      const r = check(await sb.from('revenue_event').select('*').eq('tenant_id', t).eq('source', source).eq('external_id', externalId).maybeSingle());
      return r ? toEvent(r) : null;
    },
    async insertEvent(t, e) { return (check(await sb.from('revenue_event').insert(eventRow(t, e)).select('id').single()) as Row).id; },
    async accountByRef(t, ref) {
      const r = check(await sb.from('account').select('id').eq('tenant_id', t).eq('external_ref', ref).maybeSingle()) as Row | null;
      return r?.id ?? null;
    },
    async userByEmail(t, email) {
      const rows = check(await sb.from('membership').select('user_id, users!membership_user_id_fkey!inner(email)').eq('tenant_id', t).ilike('users.email', email.replace(/[%_\\]/g, (c) => `\\${c}`))) ?? [];
      return (rows[0] as Row | undefined)?.user_id ?? null;
    },
    async dossierInTenant(t, id) { return !!check(await sb.from('dossier').select('id').eq('tenant_id', t).eq('id', id).maybeSingle()); },
    async webhookSecret(t) {
      const r = check(await sb.from('tenant_secret').select('secret').eq('tenant_id', t).eq('kind', 'stripe_webhook').maybeSingle()) as Row | null;
      return r?.secret ?? null;
    },
    async subscriptionDossier(t, sub) {
      const r = check(await sb.from('stripe_subscription').select('dossier_id').eq('tenant_id', t).eq('subscription_id', sub).maybeSingle()) as Row | null;
      return r?.dossier_id ?? null;
    },
    async linkSubscription(t, sub, dossierId) {
      check(await sb.from('stripe_subscription').upsert({ tenant_id: t, subscription_id: sub, dossier_id: dossierId }, { onConflict: 'tenant_id,subscription_id', ignoreDuplicates: true }));
    },
    async attachDossier(t, source, externalId, dossierId) {
      check(await sb.from('revenue_event').update({ dossier_id: dossierId }).eq('tenant_id', t).eq('source', source).eq('external_id', externalId).is('dossier_id', null));
    },
  };
}
