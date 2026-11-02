/** Leads en memoria (demo y pruebas). Mismo comportamiento que Supabase salvo la RLS (la consola filtra por espacio). */
import { randomUUID } from 'node:crypto';
import { DuplicateKey, type LeadsDb } from './db';
import type { Lead, LeadEvent, LeadMessage, LeadSettings, Submission } from './types';

export interface LeadsStore { secrets?: Record<string, string>; settings: LeadSettings[]; leads: Lead[]; subs: Submission[]; events: LeadEvent[]; msgs: LeadMessage[]; supp: { tenantId: string; channel: string; value: string; reason: string }[] }
const KEY = Symbol.for('salessuite.demoLeads');
type G = typeof globalThis & { [KEY]?: LeadsStore };

/** Enjoy de la demo: activado, con su web y localhost, y un remitente de prueba (los emails se quedan en memoria). */
const DEMO_ENJOY: LeadSettings = {
  tenantId: '00000000-0000-4000-8000-000000000e01', enabled: true, brand: 'enjoy',
  allowedOrigins: ['https://enjoytheclub.es', 'https://corporativeweb-b0ce4--*.web.app'], fromEmail: 'cristian@mail.enjoytheclub.es', fromName: 'Cristian · Enjoy the Club',
  replyTo: 'cristian@enjoytheclub.es', signerName: 'Cristian', notifyEmails: ['cristian@enjoytheclub.es'], bookingUrl: 'https://cal.example.com/cristian', videoUrl: null,
  whatsappPhoneId: null, whatsappEnabled: false, whatsappTemplates: {}, timezone: 'Europe/Madrid', sendFromHour: 8, sendToHour: 22, holidays: [],
};
export function demoLeadsStore(): LeadsStore {
  return ((globalThis as G)[KEY] ??= { settings: [structuredClone(DEMO_ENJOY)], leads: [], subs: [], events: [], msgs: [], supp: [] });
}
export function resetDemoLeads(): void { delete (globalThis as G)[KEY]; }

const now = () => new Date().toISOString();
const clone = <T>(x: T): T => structuredClone(x);

