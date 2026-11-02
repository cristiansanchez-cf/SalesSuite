/**
 * Privacidad de los leads (docs/LEADS.md §Privacidad): lo que promete la política de cada espacio.
 *  · Plazos de conservación por espacio (Leads → Ajustes → Privacidad) y el borrado diario que los cumple.
 *  · Derechos de las personas en la consola: buscar por email, exportar todo en JSON y suprimirlo.
 *  · Hashes con el secreto del servidor (HMAC-SHA-256) para lo que tiene que sobrevivir al borrado sin guardar el dato:
 *    la lista de supresión y la prueba legal del consentimiento (bloqueada).
 * El borrado y los derechos van con service role (la base de datos no permite a nadie con sesión borrar leads); quién
 * puede hacerlo lo comprueba el servidor antes (privacy-service.ts) y queda registrado.
 */
import { createHmac } from 'node:crypto';
import { env } from '../env';
import { appMode } from '../mode';
import type { Attribution } from './contract';
import type { LeadsDb } from './db';
import { DEFAULT_RETENTION, type Lead, type LeadEvent, type LeadMessage, type LeadPatch, type LeadSettings, type Retention, type Submission } from './types';

/** El secreto de los leads (el mismo que firma las bajas y el hash de la IP). No se puede cambiar sin perder las bajas. */
export function leadsSecret(): string | null {
  if (appMode() === 'demo') return env('LEADS_SECRET') || 'demo-leads-secret';
  return env('LEADS_SECRET') || env('CRON_SECRET') || null;
}
const norm = (v: string) => v.trim().toLowerCase();
const hmac = (secret: string, s: string) => `h1:${createHmac('sha256', secret).update(s).digest('hex')}`;
/** Valor de la lista de supresión: el hash del email o del teléfono, nunca el dato. null si falta el secreto. */
export function suppressionKey(value: string, secret: string | null = leadsSecret()): string | null {
  return secret ? hmac(secret, `supp:${norm(value)}`) : null;
}
/** Quién es (para la prueba bloqueada y el registro de peticiones), sin guardar su email. */
export function subjectHash(email: string, secret: string | null = leadsSecret()): string {
  if (!secret) throw new Error('Falta LEADS_SECRET (o CRON_SECRET)');
  return hmac(secret, `subject:${norm(email)}`);
}
export const isHashed = (v: string) => /^h1:[0-9a-f]{64}$/.test(v);

// ---------------------------------------------------------------- Plazos

export const RETENTION_LIMITS = { leadMonths: [1, 120], spamMonths: [1, 60], testDays: [1, 183], proofYears: [1, 10] } as const;
export function retentionOf(s: Pick<LeadSettings, 'retention'>): Retention {
  const r = { ...DEFAULT_RETENTION, ...(s.retention ?? {}) };
  const clamp = (k: keyof Retention) => Math.min(RETENTION_LIMITS[k][1], Math.max(RETENTION_LIMITS[k][0], Math.round(r[k])));
  return { leadMonths: clamp('leadMonths'), spamMonths: clamp('spamMonths'), testDays: clamp('testDays'), proofYears: clamp('proofYears') };
}
const monthsAgo = (now: Date, m: number) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - m); return d; };
const yearsAfter = (now: Date, y: number) => { const d = new Date(now); d.setUTCFullYear(d.getUTCFullYear() + y); return d; };
export interface Cutoffs { lead: string; spam: string; test: string }
export function cutoffs(r: Retention, now: Date): Cutoffs {
  return { lead: monthsAgo(now, r.leadMonths).toISOString(), spam: monthsAgo(now, r.spamMonths).toISOString(), test: new Date(now.getTime() - r.testDays * 86_400_000).toISOString() };
}
/** El último contacto de un lead: su último envío, su última respuesta o el último cambio de etapa. */
export const lastContact = (l: Pick<Lead, 'lastSubmissionAt' | 'lastInboundAt' | 'stageAt' | 'createdAt'>) =>
  [l.lastSubmissionAt, l.lastInboundAt ?? l.createdAt, l.stageAt].reduce((a, b) => (b > a ? b : a));
