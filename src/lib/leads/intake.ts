/**
 * Entrada de un lead (docs/LEADS.md §Entrada). Rápida (< 2 s): valida, normaliza, deduplica, filtra, puntúa, guarda y
 * programa los envíos. No envía nada: eso lo hace la cola (job.ts) en segundo plano.
 */
import { createHmac } from 'node:crypto';
import { parseLead, type LeadInput } from './contract';
import { isLocalOrigin } from './cors';
import { DuplicateKey, type LeadsDb } from './db';
import { classifyRules } from './classify';
import { accountDomain, emailKind, spamReasons, toE164 } from './normalize';
import { firstSendAt, nextBusinessAt, type Eta } from './schedule';
import { scoreLead } from './score';
import { msgLocale } from './templates';
import type { Lead, LeadSettings, NewMessage } from './types';

export interface IntakeDeps {
  db: LeadsDb;
  tenant: { id: string; name: string };
  settings: LeadSettings;
  now: Date;
  origin: string | null;
  ip: string | null;
  /** Para el hash de la IP (no se guarda la IP) y los enlaces de baja. */
  secret: string;
  /** La URL de la consola de este espacio (enlace del aviso interno y de la baja). */
  baseUrl: string;
  /** Hay WHATSAPP_TOKEN en el servidor. */
  whatsappReady: boolean;
  /** Si hay TURNSTILE_SECRET: verifica el token (true = humano). */
  turnstile?: ((token: string, ip: string | null) => Promise<boolean>) | null;
  rand?: () => number;
}
export interface Next { channel: 'whatsapp' | 'email'; eta: Eta; at?: string }
export interface IntakeResult { status: number; body: Record<string, unknown>; leadId?: string; schedule?: boolean }

export const IP_LIMIT = { count: 8, minutes: 10 } as const;
export const hashIp = (ip: string | null, secret: string) => (ip ? createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32) : null);
export const unsubscribeToken = (leadId: string, secret: string) => createHmac('sha256', secret).update(`unsub:${leadId}`).digest('base64url').slice(0, 24);

/** Qué etapas no reciben nada automático aunque vuelvan a escribir (lo decide una persona). */
const NO_AUTO = new Set(['won', 'lost', 'discarded', 'spam', 'nurture']);

export function whatsappTemplate(s: LeadSettings, step: 'wa1' | 'wa2', locale: string): string | null {
  return s.whatsappTemplates?.[step]?.[msgLocale(locale)] ?? null;
}
const whatsappOn = (s: LeadSettings, ready: boolean, locale: string) => ready && s.whatsappEnabled && !!s.whatsappPhoneId && !!whatsappTemplate(s, 'wa1', locale);

function facts(i: LeadInput, base: string, prev: Record<string, unknown> = {}): Record<string, unknown> {
  const f = i.fields;
  return {
    ...prev,
    base,
    type: i.type,
    fields: { ...((prev.fields as Record<string, string>) ?? {}), ...f },
    ...(f.attendees ? { attendees: f.attendees } : {}),
    ...(f.guests ? { guests: f.guests } : {}),
    ...(f.wedding_date ? { wedding_date: f.wedding_date } : {}),
    ...(f.budget ? { budget: f.budget } : {}),
    ...(f.city ? { city: f.city } : {}),
    ...(f.how_heard ? { how_heard: f.how_heard } : {}),
    last_cta: i.cta.id ?? i.cta.label,
    last_page: i.page.path,
  };
}