export function demoLeadsDb(store: LeadsStore = demoLeadsStore()): LeadsDb {
  const s = store;
  return {
    async settings(tenantId) { const r = s.settings.find((x) => x.tenantId === tenantId); return r ? clone(r) : null; },
    async settingsByWhatsappPhone(phoneId) { const r = s.settings.find((x) => x.whatsappPhoneId === phoneId); return r ? clone(r) : null; },
    async saveSettings(v) {
      if (s.settings.some((x) => x.brand === v.brand && x.tenantId !== v.tenantId)) throw new DuplicateKey('brand');
      const prev = s.settings.find((x) => x.tenantId === v.tenantId);
      const hint = prev?.resendKeyHint ?? null;
      s.settings = s.settings.filter((x) => x.tenantId !== v.tenantId).concat({ ...clone(v), resendKeyHint: hint, templates: v.templates ?? prev?.templates ?? {}, aiContext: v.aiContext ?? prev?.aiContext ?? null, emailSignature: v.emailSignature ?? prev?.emailSignature ?? {} });
    },
    async resendKey(tenantId) { return s.secrets?.[tenantId] ?? null; },
    async setResendKey(tenantId, sealed, hint) {
      s.secrets ??= {};
      if (sealed) s.secrets[tenantId] = sealed; else delete s.secrets[tenantId];
      const st = s.settings.find((x) => x.tenantId === tenantId);
      if (st) st.resendKeyHint = hint;
    },
    async submissionByKey(tenantId, key) { const r = s.subs.find((x) => x.tenantId === tenantId && x.idempotencyKey === key); return r ? clone(r) : null; },
    async leadByEmail(tenantId, email, isTest) { const r = s.leads.find((x) => x.tenantId === tenantId && x.email === email && x.isTest === isTest); return r ? clone(r) : null; },
    async leadsByPhone(tenantId, e164) { return s.leads.filter((x) => x.tenantId === tenantId && x.phoneE164 === e164).map(clone); },
    async getLead(id) { const r = s.leads.find((x) => x.id === id); return r ? clone(r) : null; },
    async insertLead(l) {
      if (s.leads.some((x) => x.tenantId === l.tenantId && x.email === l.email && x.isTest === l.isTest)) throw new DuplicateKey('lead');
      const at = l.createdAt ?? now();
      const row: Lead = { ...clone(l), id: randomUUID(), createdAt: at, stage: 'new', stageAt: at, discardReason: null, validatedAt: null, validatedBy: null,
        firstResponseAt: null, firstResponseMins: null, lastInboundAt: null, sequenceStoppedAt: null, sequenceStopReason: null, accountId: null, contactId: null,
        submissions: 1, lastSubmissionAt: at };
      s.leads.push(row);
      return clone(row);
    },
    async updateLead(id, patch) {
      const r = s.leads.find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))));
      return true;
    },
    async insertSubmission(v) {
      if (s.subs.some((x) => x.tenantId === v.tenantId && x.idempotencyKey === v.idempotencyKey)) throw new DuplicateKey('idempotency_key');
      const id = randomUUID();
      s.subs.push({ ...clone(v), id, receivedAt: v.receivedAt ?? now() });
      return id;
    },
    async setSubmissionResponse(id, response) { const r = s.subs.find((x) => x.id === id); if (r) r.response = clone(response); },
    async countSubmissions(tenantId, by, sinceIso) {
      return s.subs.filter((x) => x.tenantId === tenantId && x.receivedAt >= sinceIso && (!by.ipHash || x.ipHash === by.ipHash) && (!by.leadId || x.leadId === by.leadId)).length;
    },
    async submissions(leadId) { return s.subs.filter((x) => x.leadId === leadId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map(clone); },
    async addEvent(e) { s.events.push({ id: randomUUID(), at: e.at ?? now(), fromStage: null, toStage: null, byUser: null, ...clone(e) } as LeadEvent); },
    async events(leadId) { return s.events.filter((x) => x.leadId === leadId).sort((a, b) => a.at.localeCompare(b.at)).map(clone); },
    async enqueue(ms) {
      for (const m of ms) s.msgs.push({ id: randomUUID(), createdAt: now(), status: 'pending', attempts: 0, sentAt: null, providerId: null, error: null, payload: {}, ...clone(m) } as LeadMessage);
    },
    async messages(leadId) { return s.msgs.filter((x) => x.leadId === leadId).map(clone); },
    async dueMessages(nowIso, limit, leadId) {
      return s.msgs.filter((x) => x.status === 'pending' && x.sendAt <= nowIso && (!leadId || x.leadId === leadId)).sort((a, b) => a.sendAt.localeCompare(b.sendAt)).slice(0, limit).map(clone);
    },
    async claimMessage(id) { const r = s.msgs.find((x) => x.id === id && x.status === 'pending'); if (!r) return false; r.status = 'sending'; return true; },
    async updateMessage(id, p) { const r = s.msgs.find((x) => x.id === id); if (r) Object.assign(r, clone(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)))); },
    async cancelPending(leadId, steps) {
      let n = 0;
      for (const m of s.msgs) if (m.leadId === leadId && m.status === 'pending' && (!steps || steps.includes(m.step))) { m.status = 'cancelled'; n++; }
      return n;
    },
    async suppressed(tenantId, v) {
      const hit = (val: string | null | undefined, ch: string) => !!val && s.supp.some((x) => x.tenantId === tenantId && x.value === val && (x.channel === ch || x.channel === 'all'));
      return { email: hit(v.email, 'email'), whatsapp: hit(v.phone, 'whatsapp') || hit(v.email, 'all') };
    },
    async suppress(tenantId, channel, value, reason) {
      if (!s.supp.some((x) => x.tenantId === tenantId && x.channel === channel && x.value === value)) s.supp.push({ tenantId, channel, value, reason });
    },
    async list(tenantId, view, opts = {}) {
      const q = opts.q?.trim().toLowerCase();
      return s.leads.filter((l) => {
        if (l.tenantId !== tenantId) return false;
        if (view === 'test') { if (!l.isTest) return false; } else if (l.isTest) return false;
        if (view === 'inbox' && (l.validatedAt || l.quarantined || l.stage === 'spam')) return false;
        if (view === 'quarantine' && (!l.quarantined || l.stage === 'spam')) return false;
        if (view === 'active' && (!l.validatedAt || !['new', 'contacted', 'replied', 'booked', 'meeting', 'opportunity', 'nurture'].includes(l.stage))) return false;
        if (view === 'closed' && !['won', 'lost', 'discarded', 'spam'].includes(l.stage)) return false;
        return !q || l.name.toLowerCase().includes(q) || l.email.includes(q);
      }).sort((a, b) => b.lastSubmissionAt.localeCompare(a.lastSubmissionAt)).slice(0, opts.limit ?? 200).map(clone);
    },
    async lastSubmission(tenantId) {
      const r = s.subs.filter((x) => x.tenantId === tenantId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
      return r ? { at: r.receivedAt, test: r.isTest } : null;
    },
    async counts(tenantId) {
      const ls = s.leads.filter((l) => l.tenantId === tenantId && !l.isTest && l.stage !== 'spam');
      return { inbox: ls.filter((l) => !l.validatedAt && !l.quarantined).length, quarantine: ls.filter((l) => l.quarantined).length };
    },
  };
}
