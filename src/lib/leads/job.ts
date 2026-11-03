/**
 * La cola de envíos de los leads (docs/LEADS.md §Envíos): la llama /api/cron/leads cada minuto y, justo después de
 * entrar un lead, el propio endpoint en segundo plano. Cada mensaje se reclama antes de enviarse (pending → sending),
 * así dos ejecuciones a la vez no mandan dos veces. Antes de enviar se vuelve a mirar si sigue teniendo sentido.
 */
import type { Mailer } from '../notify/mailer';
import { decide, type Classification, type Classifier, type ClassifyInput } from './classify';
import type { LeadsDb } from './db';
import { unsubscribeToken, whatsappTemplate } from './intake';
import type { Eta } from './schedule';
import { autoreplyEmail, mediaFor, notifyEmail, waParams, waPreview } from './templates';
import { STOP_STAGES, type Lead, type LeadMessage, type LeadSettings } from './types';
import type { WhatsApp } from './whatsapp';
import { withUsageScope } from '../usage/meter';

export interface JobDeps {
  db: LeadsDb; mailer: Mailer | null; whatsapp: WhatsApp | null; now: Date; secret: string;
  /** El mailer de cada empresa (su cuenta de Resend si tiene clave propia; si no, `mailer`). */
  mailerFor?: (tenantId: string) => Promise<Mailer | null>;
  /** Si hay IA: revisa la clasificación por reglas antes del primer envío (docs/LEADS.md §Clasificar). */
  classifier?: Classifier | null;
}
export interface JobResult { sent: number; failed: number; retried: number; cancelled: number; skipped: number }

const MAX_ATTEMPTS = 3;
const fromHeader = (s: LeadSettings) => (s.fromName ? `${s.fromName.replace(/[<>"]/g, '')} <${s.fromEmail}>` : s.fromEmail!);
const sourceOf = (l: Lead) => {
  const a = l.attributionFirst ?? l.attributionLast;
  if (!a) return null;
  return [a.utm_source, a.utm_medium, a.utm_campaign].filter(Boolean).join(' / ') || (a.gclid ? 'Google Ads' : a.fbclid ? 'Meta Ads' : a.referrer ?? null);
};

export async function processDue(d: JobDeps, opts: { leadId?: string; limit?: number } = {}): Promise<JobResult> {
  const r: JobResult = { sent: 0, failed: 0, retried: 0, cancelled: 0, skipped: 0 };
  const due = await d.db.dueMessages(d.now.toISOString(), opts.limit ?? 50, opts.leadId);
  const settingsCache = new Map<string, LeadSettings | null>();
  for (const m of due) {
    if (!(await d.db.claimMessage(m.id))) continue;
    try {
      // Lo que cueste (IA, correo, WhatsApp) es de su espacio (docs/COSTES.md).
      const outcome = await withUsageScope({ tenantId: m.tenantId, userId: null }, () => one(d, m, settingsCache));
      r[outcome]++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const error = (e instanceof Error ? e.message : String(e)).replace(/Bearer\s+\S+/g, 'Bearer …').slice(0, 480);
      if (attempts < MAX_ATTEMPTS) {
        await d.db.updateMessage(m.id, { status: 'pending', attempts, error, sendAt: new Date(d.now.getTime() + attempts * 5 * 60_000).toISOString() });
        r.retried++;
      } else {
        await d.db.updateMessage(m.id, { status: 'failed', attempts, error });
        await d.db.addEvent({ tenantId: m.tenantId, leadId: m.leadId, kind: 'message_out', data: { step: m.step, channel: m.channel, status: 'failed', error } });
        r.failed++;
      }
    }
  }
  return r;
}