export type PurgeKind = 'lead' | 'spam' | 'test';
/** = public.lead_purge_candidates (para la demo y las pruebas). */
export function purgeKind(l: Lead, c: Cutoffs): PurgeKind | null {
  if (l.anonymizedAt || l.validatedAt) return null;
  if (l.isTest) return l.createdAt < c.test ? 'test' : null;
  if (l.stage === 'won') return null;
  const spam = l.stage === 'spam' || l.quarantined;
  return lastContact(l) < (spam ? c.spam : c.lead) ? (spam ? 'spam' : 'lead') : null;
}

// ---------------------------------------------------------------- Anonimizar

/** La fuente de un lead tal y como la cuentan las métricas (service.ts). */
export const sourceKey = (a: Attribution | null | undefined) => a?.utm_source ?? (a?.gclid ? 'google-ads' : a?.referrer ? 'referral' : 'directo');
const keepAttribution = (a: Attribution | null): Attribution | null => a ? { utm_source: sourceKey(a), ...(a.utm_medium ? { utm_medium: a.utm_medium } : {}), ...(a.utm_campaign ? { utm_campaign: a.utm_campaign } : {}) } : null;
/** Lo que queda de un lead anonimizado: lo que usan las métricas (tipo, etapa, fechas, tiempos, fuente) y nada que lo identifique. */
export function anonymousPatch(l: Lead, nowIso: string): LeadPatch & { email: string } {
  const cls = (l.facts.classification as { category?: string } | undefined)?.category;
  return {
    email: `anon-${l.id}@anon.invalid`, name: 'Anónimo', phoneRaw: null, phoneE164: null, domain: null,
    facts: { anonymized: true, type: l.type, ...(cls ? { classification: { category: cls } } : {}) },
    scoreDetail: l.scoreDetail ? { fit: l.scoreDetail.fit, intent: l.scoreDetail.intent, band: l.scoreDetail.band, detail: [] } : null,
    attributionFirst: keepAttribution(l.attributionFirst), attributionLast: keepAttribution(l.attributionLast),
    discardReason: l.stage === 'discarded' ? 'anonimizado' : null, quarantineReasons: [], whatsappOk: false,
    validatedBy: null, accountId: null, contactId: null, anonymizedAt: nowIso,
  };
}

// ---------------------------------------------------------------- Prueba del consentimiento (bloqueada)

export interface ConsentProof {
  tenantId: string; subjectHash: string; receivedAt: string; schema: string | null; consent: Record<string, unknown>; origin: string | null;
  pagePath: string | null; reason: 'purge' | 'erase'; blockedAt: string; deleteAfter: string;
}
export interface LeadBundle { lead: Lead; submissions: Submission[]; events: LeadEvent[]; messages: LeadMessage[] }
/** Lo que demuestra el consentimiento de cada envío: qué aceptó, con qué texto, desde dónde y cuándo. Sin IP ni mensaje. */
export function proofsOf(b: LeadBundle, reason: ConsentProof['reason'], now: Date, years: number, secret: string): ConsentProof[] {
  const who = subjectHash(b.lead.email, secret);
  return b.submissions.map((s) => ({
    tenantId: b.lead.tenantId, subjectHash: who, receivedAt: s.receivedAt, schema: s.schema, consent: s.consent, origin: s.origin,
    pagePath: typeof s.context.page_path === 'string' ? s.context.page_path.slice(0, 500) : null, reason, blockedAt: now.toISOString(),
    deleteAfter: yearsAfter(now, years).toISOString(),
  }));
}

// ---------------------------------------------------------------- Acceso a datos (service role)

export interface PurgeLog { tenantId: string; ranAt: string; anonymized: number; deleted: number; tests: number; proofsDeleted: number; hashed: number }
export interface PrivacyRequest { id: string; tenantId: string; at: string; kind: 'export' | 'erase'; subjectHash: string; byUser: string | null; summary: Record<string, unknown> }
export interface SuppressionRow { channel: string; value: string; reason: string | null; at: string | null }
type Row = Record<string, unknown>;
export interface CrmSubject {
  contacts: Row[]; links: Row[]; activities: Row[];
  /** Empresas con ese email: no se suprimen solas (son de la empresa, no de la persona); se enseñan para revisarlas. */
  accounts: Array<{ id: string; name: string; email: string | null }>;
  inbound: Row[];
}

