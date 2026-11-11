/**
 * Leads en la consola (docs/LEADS.md §Consola): la bandeja «por validar», la cuarentena, la ficha con su historial y
 * los ajustes del espacio. Lo ve y lo gestiona quien gestiona cuentas (admin o gerente); los ajustes, solo un admin.
 * Validar crea la persona (y su empresa, si la hay) en el CRM principal.
 */
import { z } from 'zod';
import type { AdminContext } from '../admin/auth';
import { can } from '../admin/permissions';
import { AdminError } from '../admin/service';
import { DuplicateKey, type LeadsDb } from './db';
import { normalizeOrigin } from './cors';
import { businessMinutes } from './schedule';
import { RETENTION_LIMITS, sourceKey } from './privacy';
import { STAGES, STOP_STAGES, type Lead, type LeadSettings, type LeadTemplates, type Stage, type View } from './types';
import { DEFAULT_TEXTS, MEDIA_TYPES } from './templates';

export const LEAD_ERRORS = {
  notFound: 'Lead no encontrado',
  needsReason: 'Indica el motivo para descartarlo',
  brandTaken: 'Esa marca ya la usa otro espacio',
  waVars: 'Cada mensaje de WhatsApp tiene que llevar {{1}}, {{2}} y {{3}}',
  svgLogo: 'El logo tiene que ser PNG o JPG: Gmail no muestra SVG',
  badOrigin: (v: string) => `«${v}» no es una dirección web (ejemplo: tuweb.com)`,
  tooManyOrigins: 'Como mucho 20 webs',
  badEmail: (v: string) => `«${v}» no es un email`,
  tooManyNotify: 'Como mucho 5 personas a las que avisar',
  fromNameLong: 'El nombre del remitente, como mucho 80 caracteres',
} as const;

const wa = z.string().trim().max(1024).refine((v) => !v || (['{{1}}', '{{2}}', '{{3}}'].every((x) => v.includes(x)) && !/\{\{[4-9]\}\}/.test(v)), LEAD_ERRORS.waVars);
const localeTexts = z.object({
  subject: z.string().trim().max(200).optional(), body: z.string().trim().max(4000).optional(), wa1: wa.optional(), wa2: wa.optional(),
  questions: z.record(z.enum(['venue', 'dj', 'festival', 'wedding', 'general', 'trial_ended', 'extra_venue']), z.string().trim().max(300)).optional(),
}).strict();
const templatesSchema = z.record(z.enum(['es', 'en', 'fr']), localeTexts);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
export const signatureSchema = z.object({
  name: opt(120), title: opt(160), phone: opt(40), address: opt(200), email: z.string().trim().max(200).email().optional().or(z.literal('').transform(() => undefined)),
  website: z.string().trim().max(300).url().startsWith('https://').optional().or(z.literal('').transform(() => undefined)),
  // Gmail no enseña SVG: PNG o JPG, por https.
  logoUrl: z.string().trim().max(500).url().startsWith('https://').refine((u) => !/\.svg(\?|$)/i.test(u), 'svg').optional().or(z.literal('').transform(() => undefined)),
  legal: opt(2000),
}).strict();

