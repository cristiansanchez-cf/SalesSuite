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
import { businessMinutes } from './schedule';
import { STAGES, STOP_STAGES, type Lead, type LeadSettings, type Stage, type View } from './types';

export const LEAD_ERRORS = {
  notFound: 'Lead no encontrado',
  needsReason: 'Indica el motivo para descartarlo',
  brandTaken: 'Esa marca ya la usa otro espacio',
} as const;

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
  whatsappTemplates: z.record(z.enum(['wa1', 'wa2']), z.record(z.enum(['es', 'en', 'fr']), z.string().trim().regex(/^[a-z0-9_]{1,512}$/))),
  sendFromHour: z.number().int().min(0).max(23),
  sendToHour: z.number().int().min(1).max(24),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
});

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

  async function saveSettings(input: unknown) {
    requireAdmin();
    const r = settingsSchema.safeParse(input);
    if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const prev = await db.settings(t);
    try {
      await db.saveSettings({ ...r.data, tenantId: t, timezone: prev?.timezone ?? 'Europe/Madrid' });
    } catch (e) {
      if (e instanceof DuplicateKey) throw new AdminError(409, LEAD_ERRORS.brandTaken);
      throw e;
    }
  }

  /** Lo que más importa: cuánto tarda el primer contacto humano (minutos laborables), y de dónde vienen. */
  async function metrics() {
    requireManager();
    const ls = (await db.list(t, 'all', { limit: 500 })).filter((l) => Date.parse(l.createdAt) > Date.now() - 30 * 86_400_000);
    const mins = ls.map((l) => l.firstResponseMins).filter((x): x is number => x != null).sort((a, b) => a - b);
    const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
    const bySource = new Map<string, number>();
    for (const l of ls) { const k = l.attributionFirst?.utm_source ?? (l.attributionFirst?.gclid ? 'google-ads' : l.attributionFirst?.referrer ? 'referral' : 'directo'); bySource.set(k, (bySource.get(k) ?? 0) + 1); }
    return { total: ls.length, answered: mins.length, medianMins: median, within5: mins.filter((m) => m <= 5).length, bySource: [...bySource].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  }

  return { settings, list, counts, detail, setStage, markContacted, stopSequence, release, note, validate, suppress, saveSettings, metrics, canConfigure: perms.manageTenant };
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