export interface PrivacyDb {
  /** Espacios cuyo último borrado es anterior a `beforeIso` (o nunca). */
  dueTenants(beforeIso: string, limit: number): Promise<string[]>;
  candidates(tenantId: string, c: Cutoffs, limit: number): Promise<Array<{ id: string; kind: PurgeKind }>>;
  bundle(leadId: string): Promise<LeadBundle | null>;
  /** Todos sus leads en el espacio (pruebas y validados incluidos; los anonimizados ya no tienen su email). */
  leadsByEmail(tenantId: string, email: string): Promise<Lead[]>;
  deleteLead(id: string): Promise<void>;
  /** Borra sus envíos, historial y cola, y deja solo lo de `patch`. */
  anonymizeLead(id: string, patch: LeadPatch & { email: string }): Promise<void>;
  addProofs(p: ConsentProof[]): Promise<void>;
  countProofs(tenantId: string, subject: string): Promise<number>;
  deleteExpiredProofs(tenantId: string, nowIso: string): Promise<number>;
  /** Filas de la lista de supresión aún en claro (de antes del hash). */
  plainSuppressions(tenantId: string, limit: number): Promise<SuppressionRow[]>;
  replaceSuppression(tenantId: string, row: SuppressionRow, hashed: string): Promise<void>;
  suppressionOf(tenantId: string, values: string[]): Promise<SuppressionRow[]>;
  markPurged(log: PurgeLog): Promise<void>;
  purges(tenantId: string, limit: number): Promise<PurgeLog[]>;
  crmByEmail(tenantId: string, email: string): Promise<CrmSubject>;
  eraseCrm(tenantId: string, ids: { contacts: string[]; activities: string[]; inbound: string[] }): Promise<{ contacts: number; activities: number; inbound: number }>;
  logRequest(r: Omit<PrivacyRequest, 'id' | 'at'> & { at?: string }): Promise<void>;
  requests(tenantId: string, limit: number): Promise<PrivacyRequest[]>;
}

// ---------------------------------------------------------------- Borrado diario

const BATCH = 200;
/** Pasa a hash lo que quede en claro en la lista de supresión. */
export async function hashPlainSuppressions(p: PrivacyDb, tenantId: string, secret: string): Promise<number> {
  let n = 0;
  for (const r of await p.plainSuppressions(tenantId, 1000)) {
    if (isHashed(r.value)) continue;
    await p.replaceSuppression(tenantId, r, suppressionKey(r.value, secret)!);
    n++;
  }
  return n;
}

/** Cumple los plazos de un espacio: pruebas y spam fuera, leads que no contratan anonimizados, pruebas legales caducadas fuera. */
export async function purgeTenant(p: PrivacyDb, s: LeadSettings, now: Date, secret: string): Promise<PurgeLog> {
  const r = retentionOf(s);
  const c = cutoffs(r, now);
  const nowIso = now.toISOString();
  const log: PurgeLog = { tenantId: s.tenantId, ranAt: nowIso, anonymized: 0, deleted: 0, tests: 0, proofsDeleted: 0, hashed: 0 };
  for (let round = 0; round < 10; round++) {
    const list = await p.candidates(s.tenantId, c, BATCH);
    for (const x of list) {
      if (x.kind === 'test') { await p.deleteLead(x.id); log.tests++; continue; }
      const b = await p.bundle(x.id);
      if (!b) continue;
      // La prueba del consentimiento se bloquea (lo marcado como spam por una persona no la necesita).
      if (b.lead.stage !== 'spam') await p.addProofs(proofsOf(b, 'purge', now, r.proofYears, secret));
      if (x.kind === 'spam') { await p.deleteLead(x.id); log.deleted++; }
      else { await p.anonymizeLead(x.id, anonymousPatch(b.lead, nowIso)); log.anonymized++; }
    }
    if (list.length < BATCH) break;
  }
  log.proofsDeleted = await p.deleteExpiredProofs(s.tenantId, nowIso);
  log.hashed = await hashPlainSuppressions(p, s.tenantId, secret);
  await p.markPurged(log);
  return log;
}

/** Una vez al día por espacio (lo llama /api/cron/leads cada minuto; casi siempre no hay nada que hacer). */
export async function purgeDue(p: PrivacyDb, db: LeadsDb, now: Date, secret: string, limit = 3): Promise<PurgeLog[]> {
  const out: PurgeLog[] = [];
  for (const t of await p.dueTenants(new Date(now.getTime() - 23 * 3_600_000).toISOString(), limit)) {
    const s = await db.settings(t);
    if (s) out.push(await purgeTenant(p, s, now, secret));
  }
  return out;
}