/** Guarda solo lo que difiere de los textos por defecto (así, si mejoran los de por defecto, lo no tocado mejora solo). */
export function onlyCustom(t: LeadTemplates): LeadTemplates {
  const out: LeadTemplates = {};
  for (const l of ['es', 'en', 'fr'] as const) {
    const v = t[l]; if (!v) continue;
    const d = DEFAULT_TEXTS[l];
    const o: NonNullable<LeadTemplates['es']> = {};
    for (const k of ['subject', 'body', 'wa1', 'wa2'] as const) { const x = v[k]?.trim(); if (x && x !== d[k]) o[k] = x; }
    const q = Object.fromEntries(Object.entries(v.questions ?? {}).filter(([k, x]) => x?.trim() && x.trim() !== d.questions[k as keyof typeof d.questions]));
    if (Object.keys(q).length) o.questions = q;
    if (Object.keys(o).length) out[l] = o;
  }
  return out;
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  brand: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
  allowedOrigins: z.array(z.string().trim().regex(/^https?:\/\/[a-z0-9*.-]+(:\d+)?$/i)).max(20),
  fromEmail: z.string().trim().email().max(200).nullable(),
  fromName: z.string().trim().max(80).nullable(),
  replyTo: z.string().trim().email().max(200).nullable(),
  signerName: z.string().trim().max(80).nullable(),
  notifyEmails: z.array(z.string().trim().email().max(200)).max(5),
  bookingUrl: z.string().trim().url().startsWith('https://').max(500).nullable(),
  videoUrl: z.string().trim().url().startsWith('https://').max(500).nullable(),
  whatsappPhoneId: z.string().trim().regex(/^\d{5,30}$/).nullable(),
  whatsappEnabled: z.boolean(),
  /** WhatsApp 2: se apaga si Meta lo pasa a Marketing (el 1 sigue). */
  whatsappWa2: z.boolean().optional(),
  whatsappTemplates: z.record(z.enum(['wa1', 'wa2', 'reminder']), z.record(z.enum(['es', 'en', 'fr']), z.string().trim().regex(/^[a-z0-9_]{1,512}$/))),
  sendFromHour: z.number().int().min(0).max(23),
  sendToHour: z.number().int().min(1).max(24),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  /** Vídeo y reserva por tipo e idioma (vacío = el general). */
  media: z.record(z.enum(MEDIA_TYPES), z.record(z.enum(['es', 'en', 'fr']), z.object({
    video: z.string().trim().url().startsWith('https://').max(500).optional(),
    booking: z.string().trim().url().startsWith('https://').max(500).optional(),
  }))).optional(),
});

const int = (k: keyof typeof RETENTION_LIMITS) => z.coerce.number().int().min(RETENTION_LIMITS[k][0]).max(RETENTION_LIMITS[k][1]);
/** Plazos de conservación (docs/LEADS.md §Privacidad); las pruebas, nunca más de 6 meses. */
export const retentionSchema = z.object({ leadMonths: int('leadMonths'), spamMonths: int('spamMonths'), testDays: int('testDays'), proofYears: int('proofYears') }).strict();

