/** Personas e importaciones en memoria (modo DEMO). Replica supabase/migrations/20261103000000_crm_people.sql (RLS y triggers). */
import { randomUUID } from 'node:crypto';
import { checkFields } from '../accounts/db-demo';
import { demoDb, type CrmContactRow, type CrmImportRow, type PaymentRequestRow } from '../data/store';
import type { CrmDb } from './db';
import type { Contact, CrmImport, ImportMapping, LinkWhen, PaymentRequest } from './types';
import type { Activity } from './followup';
import { notifyRoles, userLabel } from '../notify/db-demo';

const db = () => demoDb();
const iso = () => new Date().toISOString();
/** Dos interacciones en el mismo milisegundo no deben empatar (en Postgres, now() lleva microsegundos). */
let lastAt = 0;
const monotonic = () => { lastAt = Math.max(Date.now(), lastAt + 1); return new Date(lastAt).toISOString(); };
const roleOf = (t: string, u: string) => db().users.find((x) => x.id === u)?.memberships.find((m) => m.tenant_id === t)?.role ?? null;
const isMember = (t: string, u: string) => !!roleOf(t, u);
const isManager = (t: string, u: string) => ['admin', 'lead'].includes(roleOf(t, u) ?? '');

const toContact = (r: CrmContactRow): Contact => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, email: r.email, phone: r.phone, instagram: r.instagram, linkedin: r.linkedin, city: r.city, notes: r.notes,
  fields: r.fields as Contact['fields'], tags: r.tags, ownerId: r.owner_id, importId: r.import_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toPaymentRequest = (r: PaymentRequestRow): PaymentRequest => ({
  id: r.id, accountId: r.account_id, priceOptionId: r.price_option_id, couponId: r.coupon_id, label: r.label, amount: r.amount, currency: r.currency,
  period: r.period, paymentLink: r.payment_link, couponCode: r.coupon_code, discount: r.discount, status: r.status, createdBy: r.created_by,
  createdAt: r.created_at, paidAt: r.paid_at, cancelledAt: r.cancelled_at,
});
const toImport = (r: CrmImportRow): CrmImport => ({
  id: r.id, tenantId: r.tenant_id, createdBy: r.created_by, fileName: r.file_name, target: r.target, headers: r.headers, rows: r.rows,
  mapping: r.mapping as unknown as ImportMapping, status: r.status, stats: r.stats, createdAt: r.created_at, doneAt: r.done_at,
});

/** = payment_paid_effects (20261201): empresa ganada para quien vendió, en su historial, y aviso «X ha pagado». */
function paidEffects(t: string, accountId: string, seller: string | null, entity: string, label: string | null, amount: number | null, currency: string | null) {
  const s = db();
  const a = s.account.find((x) => x.id === accountId && x.tenant_id === t);
  if (!a) return;
  Object.assign(a, { status: 'customer', won_at: a.won_at ?? iso(), won_by: a.won_by ?? seller, owner_id: a.owner_id ?? seller, claimed_until: null, last_touch_at: iso(), last_touch_by: seller ?? a.last_touch_by });
  s.account_touch.push({ id: randomUUID(), tenant_id: t, account_id: a.id, user_id: seller, kind: 'won', note: label, created_at: iso() });
  const params = { account: a.name, accountId: a.id, seller: userLabel(seller), sellerId: seller, label, amount: Math.round((amount ?? 0) * 100), currency: currency ?? 'EUR' };
  notifyRoles(t, ['admin', 'lead'], 'payment_paid', 'action', entity, params, seller);
  if (seller && roleOf(t, seller) && !s.notification.some((n) => n.user_id === seller && n.tenant_id === t && n.kind === 'payment_paid' && n.entity_key === entity)) {
    s.notification.push({ id: randomUUID(), tenant_id: t, user_id: seller, kind: 'payment_paid', severity: 'action', entity_key: entity, params, created_at: iso(),
      read_at: null, dismissed_at: null, emailed_at: null, resolved_at: null });
  }
}
/** = payment_request_paid (servidor: webhook de Stripe). */
export function demoChargePaid(t: string, requestId: string, ref: string, refs: string[]): 'paid' | 'already' | 'missing' {
  const s = db();
  const r = (s.payment_request ?? []).find((x) => x.id === requestId && x.tenant_id === t);
  if (!r) return 'missing';
  if (r.status === 'paid') return 'already';
  Object.assign(r, { status: 'paid', paid_at: iso(), paid_ref: ref.slice(0, 200), cancelled_at: null });
  for (const e of s.revenue_event) if (e.tenant_id === t && e.source === 'stripe' && refs.includes(e.external_id)) { e.account_id ??= r.account_id; e.seller_id ??= r.created_by; }
  paidEffects(t, r.account_id, r.created_by, r.id, r.label, r.amount, r.currency);
  return 'paid';
}

