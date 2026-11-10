/**
 * Recordatorios por WhatsApp (docs/ASSISTANT.md §Recordatorios). Cada mañana (de 9:00 a 12:00 en su zona horaria), a
 * quien lo tenga activado en Mi cuenta: «Hoy tienes 3 seguimientos: Club Sol, …». Es lo de «Hoy» en sus empresas: lo
 * que se enfría (contestó y llevamos 3 días laborables sin hacer nada), lo vencido y lo de hoy. Para escribir primero,
 * WhatsApp exige una plantilla aprobada (Utility, Leads → Ajustes → WhatsApp). Si contesta que sí, el asistente le
 * manda una propuesta de mensaje por empresa (flow.ts).
 */
import type { AdminContext } from '../admin/auth';
import type { LeadSettings } from '../leads/types';
import type { WhatsApp } from '../leads/whatsapp';
import { toE164 } from '../leads/normalize';
import { msgLocale } from '../leads/templates';
import { localClock } from '../notify/daily';
import type { AssistantDb } from './db';
import type { HubConfig } from './hub-config';
import type { ReminderItem } from './flow';
import { withUsageScope } from '../usage/meter';

export const REMIND_FROM = 9;
export const REMIND_TO = 12;
export const MAX_ITEMS = 5;

export interface ReminderMember { tenantId: string; userId: string; phone: string; name: string | null; locale: string | null; timezone: string }
export interface ReminderDb {
  members(): Promise<ReminderMember[]>;
  logged(days: string[]): Promise<Set<string>>;
  /** Quién ya recibió un recordatorio (con algo) esos días: «usuario|día». */
  sentUsers(days: string[]): Promise<Set<string>>;
  mark(userId: string, tenantId: string, day: string, items: number): Promise<void>;
}
export interface ReminderDeps {
  db: ReminderDb; assistant: AssistantDb; wa: WhatsApp | null; now: Date;
  settings(tenantId: string): Promise<LeadSettings | null>;
  actAs(tenantId: string, userId: string): Promise<AdminContext | null>;
  /**
   * Con el número del asistente (docs/ASSISTANT.md §Un número para todas las empresas): sale de ese número, con sus
   * plantillas, y como mucho uno al día por persona (de la empresa con la que trabajó la última vez, si tiene algo; si
   * no, de la primera que tenga). Queda elegida esa empresa, para que su «sí» vaya a ella.
   */
  hub?: HubConfig | null;
}

