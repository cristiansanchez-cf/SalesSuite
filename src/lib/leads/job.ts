/**
 * La cola de envíos de los leads (docs/LEADS.md §Envíos): la llama /api/cron/leads cada minuto y, justo después de
 * entrar un lead, el propio endpoint en segundo plano. Cada mensaje se reclama antes de enviarse (pending → sending),
 * así dos ejecuciones a la vez no mandan dos veces. Antes de enviar se vuelve a mirar si sigue teniendo sentido.
 */
import type { Mailer } from '../notify/mailer';
import type { LeadsDb } from './db';
import { unsubscribeToken, whatsappTemplate } from './intake';
import type { Eta } from './schedule';
import { autoreplyEmail, notifyEmail, waParams, waPreview } from './templates';
import { STOP_STAGES, type Lead, type LeadMessage, type LeadSettings } from './types';
import type { WhatsApp } from './whatsapp';

export interface JobDeps { db: LeadsDb; mailer: Mailer | null; whatsapp: WhatsApp | null; now: Date; secret: string }
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
      const outcome = await one(d, m, settingsCache);
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

  if (m.step === 'notify') {
    if (!d.mailer) return done('skipped', 'sin email configurado');
    const sub = (await db.submissions(lead.id)).find((x) => x.id === m.payload.submission) ?? (await db.submissions(lead.id))[0];
    const ctx = (sub?.context ?? {}) as { cta?: { id?: string | null; label?: string | null }; page_url?: string };
    const reply = m.payload.kind === 'reply';
    const e = notifyEmail({
      brand: String(m.payload.brandName ?? s.brand), leadUrl: `${m.payload.base}/admin/leads/${lead.id}`, name: lead.name, email: lead.email, emailKind: lead.emailKind,
      phone: lead.phoneRaw, phoneE164: lead.phoneE164, type: lead.type, fields: (sub?.fields ?? {}) as Record<string, string>,
      message: reply ? `Ha contestado por WhatsApp: «${m.payload.text ?? ''}»` : sub?.message ?? null, cta: ctx.cta?.label ?? ctx.cta?.id ?? null, page: ctx.page_url ?? null,
      source: sourceOf(lead), score: lead.score, band: lead.scoreDetail?.band ?? null, repeat: lead.submissions, quarantine: lead.quarantineReasons.filter(() => lead.quarantined),
      next: reply ? 'Te toca a ti: la secuencia automática se ha parado.' : m.payload.next === 'whatsapp' ? 'WhatsApp automático (1-3 min) y email de confirmación' : 'Email de confirmación; contéstale tú',
      test: false,
    });
    const sent = await d.mailer.send({ to: m.toAddr, subject: reply ? `💬 ${lead.name} ha contestado por WhatsApp` : e.subject, html: e.html, text: e.text, tag: 'lead-notify',
      from: s.fromEmail ? fromHeader(s) : undefined, replyTo: lead.email });
    await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: (sent && sent.id) || null, attempts: m.attempts + 1 });
    return 'sent';
  }

  const sup = await db.suppressed(lead.tenantId, { email: lead.email, phone: lead.phoneE164 });
  if (['spam', 'discarded', 'lost'].includes(lead.stage)) return done('cancelled', `etapa ${lead.stage}`);

  if (m.step === 'autoreply') {
    if (sup.email) return done('skipped', 'se dio de baja');
    if (!d.mailer || !s.fromEmail) return done('skipped', 'sin remitente configurado');
    const unsub = `${m.payload.base}/api/v1/leads/unsubscribe?l=${lead.id}&t=${unsubscribeToken(lead.id, d.secret)}`;
    const e = autoreplyEmail({
      name: lead.name, type: lead.type, fields: ((lead.facts.fields as Record<string, string>) ?? {}), locale: lead.locale, signer: s.signerName ?? String(m.payload.brandName ?? ''),
      brand: String(m.payload.brandName ?? s.brand), channel: (m.payload.channel as 'whatsapp' | 'email') ?? 'email', eta: (m.payload.eta as Eta) ?? 'today',
      bookingUrl: s.bookingUrl, unsubscribeUrl: unsub,
    });
    const sent = await d.mailer.send({ to: lead.email, subject: e.subject, html: e.html, text: e.text, tag: 'lead-autoreply', from: fromHeader(s), replyTo: s.replyTo ?? undefined,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: (sent && sent.id) || null, attempts: m.attempts + 1 });
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'message_out', data: { step: 'autoreply', channel: 'email', subject: e.subject } });
    return 'sent';
  }

  // WhatsApp (wa1, wa2): se para si contestó, reservó, pidió que no le escriban o ya lo lleva una persona.
  if (sup.whatsapp) return done('cancelled', 'pidió que no le escribamos');
  if (lead.sequenceStoppedAt || lead.lastInboundAt) return done('cancelled', 'la secuencia está parada');
  if (STOP_STAGES.includes(lead.stage)) return done('cancelled', `etapa ${lead.stage}`);
  const step = m.step as 'wa1' | 'wa2';
  const template = whatsappTemplate(s, step, lead.locale);
  if (!d.whatsapp || !s.whatsappEnabled || !s.whatsappPhoneId || !template) return done('skipped', 'WhatsApp sin configurar');
  if (step === 'wa2') {
    const wa1 = (await db.messages(lead.id)).find((x) => x.step === 'wa1');
    if (!wa1 || wa1.status !== 'sent') return done('cancelled', 'el primer mensaje no salió');
  }
  const fields = (lead.facts.fields as Record<string, string>) ?? {};
  const params = waParams(step, { name: lead.name, type: lead.type, fields, locale: lead.locale, bookingUrl: s.bookingUrl, videoUrl: s.videoUrl });
  const out = await d.whatsapp.sendTemplate(s.whatsappPhoneId, m.toAddr, template, lead.locale, params);
  const text = waPreview(step, lead.locale, s.signerName ?? '', String(m.payload.brandName ?? s.brand), params);
  await db.updateMessage(m.id, { status: 'sent', sentAt: d.now.toISOString(), providerId: out.id, attempts: m.attempts + 1, payload: { ...m.payload, text } });
  await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'message_out', data: { step, channel: 'whatsapp', text } });
  if (step === 'wa1' && lead.stage === 'new') {
    await db.updateLead(lead.id, { stage: 'contacted', stageAt: d.now.toISOString() });
    await db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'stage', fromStage: 'new', toStage: 'contacted', data: { auto: true } });
  }
  return 'sent';
}
