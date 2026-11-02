/** Privacidad en memoria (demo y pruebas). Replica supabase/migrations/20261222000000_lead_privacy.sql. */
import { randomUUID } from 'node:crypto';
import { demoDb } from '../data/store';
import { demoInboxStore } from '../inbox/db-demo';
import { demoLeadsStore, type LeadsStore } from './db-demo';
import { isHashed, purgeKind, type CrmSubject, type PrivacyDb } from './privacy';

const clone = <T>(x: T): T => structuredClone(x);

export function demoPrivacyDb(store: LeadsStore = demoLeadsStore()): PrivacyDb {
  const s = store;
  const proofs = () => (s.proofs ??= []);
  const purges = () => (s.purges ??= []);
  const requests = () => (s.requests ??= []);
  const dropChildren = (id: string) => {
    s.subs = s.subs.filter((x) => x.leadId !== id);
    s.events = s.events.filter((x) => x.leadId !== id);
    s.msgs = s.msgs.filter((x) => x.leadId !== id);
  };
  return {
    async dueTenants(before, limit) {
      return s.settings.filter((x) => !x.lastPurgeAt || x.lastPurgeAt < before).slice(0, limit).map((x) => x.tenantId);
    },
    async candidates(tenantId, c, limit) {
      return s.leads.filter((l) => l.tenantId === tenantId).map((l) => ({ id: l.id, kind: purgeKind(l, c), at: l.lastSubmissionAt }))
        .filter((x): x is { id: string; kind: NonNullable<typeof x.kind>; at: string } => !!x.kind).sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit)
        .map(({ id, kind }) => ({ id, kind }));
    },
    async bundle(id) {
      const lead = s.leads.find((l) => l.id === id);
      if (!lead) return null;
      return clone({ lead, submissions: s.subs.filter((x) => x.leadId === id), events: s.events.filter((x) => x.leadId === id), messages: s.msgs.filter((x) => x.leadId === id) });
    },
    async leadsByEmail(tenantId, email) { return s.leads.filter((l) => l.tenantId === tenantId && l.email === email && !l.anonymizedAt).map(clone); },
    async deleteLead(id) { dropChildren(id); s.leads = s.leads.filter((l) => l.id !== id); },
    async anonymizeLead(id, patch) {
      dropChildren(id);
      const l = s.leads.find((x) => x.id === id);
      if (l) Object.assign(l, clone(patch));
    },
    async addProofs(p) { proofs().push(...clone(p)); },
    async countProofs(tenantId, subject) { return proofs().filter((x) => x.tenantId === tenantId && x.subjectHash === subject).length; },
    async deleteExpiredProofs(tenantId, nowIso) {
      const before = proofs().length;
      s.proofs = proofs().filter((x) => !(x.tenantId === tenantId && x.deleteAfter < nowIso));
      return before - s.proofs.length;
    },
    async plainSuppressions(tenantId, limit) {
      return s.supp.filter((x) => x.tenantId === tenantId && !isHashed(x.value)).slice(0, limit).map((x) => ({ channel: x.channel, value: x.value, reason: x.reason, at: x.at ?? null }));
    },
    async replaceSuppression(tenantId, row, hashed) {
      s.supp = s.supp.filter((x) => !(x.tenantId === tenantId && x.channel === row.channel && x.value === row.value));
      if (!s.supp.some((x) => x.tenantId === tenantId && x.channel === row.channel && x.value === hashed)) s.supp.push({ tenantId, channel: row.channel, value: hashed, reason: row.reason ?? '', at: row.at ?? undefined });
    },
    async suppressionOf(tenantId, values) {
      return s.supp.filter((x) => x.tenantId === tenantId && values.includes(x.value)).map((x) => ({ channel: x.channel, value: x.value, reason: x.reason, at: x.at ?? null }));
    },
    async markPurged(log) {
      purges().unshift(clone(log));
      const st = s.settings.find((x) => x.tenantId === log.tenantId);
      if (st) st.lastPurgeAt = log.ranAt;
    },
    async purges(tenantId, limit) { return purges().filter((x) => x.tenantId === tenantId).slice(0, limit).map(clone); },
    async crmByEmail(tenantId, email) {
      const d = demoDb();
      const contacts = d.crm_contact.filter((c) => c.tenant_id === tenantId && c.email?.toLowerCase() === email);
      const ids = new Set(contacts.map((c) => c.id));
      const inbound = demoInboxStore().emails.filter((e) => e.tenantId === tenantId && (e.counterpart?.toLowerCase() === email || e.fromAddr?.toLowerCase() === email));
      const actIds = new Set(inbound.map((e) => e.activityId).filter(Boolean));
      return clone({
        contacts, links: d.crm_contact_account.filter((l) => ids.has(l.contact_id)),
        activities: d.crm_activity.filter((a) => a.tenant_id === tenantId && ((a.contact_id && ids.has(a.contact_id)) || actIds.has(a.id))),
        accounts: d.account.filter((a) => a.tenant_id === tenantId && a.email?.toLowerCase() === email).map((a) => ({ id: a.id, name: a.name, email: a.email ?? null })),
        inbound,
      }) as unknown as CrmSubject;
    },
    async eraseCrm(tenantId, ids) {
      const d = demoDb();
      const inb = demoInboxStore();
      const n = { contacts: 0, activities: 0, inbound: 0 };
      const del = <T extends { id: string; tenant_id: string }>(rows: T[], drop: string[]) => { const keep = rows.filter((r) => !(r.tenant_id === tenantId && drop.includes(r.id))); return [keep, rows.length - keep.length] as const; };
      [d.crm_activity, n.activities] = del(d.crm_activity, ids.activities);
      [d.crm_contact, n.contacts] = del(d.crm_contact, ids.contacts);
      d.crm_contact_account = d.crm_contact_account.filter((l) => !ids.contacts.includes(l.contact_id));
      for (const a of d.crm_activity) if (a.contact_id && ids.contacts.includes(a.contact_id)) a.contact_id = null;
      const before = inb.emails.length;
      inb.emails = inb.emails.filter((e) => !(e.tenantId === tenantId && ids.inbound.includes(e.id)));
      n.inbound = before - inb.emails.length;
      return n;
    },
    async logRequest(r) { requests().unshift({ id: randomUUID(), at: r.at ?? new Date().toISOString(), ...clone(r) }); },
    async requests(tenantId, limit) { return requests().filter((x) => x.tenantId === tenantId).slice(0, limit).map(clone); },
  };
}