/** Lo que toca hoy en sus empresas, en el orden de «Hoy», con lo justo para proponer el mensaje. */
export async function reminderItems(admin: AdminContext): Promise<ReminderItem[]> {
  const t = await admin.crm.today();
  return t.items.filter((i) => i.bucket === 'cooling' || i.bucket === 'overdue' || i.bucket === 'today').slice(0, MAX_ITEMS).map((i) => ({
    accountId: i.id, name: i.name, bucket: i.bucket as ReminderItem['bucket'], cooling: i.cooling, contactName: i.contactName, step: i.nextStep ?? null,
    channel: (i.nextChannel as string | null) ?? null, last: i.last ? { outcome: i.last.outcome, note: i.last.note?.slice(0, 600) ?? null, at: i.last.happenedAt } : null,
    facts: (i.facts ?? []).filter((f) => f.key).slice(0, 3).map((f) => f.text.slice(0, 200)),
  }));
}
const firstName = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || '';
/** «Club Sol, Sala Marina y 2 más». */
export function namesLine(names: string[], locale: string): string {
  const l = msgLocale(locale);
  const and = l === 'es' ? 'y' : l === 'fr' ? 'et' : 'and';
  const more = (n: number) => (l === 'es' ? `${n} más` : l === 'fr' ? `${n} autres` : `${n} more`);
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}` : names[0] ?? '';
  return `${names.slice(0, 3).join(', ')} ${and} ${more(names.length - 3)}`;
}

export interface ReminderResult { sent: number; empty: number; skipped: number; failed: number }
export async function runReminders(d: ReminderDeps): Promise<ReminderResult> {
  const r: ReminderResult = { sent: 0, empty: 0, skipped: 0, failed: 0 };
  if (!d.wa) return r;
  const members = await d.db.members();
  if (!members.length) return r;
  const days = [...new Set(members.map((m) => localClock(d.now, m.timezone).day))];
  const logged = await d.db.logged(days);
  const settings = new Map<string, LeadSettings | null>();
  // Con el número del asistente: una persona, un recordatorio al día (de cualquiera de sus empresas).
  const userDay = d.hub ? await d.db.sentUsers(days) : new Set<string>();
  if (d.hub) {
    // Primero la empresa con la que trabajó la última vez.
    const last = new Map<string, string | null>();
    for (const u of new Set(members.map((m) => m.userId))) last.set(u, (await d.assistant.session(u).catch(() => null))?.tenantId ?? null);
    members.sort((a, b) => Number(last.get(b.userId) === b.tenantId) - Number(last.get(a.userId) === a.tenantId));
  }
  for (const m of members) {
    const { day, hour } = localClock(d.now, m.timezone);
    if (hour < REMIND_FROM || hour >= REMIND_TO || logged.has(`${m.userId}|${m.tenantId}|${day}`)) continue;
    if (d.hub && userDay.has(`${m.userId}|${day}`)) continue;
    const locale = msgLocale(m.locale ?? 'es');
    let phoneId: string | null;
    let template: string | undefined;
    if (d.hub) {
      phoneId = d.hub.phoneId;
      template = d.hub.templates[locale] ?? d.hub.templates.es;
    } else {
      if (!settings.has(m.tenantId)) settings.set(m.tenantId, await d.settings(m.tenantId).catch(() => null));
      const s = settings.get(m.tenantId);
      phoneId = s?.whatsappPhoneId ?? null;
      template = s?.whatsappTemplates?.reminder?.[locale] ?? s?.whatsappTemplates?.reminder?.es;
    }
    // Sin número o sin plantilla aprobada no se puede escribir primero: se espera (sin apuntarlo como hecho).
    // El de Mi cuenta puede estar sin prefijo («699 00 01 11»): WhatsApp lo quiere completo.
    const to = toE164(m.phone, { locale: m.locale ?? 'es' });
    if (!phoneId || !template || !to) { r.skipped++; continue; }
    try {
      // Lo que cueste (la plantilla de WhatsApp) es de su espacio (docs/COSTES.md).
      const out = await withUsageScope({ tenantId: m.tenantId, userId: m.userId }, async (): Promise<'sent' | 'empty' | 'skipped'> => {
        const admin = await d.actAs(m.tenantId, m.userId);
        if (!admin) return 'skipped';
        const items = await reminderItems(admin);
        if (!items.length) { await d.db.mark(m.userId, m.tenantId, day, 0); return 'empty'; }
        await d.wa!.sendTemplate(phoneId!, to, template!, locale, [firstName(m.name) || '👋', String(items.length), namesLine(items.map((i) => i.name), locale)]);
        // La conversación queda esperando su «sí» (o lo que diga).
        const conv = await d.assistant.get(m.tenantId, m.userId);
        await d.assistant.save(m.tenantId, m.userId, { ...conv, state: { step: 'reminder', at: d.now.toISOString(), items } }, conv.version);
        await d.db.mark(m.userId, m.tenantId, day, items.length);
        if (d.hub) {
          // Su «sí» va a esta empresa: queda elegida para hoy.
          const prev = await d.assistant.session(m.userId).catch(() => null);
          await d.assistant.saveSession(m.userId, { tenantId: m.tenantId, chosenAt: d.now.toISOString(), askedAt: null, pending: prev?.pending ?? [] });
          userDay.add(`${m.userId}|${day}`);
        }
        return 'sent';
      });
      r[out]++;
    } catch (e) {
      console.error('[reminders]', e instanceof Error ? e.message : e);
      r.failed++;
    }
  }
  return r;
}