export async function intake(d: IntakeDeps, body: unknown): Promise<IntakeResult> {
  const parsed = parseLead(body);
  if (!parsed.ok) return { status: 400, body: { errors: parsed.errors } };
  const i = parsed.lead;
  if (i.brand !== d.settings.brand) return { status: 400, body: { errors: { brand: 'unknown' } } };
  const isTest = i.test || (d.origin ? isLocalOrigin(d.origin) : false);
  if (!d.settings.enabled && !isTest) return { status: 503, body: { error: 'leads_disabled' } };
  const { db } = d;
  const t = d.tenant.id;
  const nowIso = d.now.toISOString();

  // Repetido (reintento o doble clic): lo mismo que la primera vez.
  const dup = await db.submissionByKey(t, i.idempotencyKey);
  if (dup) return { status: 200, body: { ...dup.response, duplicate: true }, leadId: dup.leadId };

  const ipHash = hashIp(d.ip, d.secret);
  if (ipHash && (await db.countSubmissions(t, { ipHash }, new Date(d.now.getTime() - IP_LIMIT.minutes * 60_000).toISOString())) >= IP_LIMIT.count) {
    return { status: 429, body: { error: 'too_many_requests' } };
  }

  const kind = emailKind(i.email);
  const e164 = toE164(i.phone, { country: i.phoneCountry, locale: i.locale });
  const existing = await db.leadByEmail(t, i.email, isTest);
  const recentByEmail = existing ? await db.countSubmissions(t, { leadId: existing.id }, new Date(d.now.getTime() - 3_600_000).toISOString()) : 0;
  let turnstile: 'ok' | 'failed' | 'absent' = 'absent';
  if (d.turnstile && i.turnstileToken) turnstile = (await d.turnstile(i.turnstileToken, d.ip).catch(() => true)) ? 'ok' : 'failed';
  const reasons = spamReasons({ email: i.email, name: i.name, message: i.message, timeToSubmitMs: i.timeToSubmitMs, recentByEmail, turnstile });

  const current = i.attribution.current;
  const first = i.attribution.first ?? current;
  const last = i.attribution.last ?? current;
  const whatsappOk = i.consent.whatsappNotice && !!e164;
  // Qué es de verdad (docs/LEADS.md §Clasificar): solo reglas aquí; la IA lo revisa en la cola antes del primer envío.
  const cls = classifyRules({ type: i.type, fields: i.fields, message: i.message, name: i.name, email: i.email, emailKind: kind, cta: i.cta.label ?? i.cta.id, page: i.page.path });
  const score = scoreLead({ type: i.type, fields: i.fields, emailKind: kind, message: i.message, ctaId: i.cta.id ?? i.cta.label, pagePath: i.page.path, submissions: (existing?.submissions ?? 0) + 1, now: d.now });

  let lead: Lead;
  if (!existing) {
    try {
      lead = await db.insertLead({
        tenantId: t, isTest, email: i.email, emailKind: kind, domain: accountDomain(i.email), name: i.name, phoneRaw: i.phone, phoneE164: e164, type: i.type,
        locale: i.locale, quarantined: reasons.length > 0, quarantineReasons: reasons, score: score.score,
        scoreDetail: { fit: score.fit, intent: score.intent, band: score.band, detail: score.detail }, facts: { ...facts(i, d.baseUrl), classification: cls },
        attributionFirst: first, attributionLast: last, consentMarketing: i.consent.marketing, consentAds: i.consent.ads, whatsappOk, createdAt: nowIso,
      });
    } catch (e) {
      if (!(e instanceof DuplicateKey)) throw e;
      // Dos envíos a la vez con el mismo email: el otro ya lo creó.
      const again = await db.leadByEmail(t, i.email, isTest);
      if (!again) throw e;
      return intake(d, body);
    }
  } else {
    // Un envío repetido añade actividad: la primera atribución no se toca; se suma lo nuevo.
    const reopen = existing.validatedAt == null; // solo lo no validado puede (re)entrar en cuarentena
    const patch = {
      name: existing.name || i.name,
      phoneRaw: i.phone ?? existing.phoneRaw,
      phoneE164: e164 ?? existing.phoneE164,
      type: i.type,
      locale: i.locale,
      attributionLast: last ?? existing.attributionLast,
      attributionFirst: existing.attributionFirst ?? first,
      consentMarketing: existing.consentMarketing || i.consent.marketing,
      consentAds: i.consent.ads,
      whatsappOk: whatsappOk || existing.whatsappOk,
      submissions: existing.submissions + 1,
      lastSubmissionAt: nowIso,
      score: score.score,
      scoreDetail: { fit: score.fit, intent: score.intent, band: score.band, detail: score.detail },
      facts: { ...facts(i, d.baseUrl, existing.facts), classification: cls },
      ...(reopen && reasons.length && !existing.quarantined ? { quarantined: true, quarantineReasons: reasons } : {}),
    };
    await db.updateLead(existing.id, patch);
    lead = { ...existing, ...patch } as Lead;
  }

  let subId: string;
  try {
    subId = await db.insertSubmission({
      tenantId: t, leadId: lead.id, receivedAt: nowIso, idempotencyKey: i.idempotencyKey, schema: i.schema, isTest, type: i.type, fields: i.fields,
      message: i.message, consent: { ...i.consent.raw, received_at: nowIso }, context: { ...i.context, attribution: i.attribution, cta: i.cta },
      origin: d.origin, ipHash, spamReasons: reasons, response: {},
    });
  } catch (e) {
    if (!(e instanceof DuplicateKey)) throw e;
    const again = await db.submissionByKey(t, i.idempotencyKey);
    return { status: 200, body: { ...(again?.response ?? { id: lead.id }), duplicate: true }, leadId: lead.id };
  }
  await db.addEvent({
    tenantId: t, leadId: lead.id, at: nowIso, kind: 'submission',
    data: { submission: subId, type: i.type, cta: i.cta, page: i.page.path, message: i.message, repeat: lead.submissions, spam: reasons, band: score.band },
  });
  if (reasons.length) await db.addEvent({ tenantId: t, leadId: lead.id, at: nowIso, kind: 'quarantine', data: { reasons } });

  // ---------------------------------------------------------------- qué pasa ahora
  const msgs: NewMessage[] = [];
  const sup = await db.suppressed(t, { email: lead.email, phone: lead.phoneE164 });
  const canAuto = !isTest && !lead.quarantined && !NO_AUTO.has(lead.stage);
  const history = existing ? await db.messages(lead.id) : [];
  const payload = { base: d.baseUrl, brandName: d.tenant.name, submission: subId };
  let next: Next = { channel: 'email', eta: 'today' };

  // WhatsApp: no se reinicia si ya hay una conversación (secuencia en marcha, respuesta suya o un primer mensaje reciente).
  const openChat = !!lead.lastInboundAt || !!lead.sequenceStoppedAt
    || history.some((m) => m.channel === 'whatsapp' && m.step === 'wa1' && !['cancelled', 'skipped'].includes(m.status) && Date.parse(m.createdAt) > d.now.getTime() - 30 * 86_400_000);
  if (canAuto && cls.auto && lead.whatsappOk && lead.phoneE164 && !sup.whatsapp && whatsappOn(d.settings, d.whatsappReady, lead.locale)) {
    if (openChat) next = { channel: 'whatsapp', eta: 'today' };
    else {
      const first1 = firstSendAt(d.now, d.settings, (d.rand ?? Math.random)());
      const second = nextBusinessAt(first1.at, d.settings, 10, (d.rand ?? Math.random)());
      msgs.push({ tenantId: t, leadId: lead.id, channel: 'whatsapp', step: 'wa1', toAddr: lead.phoneE164, sendAt: first1.at.toISOString(), payload });
      msgs.push({ tenantId: t, leadId: lead.id, channel: 'whatsapp', step: 'wa2', toAddr: lead.phoneE164, sendAt: second.toISOString(), payload });
      next = { channel: 'whatsapp', eta: first1.eta, at: first1.at.toISOString() };
    }
  }
  // Respuesta automática por email: a todos (también con WhatsApp), una vez al día como mucho.
  const recentReply = history.some((m) => m.step === 'autoreply' && m.status !== 'cancelled' && Date.parse(m.createdAt) > d.now.getTime() - 86_400_000);
  if (canAuto && !sup.email && d.settings.fromEmail && !recentReply) {
    msgs.push({ tenantId: t, leadId: lead.id, channel: 'email', step: 'autoreply', toAddr: lead.email, sendAt: nowIso, payload: { ...payload, channel: next.channel, eta: next.eta } });
    if (next.channel === 'email') next = { channel: 'email', eta: 'minutes' };
  }
  // Aviso a quien atiende: siempre que no sea prueba ni cuarentena (eso se revisa en la bandeja).
  if (!isTest && !lead.quarantined) {
    for (const to of d.settings.notifyEmails) msgs.push({ tenantId: t, leadId: lead.id, channel: 'email', step: 'notify', toAddr: to, sendAt: nowIso, payload: { ...payload, next: next.channel, band: score.band } });
  }
  await db.enqueue(msgs);

  const response = { id: lead.id, next };
  await db.setSubmissionResponse(subId, response);
  return { status: 201, body: response, leadId: lead.id, schedule: msgs.some((m) => m.sendAt <= nowIso) };
}