async function one(d: JobDeps, m: LeadMessage, cache: Map<string, LeadSettings | null>): Promise<'sent' | 'cancelled' | 'skipped'> {
  const { db } = d;
  const lead = await db.getLead(m.leadId);
  if (!cache.has(m.tenantId)) cache.set(m.tenantId, await db.settings(m.tenantId));
  const s = cache.get(m.tenantId);
  const done = async (status: 'cancelled' | 'skipped', why: string) => { await db.updateMessage(m.id, { status, error: why }); return status; };
  if (!lead || !s || lead.isTest) return done('skipped', 'sin lead, sin ajustes o es prueba');
  // Antes del primer envío, la IA revisa qué es (una vez por lead). Si no encaja con un mensaje automático, se paran los
  // WhatsApp y el email sale neutro; lo sigue una persona.
  const cls = await classified(d, lead, s);
  const mailer = m.channel === 'email' ? (d.mailerFor ? await d.mailerFor(m.tenantId) : d.mailer) : null;

  if (m.step === 'notify') {
    if (!mailer) return done('skipped', 'sin email configurado');
    const sub = (await db.submissions(lead.id)).find((x) => x.id === m.payload.submission) ?? (await db.submissions(lead.id))[0];
    const ctx = (sub?.context ?? {}) as { cta?: { id?: string | null; label?: string | null }; page_url?: string };
    const reply = m.payload.kind === 'reply';
    const e = notifyEmail({
      brand: String(m.payload.brandName ?? s.brand), leadUrl: `${m.payload.base}/admin/leads/${lead.id}`, name: lead.name, email: lead.email, emailKind: lead.emailKind,
      phone: lead.phoneRaw, phoneE164: lead.phoneE164, type: lead.type, fields: (sub?.fields ?? {}) as Record<string, string>,
      message: reply ? `Ha contestado por WhatsApp: «${m.payload.text ?? ''}»` : sub?.message ?? null, cta: ctx.cta?.label ?? ctx.cta?.id ?? null, page: ctx.page_url ?? null,
      source: sourceOf(lead), score: lead.score, band: lead.scoreDetail?.band ?? null, repeat: lead.submissions, quarantine: lead.quarantineReasons.filter(() => lead.quarantined),
      next: reply ? 'Te toca a ti: la secuencia automática se ha parado.' : m.payload.next === 'whatsapp' ? (cls && !cls.auto ? 'La web le dijo que le escribirías por WhatsApp en unos minutos, pero no encaja con el mensaje automático: escríbele tú.' : 'WhatsApp automático (1-3 min) y email de confirmación') : 'Email de confirmación neutro o específico; contéstale tú',
      test: false, classification: cls ? `${CAT_ES[cls.category]} · ${cls.auto ? 'mensaje automático' : 'revísalo tú'} (${cls.reason})` : null,
    });
    const sent = await mailer.send({ to: m.toAddr, subject: reply ? `💬 ${lead.name} ha contestado por WhatsApp` : e.subject, html: e.html, text: e.text, tag: 'lead-notify',
      from: s.fromEmail ? fromHeader(s) : undefined, replyTo: lead.email });
    await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: (sent && sent.id) || null, attempts: m.attempts + 1 });
    return 'sent';
  }

  const sup = await db.suppressed(lead.tenantId, { email: lead.email, phone: lead.phoneE164 });
  if (['spam', 'discarded', 'lost'].includes(lead.stage)) return done('cancelled', `etapa ${lead.stage}`);

  if (m.step === 'autoreply') {
    if (sup.email) return done('skipped', 'se dio de baja');
    if (!mailer || !s.fromEmail) return done('skipped', 'sin remitente configurado');
    const unsub = `${m.payload.base}/api/v1/leads/unsubscribe?l=${lead.id}&t=${unsubscribeToken(lead.id, d.secret)}`;
    const specific = cls?.auto ?? true;
    // Vídeo y reserva de su tipo e idioma. Si no está claro qué es (marca, prensa…), sin vídeo y con la reserva general.
    const media = specific ? mediaFor(s, lead.type, ((lead.facts.fields as Record<string, string>) ?? {}), lead.locale) : { booking: mediaFor(s, 'general', {}, lead.locale).booking, video: null };
    const e = autoreplyEmail({
      name: lead.name, type: lead.type, fields: ((lead.facts.fields as Record<string, string>) ?? {}), locale: lead.locale, signer: s.signerName ?? String(m.payload.brandName ?? ''),
      brand: String(m.payload.brandName ?? s.brand), channel: cls && !cls.auto ? 'email' : ((m.payload.channel as 'whatsapp' | 'email') ?? 'email'), eta: (m.payload.eta as Eta) ?? 'today',
      bookingUrl: media.booking, videoUrl: media.video, unsubscribeUrl: unsub, specific, custom: s.templates, signature: s.emailSignature,
    });
    const sent = await mailer.send({ to: lead.email, subject: e.subject, html: e.html, text: e.text, tag: 'lead-autoreply', from: fromHeader(s), replyTo: s.replyTo ?? undefined,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: (sent && sent.id) || null, attempts: m.attempts + 1 });
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'message_out', data: { step: 'autoreply', channel: 'email', subject: e.subject } });
    return 'sent';
  }

  // WhatsApp (wa1, wa2): se para si contestó, reservó, pidió que no le escriban o ya lo lleva una persona.
  if (sup.whatsapp) return done('cancelled', 'pidió que no le escribamos');
  if (lead.sequenceStoppedAt || lead.lastInboundAt) return done('cancelled', 'la secuencia está parada');
  if (STOP_STAGES.includes(lead.stage)) return done('cancelled', `etapa ${lead.stage}`);
  if (cls && !cls.auto) return done('cancelled', `revisión humana: ${cls.reason}`);
  const step = m.step as 'wa1' | 'wa2';
  const template = whatsappTemplate(s, step, lead.locale);
  if (!d.whatsapp || !s.whatsappEnabled || !s.whatsappPhoneId || !template) return done('skipped', 'WhatsApp sin configurar');
  const fields = (lead.facts.fields as Record<string, string>) ?? {};
  const media = mediaFor(s, lead.type, fields, lead.locale);
  if (step === 'wa2') {
    if (s.whatsappWa2 === false) return done('cancelled', 'WhatsApp 2 desactivado en Ajustes');
    if (!media.booking) return done('cancelled', 'sin enlace de reserva');
    const wa1 = (await db.messages(lead.id)).find((x) => x.step === 'wa1');
    if (!wa1 || wa1.status !== 'sent') return done('cancelled', 'el primer mensaje no salió');
  }
  const params = waParams(step, { name: lead.name, type: lead.type, fields, locale: lead.locale, bookingUrl: media.booking, videoUrl: media.video, custom: s.templates });
  const out = await d.whatsapp.sendTemplate(s.whatsappPhoneId, m.toAddr, template, lead.locale, params);
  const text = waPreview(step, lead.locale, s.signerName ?? '', String(m.payload.brandName ?? s.brand), params, s.templates);
  await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: out.id, attempts: m.attempts + 1, payload: { ...m.payload, text } });
  await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'message_out', data: { step, channel: 'whatsapp', text } });
  if (step === 'wa1' && lead.stage === 'new') {
    await db.updateLead(lead.id, { stage: 'contacted', stageAt: d.now.toISOString() });
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'stage', fromStage: 'new', toStage: 'contacted', data: { auto: true } });
  }
  return 'sent';
}