export function demoCrmDb(actorId: string): CrmDb {
  const canEdit = (c: CrmContactRow) => isManager(c.tenant_id, actorId) || c.owner_id === actorId || c.created_by === actorId || c.owner_id === null;
  return {
    async listContacts(t, f) {
      if (!isMember(t, actorId)) return [];
      const q = f.q?.trim().toLowerCase();
      return db().crm_contact
        .filter((c) => c.tenant_id === t && (!f.ids || f.ids.includes(c.id)) && (!f.tag || c.tags.includes(f.tag)) && (!q || c.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, f.limit).map(toContact);
    },
    async getContact(id) {
      const c = db().crm_contact.find((x) => x.id === id);
      return c && isMember(c.tenant_id, actorId) ? toContact(c) : null;
    },
    async insertContacts(t, rows) {
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_contact');
      const s = db();
      const out = rows.map((c) => {
        const row: CrmContactRow = {
          id: randomUUID(), tenant_id: t, name: c.name, email: c.email ?? null, phone: c.phone ?? null, instagram: c.instagram ?? null, linkedin: c.linkedin ?? null,
          city: c.city ?? null, notes: c.notes ?? null, fields: checkFields(t, c.fields ?? {}, 'contact'), tags: c.tags ?? [], owner_id: c.ownerId ?? null,
          import_id: c.importId ?? null, created_by: actorId, created_at: iso(), updated_at: iso(),
        };
        return row;
      });
      s.crm_contact.push(...out);
      return out.map((r) => r.id);
    },
    async updateContact(id, p) {
      const c = db().crm_contact.find((x) => x.id === id);
      if (!c || !canEdit(c)) return false;
      if (p.fields !== undefined) c.fields = checkFields(c.tenant_id, p.fields, 'contact');
      if (p.name !== undefined) c.name = p.name;
      if (p.email !== undefined) c.email = p.email;
      if (p.phone !== undefined) c.phone = p.phone;
      if (p.instagram !== undefined) c.instagram = p.instagram;
      if (p.linkedin !== undefined) c.linkedin = p.linkedin;
      if (p.city !== undefined) c.city = p.city;
      if (p.notes !== undefined) c.notes = p.notes;
      if (p.tags !== undefined) c.tags = p.tags;
      if (p.ownerId !== undefined) c.owner_id = p.ownerId;
      c.updated_at = iso();
      return true;
    },
    async deleteContact(id) {
      const s = db();
      const c = s.crm_contact.find((x) => x.id === id);
      if (!c || !isManager(c.tenant_id, actorId)) return false;
      s.crm_contact = s.crm_contact.filter((x) => x.id !== id);
      s.crm_contact_account = s.crm_contact_account.filter((l) => l.contact_id !== id);
      for (const a of s.crm_activity) if (a.contact_id === id) a.contact_id = null;
      for (const a of s.account) if (a.next_contact_id === id) a.next_contact_id = null;
      return true;
    },
    async listLinks(t, f) {
      if (!isMember(t, actorId)) return [];
      return db().crm_contact_account
        .filter((l) => l.tenant_id === t && (!f.contactIds || f.contactIds.includes(l.contact_id)) && (!f.accountIds || f.accountIds.includes(l.account_id)))
        .map((l) => ({ contactId: l.contact_id, accountId: l.account_id, role: l.role }));
    },
    async saveLinks(t, links) {
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_contact_account');
      const s = db();
      for (const l of links) {
        if (!s.crm_contact.some((c) => c.id === l.contactId && c.tenant_id === t) || !s.account.some((a) => a.id === l.accountId && a.tenant_id === t)) {
          throw new Error('violates foreign key: crm_contact_account');
        }
        const prev = s.crm_contact_account.find((x) => x.contact_id === l.contactId && x.account_id === l.accountId);
        if (prev) prev.role = l.role;
        else s.crm_contact_account.push({ tenant_id: t, contact_id: l.contactId, account_id: l.accountId, role: l.role, created_at: iso() });
      }
    },
    async removeLink(contactId, accountId) {
      const s = db();
      const l = s.crm_contact_account.find((x) => x.contact_id === contactId && x.account_id === accountId);
      if (!l || !isMember(l.tenant_id, actorId)) return false;
      s.crm_contact_account = s.crm_contact_account.filter((x) => x !== l);
      return true;
    },
    async listAccountLinks(t, accountId) {
      if (!isMember(t, actorId)) return [];
      return db().account_link.filter((l) => l.tenant_id === t && (l.a_id === accountId || l.b_id === accountId))
        .map((l) => ({ id: l.id, aId: l.a_id, bId: l.b_id, note: l.note, createdAt: l.created_at, days: (l.days ?? []) as LinkWhen['days'], freq: (l.freq ?? null) as LinkWhen['freq'], role: (l.role ?? null) as LinkWhen['role'] }));
    },
    async saveAccountLink(t, aId, bId, note, when) {
      if (!isMember(t, actorId)) throw new Error('permission denied: account_link');
      const s = db();
      if (aId === bId) throw new Error('check constraint: account_link');
      if (![aId, bId].every((id) => s.account.some((a) => a.id === id && a.tenant_id === t))) throw new Error('violates foreign key: account_link');
      const prev = s.account_link.find((l) => l.tenant_id === t && ((l.a_id === aId && l.b_id === bId) || (l.a_id === bId && l.b_id === aId)));
      const w = { ...(when?.days ? { days: when.days } : {}), ...(when && 'freq' in when ? { freq: when.freq ?? null } : {}), ...(when && 'role' in when ? { role: when.role ?? null } : {}) };
      if (prev) { if (note !== undefined) prev.note = note; Object.assign(prev, w); return prev.id; }
      const id = randomUUID();
      s.account_link.push({ id, tenant_id: t, a_id: aId, b_id: bId, note: note ?? null, created_by: actorId, created_at: iso(), days: [], freq: null, role: null, ...w });
      return id;
    },
    async removeAccountLink(id) {
      const s = db();
      const l = s.account_link.find((x) => x.id === id);
      if (!l || !isMember(l.tenant_id, actorId)) return false;
      s.account_link = s.account_link.filter((x) => x !== l);
      return true;
    },
    async createImport(t, i) {
      if (!isManager(t, actorId)) throw new Error('permission denied: crm_import');
      const row: CrmImportRow = { id: randomUUID(), tenant_id: t, created_by: actorId, file_name: i.fileName, target: i.target, headers: i.headers, rows: i.rows,
        mapping: i.mapping as unknown as Record<string, unknown>, status: 'draft', stats: {}, created_at: iso(), done_at: null };
      db().crm_import.push(row);
      return row.id;
    },
    async getImport(id) {
      const r = db().crm_import.find((x) => x.id === id);
      return r && isManager(r.tenant_id, actorId) ? toImport(r) : null;
    },
    async listImports(t, limit) {
      if (!isManager(t, actorId)) return [];
      return db().crm_import.filter((x) => x.tenant_id === t).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
        .map((r) => { const { rows: _r, ...rest } = toImport(r); void _r; return rest; });
    },
    async updateImport(id, p) {
      const r = db().crm_import.find((x) => x.id === id);
      if (!r || !isManager(r.tenant_id, actorId)) return false;
      if (p.mapping !== undefined) r.mapping = p.mapping as unknown as Record<string, unknown>;
      if (p.status !== undefined) r.status = p.status;
      if (p.stats !== undefined) r.stats = p.stats as Record<string, unknown>;
      if (p.doneAt !== undefined) r.done_at = p.doneAt;
      return true;
    },
    async listActivities(t, accountIds, limit) {
      if (!isMember(t, actorId)) return [];
      return db().crm_activity.filter((a) => a.tenant_id === t && accountIds.includes(a.account_id))
        .sort((a, b) => b.happened_at.localeCompare(a.happened_at)).slice(0, limit)
        .map((r) => ({ id: r.id, accountId: r.account_id, contactId: r.contact_id, userId: r.user_id, channel: r.channel as Activity['channel'], outcome: r.outcome as Activity['outcome'], note: r.note, happenedAt: r.happened_at }));
    },
    async lastActivities(t, accountIds) {
      if (!isMember(t, actorId)) return [];
      const last = new Map<string, { accountId: string; outcome: Activity['outcome']; happenedAt: string }>();
      for (const a of db().crm_activity) {
        if (a.tenant_id !== t || a.outcome === 'note' || !accountIds.includes(a.account_id)) continue;
        const prev = last.get(a.account_id);
        if (!prev || a.happened_at > prev.happenedAt) last.set(a.account_id, { accountId: a.account_id, outcome: a.outcome as Activity['outcome'], happenedAt: a.happened_at });
      }
      return [...last.values()];
    },
    async activitySummary(t, accountIds) {
      if (!isMember(t, actorId)) return [];
      const by = new Map<string, Array<{ outcome: string; at: string }>>();
      for (const a of db().crm_activity) if (a.tenant_id === t && accountIds.includes(a.account_id)) by.set(a.account_id, [...(by.get(a.account_id) ?? []), { outcome: a.outcome, at: a.happened_at }]);
      return [...by].map(([accountId, xs]) => {
        const real = xs.filter((x) => x.outcome !== 'note').sort((a, b) => a.at.localeCompare(b.at));
        const replies = real.filter((x) => ['replied', 'interested', 'meeting'].includes(x.outcome));
        return { accountId, real: real.length, firstAt: real[0]?.at ?? null, lastAt: xs.map((x) => x.at).sort().at(-1) ?? null, firstReplyAt: replies[0]?.at ?? null, lastOutcome: real.at(-1)?.outcome ?? null };
      });
    },
    async listPaymentRequests(t, accountIds) {
      if (!isMember(t, actorId)) return [];
      return (db().payment_request ?? []).filter((r) => r.tenant_id === t && accountIds.includes(r.account_id)).map(toPaymentRequest)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    // Replica payment_request_guard (20261130): la tarifa y el cupón los copia la base de datos; sin tarifa, solo admin.
    async insertPaymentRequest(t, r) {
      const s = db();
      if (!isMember(t, actorId)) throw new Error('permission denied: payment_request');
      if (!s.account.some((x) => x.id === r.accountId && x.tenant_id === t)) throw new Error('violates foreign key: payment_request account');
      let base: Pick<PaymentRequestRow, 'label' | 'amount' | 'currency' | 'period' | 'payment_link'>;
      if (r.priceOptionId) {
        const o = s.price_option.find((x) => x.id === r.priceOptionId && x.tenant_id === t);
        if (!o || !o.active) throw new Error('Tarifa no disponible');
        if (o.quote_only) throw new Error('Esta tarifa es a medida: no se cobra con un enlace');
        if (!o.payment_link) throw new Error('Esta tarifa no tiene enlace de pago de Stripe');
        base = { label: o.label, amount: o.amount, currency: o.currency, period: o.period, payment_link: o.payment_link };
      } else {
        if (roleOf(t, actorId) !== 'admin') throw new Error('permission denied: El precio lo fija tu empresa: elige una tarifa');
        if (!r.label || r.amount == null || !r.paymentLink || !/^https:\/\/[^\s"'<>]+$/.test(r.paymentLink)) throw new Error('violates check constraint: payment_request');
        base = { label: r.label, amount: r.amount, currency: r.currency ?? 'EUR', period: r.period ?? 'once', payment_link: r.paymentLink };
      }
      let coupon: Pick<PaymentRequestRow, 'coupon_code' | 'discount'> = { coupon_code: null, discount: null };
      if (r.couponId) {
        const c = s.coupon.find((x) => x.id === r.couponId && x.tenant_id === t);
        if (!c || !c.active || (c.valid_until && c.valid_until < iso().slice(0, 10))) throw new Error('Cupón no disponible');
        coupon = { coupon_code: c.code, discount: { kind: c.kind, value: c.value, label: c.label } };
      }
      const row: PaymentRequestRow = { id: randomUUID(), tenant_id: t, account_id: r.accountId, price_option_id: r.priceOptionId, coupon_id: r.couponId, ...base, ...coupon,
        status: 'sent', created_by: actorId, created_at: monotonic(), paid_at: null, paid_ref: null, cancelled_at: null };
      (s.payment_request ??= []).push(row);
      return toPaymentRequest(row);
    },
    async markPaymentPaid(t, id) {
      if (!isManager(t, actorId)) throw new Error('permission denied: Solo un gerente o admin lo marca pagado');
      return demoChargePaid(t, id, 'manual', []);
    },
    async markWon(t, accountId) {
      const a = db().account.find((x) => x.id === accountId && x.tenant_id === t);
      if (!a || !isManager(t, actorId)) throw new Error('permission denied: Solo un gerente o admin la da por ganada');
      if (!a.won_at) paidEffects(t, a.id, a.owner_id ?? actorId, `account:${a.id}`, null, null, null);
    },
    async cancelPaymentRequest(t, id) {
      const r = (db().payment_request ?? []).find((x) => x.id === id && x.tenant_id === t && x.status === 'sent');
      if (!r || !isMember(t, actorId) || !(r.created_by === actorId || isManager(t, actorId))) return false;
      r.status = 'cancelled'; r.cancelled_at = iso();
      return true;
    },
    async insertActivity(t, a) {
      const s = db();
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_activity');
      if (!s.account.some((x) => x.id === a.accountId && x.tenant_id === t)) throw new Error('violates foreign key: crm_activity account');
      const row = { id: randomUUID(), tenant_id: t, account_id: a.accountId, contact_id: a.contactId, user_id: actorId, channel: a.channel, outcome: a.outcome,
        note: a.note, happened_at: a.happenedAt ?? monotonic(), created_at: iso() };
      s.crm_activity.push(row);
      return row.id;
    },
    async deleteActivity(id) {
      const s = db();
      const a = s.crm_activity.find((x) => x.id === id);
      if (!a || (a.user_id !== actorId && !isManager(a.tenant_id, actorId))) return false;
      s.crm_activity = s.crm_activity.filter((x) => x.id !== id);
      return true;
    },
    async deleteContactsByImport(importId) {
      const s = db();
      const gone = s.crm_contact.filter((c) => c.import_id === importId && isManager(c.tenant_id, actorId)).map((c) => c.id);
      s.crm_contact = s.crm_contact.filter((c) => !gone.includes(c.id));
      s.crm_contact_account = s.crm_contact_account.filter((l) => !gone.includes(l.contact_id));
      for (const a of s.crm_activity) if (a.contact_id && gone.includes(a.contact_id)) a.contact_id = null;
      return gone.length;
    },
  };
}