// ---------------------------------------------------------------- Derechos (acceso, portabilidad y supresión)

export interface SubjectData { email: string; subject: string; leads: LeadBundle[]; crm: CrmSubject; suppression: SuppressionRow[]; proofs: number }

export async function subjectData(p: PrivacyDb, tenantId: string, email: string, secret: string): Promise<SubjectData> {
  const e = norm(email);
  const leads = (await Promise.all((await p.leadsByEmail(tenantId, e)).map((l) => p.bundle(l.id)))).filter((b): b is LeadBundle => !!b);
  const phones = [...new Set(leads.map((b) => b.lead.phoneE164).filter((x): x is string => !!x))];
  const keys = [e, ...phones].flatMap((v) => [v, suppressionKey(v, secret)!]);
  const subject = subjectHash(e, secret);
  const [crm, suppression, proofs] = await Promise.all([p.crmByEmail(tenantId, e), p.suppressionOf(tenantId, keys), p.countProofs(tenantId, subject)]);
  return { email: e, subject, leads, crm, suppression, proofs };
}

/** El JSON que se le entrega: todo lo que hay de esa persona en este espacio, legible. */
export function exportOf(d: SubjectData, space: string, now: Date) {
  const clean = (b: LeadBundle) => ({
    lead: b.lead,
    submissions: b.submissions.map(({ response: _r, ...s }) => s),
    events: b.events,
    messages: b.messages.map(({ providerId: _p, ...m }) => m),
  });
  return {
    generated_at: now.toISOString(), space, subject: d.email,
    leads: d.leads.map(clean),
    crm: { contacts: d.crm.contacts, contact_accounts: d.crm.links, activities: d.crm.activities, emails: d.crm.inbound, accounts_with_this_email: d.crm.accounts },
    suppression: d.suppression.map((s) => ({ channel: s.channel, reason: s.reason, at: s.at })),
    consent_proofs_blocked: d.proofs,
    notes: 'La IP no se guarda: solo un hash con clave del servidor (ip_hash). La lista de supresión guarda un hash del email o del teléfono.',
  };
}

export interface EraseResult { leads: number; submissions: number; events: number; messages: number; contacts: number; activities: number; inbound: number; proofsKept: number; suppressed: boolean }
/**
 * Suprimir a una persona: sus leads (validados y pruebas incluidos), sus personas del CRM con ese email y sus
 * interacciones, y los correos apuntados de ella. Se quedan la prueba del consentimiento (bloqueada, con su plazo) y,
 * si se pide, su hash en la lista de supresión para no volver a escribirle.
 */
export async function eraseSubject(p: PrivacyDb, db: LeadsDb, d: SubjectData, o: { tenantId: string; byUser: string | null; suppress: boolean; now: Date; proofYears: number; secret: string }): Promise<EraseResult> {
  const r: EraseResult = { leads: 0, submissions: 0, events: 0, messages: 0, contacts: 0, activities: 0, inbound: 0, proofsKept: 0, suppressed: false };
  for (const b of d.leads) {
    if (!b.lead.isTest) { const pr = proofsOf(b, 'erase', o.now, o.proofYears, o.secret); await p.addProofs(pr); r.proofsKept += pr.length; }
    await p.deleteLead(b.lead.id);
    r.leads++; r.submissions += b.submissions.length; r.events += b.events.length; r.messages += b.messages.length;
  }
  const actIds = [...new Set(d.crm.activities.map((a) => String(a.id)))];
  const crm = await p.eraseCrm(o.tenantId, { contacts: d.crm.contacts.map((c) => String(c.id)), activities: actIds, inbound: d.crm.inbound.map((x) => String(x.id)) });
  Object.assign(r, crm);
  if (o.suppress) {
    await db.suppress(o.tenantId, 'all', d.email, 'Derecho de supresión');
    for (const ph of new Set(d.leads.map((b) => b.lead.phoneE164).filter((x): x is string => !!x))) await db.suppress(o.tenantId, 'whatsapp', ph, 'Derecho de supresión');
    r.suppressed = true;
  }
  await p.logRequest({ tenantId: o.tenantId, kind: 'erase', subjectHash: d.subject, byUser: o.byUser, summary: { ...r } });
  return r;
}