const CAT_ES: Record<Classification['category'], string> = { venue: 'Local', dj: 'DJ', promoter: 'Promotora', festival: 'Festival', event: 'Evento', wedding: 'Boda', partner: 'Marca o alianza', press: 'Prensa', vendor: 'Nos quiere vender algo', job: 'Busca trabajo', other: 'No está claro' };

/** La clasificación del lead, revisada con IA la primera vez que se va a enviar algo (si hay IA). */
async function classified(d: JobDeps, lead: Lead, s: LeadSettings): Promise<Classification | null> {
  const cur = (lead.facts.classification as Classification | undefined) ?? null;
  if (!cur || cur.by === 'ai' || !d.classifier) return cur;
  const sub = (await d.db.submissions(lead.id))[0];
  const ctx = (sub?.context ?? {}) as { cta?: { label?: string | null; id?: string | null }; page_path?: string };
  const input: ClassifyInput = { type: lead.type, fields: (lead.facts.fields as Record<string, string>) ?? {}, message: sub?.message ?? null, name: lead.name, email: lead.email,
    emailKind: lead.emailKind, cta: ctx.cta?.label ?? ctx.cta?.id ?? null, page: ctx.page_path ?? null };
  let ai: Awaited<ReturnType<Classifier>> = null;
  try { ai = await d.classifier(input, s.aiContext ?? null); } catch (e) { console.warn('[leads] clasificar', e instanceof Error ? e.message : e); }
  if (!ai) return cur;
  // La IA puede quitar el automático, nunca darlo si las reglas ya lo quitaron (señales claras de marca, prensa…).
  const next = decide(cur.expected, ai);
  if (!cur.auto) next.auto = false;
  await d.db.updateLead(lead.id, { facts: { ...lead.facts, classification: next } });
  lead.facts = { ...lead.facts, classification: next };
  if (cur.auto && !next.auto) {
    await d.db.cancelPending(lead.id, ['wa1', 'wa2']);
    await d.db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'note', data: { text: `Sin WhatsApp automático: ${CAT_ES[next.category]} (${next.reason}). Lo sigues tú.` } });
  }
  return next;
}