export function createLeadsService(db: LeadsDb, admin: AdminContext) {
  const s = admin.session;
  const t = s.tenantId;
  const perms = can(s.role);
  const requireManager = () => { if (!perms.manageAccounts) throw new AdminError(403, 'Solo un/a admin o gerente'); };
  const requireAdmin = () => { if (!perms.manageTenant) throw new AdminError(403, 'Sin permiso para esta operación'); };
  async function own(id: string): Promise<Lead> {
    requireManager();
    const l = /^[0-9a-f-]{36}$/i.test(id) ? await db.getLead(id) : null;
    if (!l || l.tenantId !== t) throw new AdminError(404, LEAD_ERRORS.notFound);
    return l;
  }
  const at = () => new Date().toISOString();

  async function settings(): Promise<LeadSettings | null> { requireManager(); return db.settings(t); }

  async function list(view: View, q?: string) { requireManager(); return db.list(t, view, { q }); }
  async function counts() { requireManager(); return db.counts(t); }

  async function detail(id: string) {
    const lead = await own(id);
    const [submissions, events, messages, st] = await Promise.all([db.submissions(id), db.events(id), db.messages(id), db.settings(t)]);
    const sup = await db.suppressed(t, { email: lead.email, phone: lead.phoneE164 });
    return { lead, submissions, events, messages, settings: st, suppressed: sup };
  }

  /** Cambia la etapa con fecha y hora. Lo que no es «nuevo» cuenta como primer contacto humano (la métrica clave). */
  async function setStage(id: string, stage: Stage, reason?: string | null) {
    const l = await own(id);
    if (!STAGES.includes(stage)) throw new AdminError(422, 'Datos no válidos');
    if (stage === 'discarded' && !reason?.trim()) throw new AdminError(422, LEAD_ERRORS.needsReason);
    if (stage === l.stage && stage !== 'discarded') return;
    const now = at();
    const patch: Parameters<LeadsDb['updateLead']>[1] = { stage, stageAt: now, discardReason: stage === 'discarded' ? reason!.trim().slice(0, 300) : null };
    if (!l.firstResponseAt && !['new', 'spam', 'discarded'].includes(stage)) {
      const st = await db.settings(t);
      patch.firstResponseAt = now;
      patch.firstResponseMins = businessMinutes(new Date(l.createdAt), new Date(now), { timezone: st?.timezone ?? 'Europe/Madrid', sendFromHour: 8, sendToHour: 22, holidays: st?.holidays ?? [] });
    }
    if (stage === 'spam') { patch.quarantined = true; }
    // La secuencia automática se para en cuanto sigue una persona (respondió, reservó…) o se cierra.
    if (STOP_STAGES.includes(stage) && !l.sequenceStoppedAt) { patch.sequenceStoppedAt = now; patch.sequenceStopReason = `etapa ${stage}`; }
    if (!(await db.updateLead(id, patch))) throw new AdminError(403, 'Sin permiso para esta operación');
    if (STOP_STAGES.includes(stage)) await db.cancelPending(id, ['wa1', 'wa2', 'autoreply']);
    await db.addEvent({ tenantId: t, leadId: id, at: now, kind: 'stage', fromStage: l.stage, toStage: stage, byUser: s.userId, data: reason ? { reason } : {} });
  }

  /** «Lo he contactado yo»: primer contacto humano sin cambiar nada más. */
  async function markContacted(id: string) {
    const l = await own(id);
    if (l.stage === 'new') return setStage(id, 'contacted');
    if (l.firstResponseAt) return;
    const st = await db.settings(t);
    const now = at();
    await db.updateLead(id, { firstResponseAt: now, firstResponseMins: businessMinutes(new Date(l.createdAt), new Date(now), { timezone: st?.timezone ?? 'Europe/Madrid', sendFromHour: 8, sendToHour: 22, holidays: st?.holidays ?? [] }) });
  }

  async function stopSequence(id: string) {
    const l = await own(id);
    const now = at();
    if (!l.sequenceStoppedAt) await db.updateLead(id, { sequenceStoppedAt: now, sequenceStopReason: 'a mano' });
    const n = await db.cancelPending(id, ['wa1', 'wa2']);
    await db.addEvent({ tenantId: t, leadId: id, at: now, kind: 'note', byUser: s.userId, data: { text: 'Secuencia automática parada', cancelled: n } });
  }

  async function release(id: string) {
    const l = await own(id);
    if (!l.quarantined) return;
    await db.updateLead(id, { quarantined: false, ...(l.stage === 'spam' ? { stage: 'new', stageAt: at() } : {}) });
    await db.addEvent({ tenantId: t, leadId: id, kind: 'note', byUser: s.userId, data: { text: 'Sacado de cuarentena' } });
  }

  async function note(id: string, text: string) {
    await own(id);
    const v = text.trim().slice(0, 2000);
    if (!v) throw new AdminError(422, 'Datos no válidos');
    await db.addEvent({ tenantId: t, leadId: id, kind: 'note', byUser: s.userId, data: { text: v } });
  }

  /** Validar: entra al CRM principal como persona (y empresa si se sabe), con su origen en las notas. */
  async function validate(id: string) {
    const l = await own(id);
    if (l.validatedAt) return { contactId: l.contactId, accountId: l.accountId };
    const f = (l.facts.fields as Record<string, string>) ?? {};
    const company = f.venue_name || f.company || f.event_name || null;
    const sub = (await db.submissions(id))[0];
    const src = l.attributionFirst ? [l.attributionFirst.utm_source, l.attributionFirst.utm_campaign].filter(Boolean).join(' / ') : '';
    const notes = [`Lead de la web (${l.type}).`, sub?.message ? `Mensaje: ${sub.message}` : '', src ? `Origen: ${src}` : ''].filter(Boolean).join('\n');
    const r = await admin.crm.quickAdd({ name: l.name, email: l.email, phone: l.phoneE164 ?? l.phoneRaw ?? null, city: f.city ?? null, company, notes: notes.slice(0, 2000), tag: 'web' });
    const now = at();
    if (!(await db.updateLead(id, { validatedAt: now, validatedBy: s.userId, contactId: r.id, accountId: r.accountId, quarantined: false }))) {
      throw new AdminError(403, 'Sin permiso para esta operación');
    }
    await db.addEvent({ tenantId: t, leadId: id, at: now, kind: 'validated', byUser: s.userId, data: { contactId: r.id, accountId: r.accountId } });
    return { contactId: r.id, accountId: r.accountId };
  }

  async function suppress(id: string) {
    const l = await own(id);
    await db.suppress(t, 'all', l.email, 'A mano desde la ficha');
    if (l.phoneE164) await db.suppress(t, 'whatsapp', l.phoneE164, 'A mano desde la ficha');
    await db.cancelPending(id, null);
    await db.addEvent({ tenantId: t, leadId: id, kind: 'suppressed', byUser: s.userId, data: { channel: 'all', via: 'manual' } });
  }

  async function saveSettings(input: unknown, aiContext?: string | null) {
    requireAdmin();
    const r = settingsSchema.safeParse(input);
    if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const prev = await db.settings(t);
    try {
      await db.saveSettings({ ...r.data, tenantId: t, timezone: prev?.timezone ?? 'Europe/Madrid', ...(aiContext !== undefined ? { aiContext } : {}) });
    } catch (e) {
      if (e instanceof DuplicateKey) throw new AdminError(409, LEAD_ERRORS.brandTaken);
      throw e;
    }
  }

  /**
   * Las webs desde las que se aceptan leads (Leads entrantes → Conecta tu web). Cada una se normaliza al origen; si el
   * espacio aún no tiene ajustes, se crean con la marca `brand` (el slug del espacio) y lo demás por defecto.
   */
  async function saveOrigins(input: string[], brand: string) {
    requireAdmin();
    const out: string[] = [];
    for (const raw of input) {
      const o = normalizeOrigin(raw);
      if (!o) throw new AdminError(422, LEAD_ERRORS.badOrigin(raw.trim().slice(0, 80)));
      if (!out.includes(o)) out.push(o);
    }
    if (out.length > 20) throw new AdminError(422, LEAD_ERRORS.tooManyOrigins);
    const prev = await db.settings(t);
    if (prev) { await db.saveSettings({ ...prev, allowedOrigins: out }); return out; }
    await saveSettings({
      enabled: false, brand, allowedOrigins: out, fromEmail: null, fromName: null, replyTo: null, signerName: null, notifyEmails: [],
      bookingUrl: null, videoUrl: null, whatsappPhoneId: null, whatsappEnabled: false, whatsappTemplates: {}, sendFromHour: 8, sendToHour: 22, holidays: [],
    });
    return out;
  }

  /**
   * Quién firma el email y a quién se avisa (Leads entrantes → Email de respuesta): remitente, su nombre, a quién se
   * contesta y a quién avisamos de cada lead. Lo demás de los ajustes no se toca.
   */
  async function saveSender(input: { fromEmail: string | null; fromName: string | null; replyTo: string | null; notifyEmails: string[] }, brand: string) {
    requireAdmin();
    const email = z.string().email().max(200);
    const one = (v: string | null) => {
      const x = (v ?? '').trim().toLowerCase();
      if (!x) return null;
      if (!email.safeParse(x).success) throw new AdminError(422, LEAD_ERRORS.badEmail(x.slice(0, 80)));
      return x;
    };
    const notify = [...new Set(input.notifyEmails.map((x) => one(x)).filter((x): x is string => !!x))];
    if (notify.length > 5) throw new AdminError(422, LEAD_ERRORS.tooManyNotify);
    const fromName = (input.fromName ?? '').trim() || null;
    if (fromName && fromName.length > 80) throw new AdminError(422, LEAD_ERRORS.fromNameLong);
    const patch = { fromEmail: one(input.fromEmail), fromName, replyTo: one(input.replyTo), notifyEmails: notify };
    let prev = await db.settings(t);
    if (!prev) { await saveOrigins([], brand); prev = await db.settings(t); }
    if (!prev) throw new AdminError(404, LEAD_ERRORS.notFound);
    await db.saveSettings({ ...prev, ...patch });
  }

  /** Los textos de la empresa (vacío o igual que el de por defecto = el de por defecto). */
  async function saveTexts(input: unknown, aiContext?: string | null) {
    requireAdmin();
    const r = templatesSchema.safeParse(input);
    if (!r.success) throw new AdminError(422, r.error.issues.some((i) => i.message === LEAD_ERRORS.waVars) ? LEAD_ERRORS.waVars : 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const prev = await db.settings(t);
    if (!prev) throw new AdminError(404, LEAD_ERRORS.notFound);
    await db.saveSettings({ ...prev, templates: onlyCustom(r.data as LeadTemplates), ...(aiContext !== undefined ? { aiContext } : {}) });
  }

  /** Activar (entran leads reales) o pausar (solo pruebas). */
  async function setEnabled(on: boolean) {
    requireAdmin();
    const prev = await db.settings(t);
    if (!prev) throw new AdminError(404, LEAD_ERRORS.notFound);
    if (prev.enabled === on) return;
    await db.saveSettings({ ...prev, enabled: on });
  }
  async function lastSubmission(opts?: { external?: boolean }) { requireManager(); return db.lastSubmission(t, opts); }

  async function saveSignature(input: unknown) {
    requireAdmin();
    const r = signatureSchema.safeParse(input);
    if (!r.success) throw new AdminError(422, r.error.issues.some((i) => i.message === 'svg') ? LEAD_ERRORS.svgLogo : 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const prev = await db.settings(t);
    if (!prev) throw new AdminError(404, LEAD_ERRORS.notFound);
    const clean = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v));
    await db.saveSettings({ ...prev, emailSignature: clean });
  }

  /** Plazos de conservación del espacio (lo que diga su política de privacidad). */
  async function saveRetention(input: unknown) {
    requireAdmin();
    const r = retentionSchema.safeParse(input);
    if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const prev = await db.settings(t);
    if (!prev) throw new AdminError(404, LEAD_ERRORS.notFound);
    await db.saveSettings({ ...prev, retention: r.data });
  }

  /** Lo que más importa: cuánto tarda el primer contacto humano (minutos laborables), y de dónde vienen. */
  async function metrics() {
    requireManager();
    // Los anonimizados cuentan igual (de ellos solo queda lo que usan las métricas).
    const ls = (await db.list(t, 'all', { limit: 500, anonymized: true })).filter((l) => Date.parse(l.createdAt) > Date.now() - 30 * 86_400_000);
    const mins = ls.map((l) => l.firstResponseMins).filter((x): x is number => x != null).sort((a, b) => a - b);
    const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
    const bySource = new Map<string, number>();
    for (const l of ls) { const k = sourceKey(l.attributionFirst); bySource.set(k, (bySource.get(k) ?? 0) + 1); }
    return { total: ls.length, answered: mins.length, medianMins: median, within5: mins.filter((m) => m <= 5).length, bySource: [...bySource].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  }

  return { settings, list, counts, detail, setStage, markContacted, stopSequence, release, note, validate, suppress, saveSettings, saveTexts, saveSignature, saveRetention, setEnabled, lastSubmission, saveOrigins, saveSender, metrics, canConfigure: perms.manageTenant };
}
export type LeadsService = ReturnType<typeof createLeadsService>;

/** El servicio para esta petición: en Supabase con la sesión del usuario (RLS); en demo, en memoria. */
export async function leadsFor(admin: AdminContext): Promise<LeadsService> {
  if (admin.mode === 'supabase' && admin.supabase) {
    const { supabaseLeadsDb } = await import('./db-supabase');
    return createLeadsService(supabaseLeadsDb(admin.supabase), admin);
  }
  const { demoLeadsDb } = await import('./db-demo');
  return createLeadsService(demoLeadsDb(), admin);
}
