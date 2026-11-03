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
import type { ReminderItem } from './flow';

export const REMIND_FROM = 9;
export const REMIND_TO = 12;
export const MAX_ITEMS = 5;

export interface ReminderMember { tenantId: string; userId: string; phone: string; name: string | null; locale: string | null; timezone: string }
export interface ReminderDb {
  members(): Promise<ReminderMember[]>;
  logged(days: string[]): Promise<Set<string>>;
  mark(userId: string, tenantId: string, day: string, items: number): Promise<void>;
}
export interface ReminderDeps {
  db: ReminderDb; assistant: AssistantDb; wa: WhatsApp | null; now: Date;
  settings(tenantId: string): Promise<LeadSettings | null>;
  actAs(tenantId: string, userId: string): Promise<AdminContext | null>;
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
  for (const m of members) {
    const { day, hour } = localClock(d.now, m.timezone);
    if (hour < REMIND_FROM || hour >= REMIND_TO || logged.has(`${m.userId}|${m.tenantId}|${day}`)) continue;
    if (!settings.has(m.tenantId)) settings.set(m.tenantId, await d.settings(m.tenantId).catch(() => null));
    const s = settings.get(m.tenantId);
    const locale = msgLocale(m.locale ?? 'es');
    const template = s?.whatsappTemplates?.reminder?.[locale] ?? s?.whatsappTemplates?.reminder?.es;
    // Sin número o sin plantilla aprobada no se puede escribir primero: se espera (sin apuntarlo como hecho).
    // El de Mi cuenta puede estar sin prefijo («699 00 01 11»): WhatsApp lo quiere completo.
    const to = toE164(m.phone, { locale: m.locale ?? 'es' });
    if (!s?.whatsappPhoneId || !template || !to) { r.skipped++; continue; }
    try {
      const admin = await d.actAs(m.tenantId, m.userId);
      if (!admin) { r.skipped++; continue; }
      const items = await reminderItems(admin);
      if (!items.length) { await d.db.mark(m.userId, m.tenantId, day, 0); r.empty++; continue; }
      await d.wa.sendTemplate(s.whatsappPhoneId, to, template, locale, [firstName(m.name) || '👋', String(items.length), namesLine(items.map((i) => i.name), locale)]);
      // La conversación queda esperando su «sí» (o lo que diga).
      const conv = await d.assistant.get(m.tenantId, m.userId);
      await d.assistant.save(m.tenantId, m.userId, { ...conv, state: { step: 'reminder', at: d.now.toISOString(), items } }, conv.version);
      await d.db.mark(m.userId, m.tenantId, day, items.length);
      r.sent++;
    } catch (e) {
      console.error('[reminders]', e instanceof Error ? e.message : e);
      r.failed++;
    }
  }
  return r;
}
