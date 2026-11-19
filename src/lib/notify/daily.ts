/**
 * Resumen diario de seguimientos (docs/NOTIFICATIONS.md): qué entra y cuándo se envía. Puro: se prueba sin base de datos.
 * Cada propuesta aparece UNA vez, en su motivo más urgente: vencido > hoy > abierta en 24 h > sin próximo paso.
 */
export interface DailyDossier {
  id: string; tenantId: string; authorId: string | null; title: string; company: string | null;
  status: string; outcome: 'open' | 'won' | 'lost'; nextStep: string | null; nextStepAt: string | null; publishedAt: string | null;
  /** El próximo paso de su empresa en el CRM (si está enlazada): «hablamos en enero» también la aparca. */
  accountNextStepAt?: string | null;
}
/** Aperturas de las últimas 24 h por propuesta. */
export interface DailyOpen { opens: number; lastAt: string }
export type DailyReason = 'overdue' | 'today' | 'opened' | 'noNextStep';
export interface DailyItem { dossier: DailyDossier; reason: DailyReason; opened: DailyOpen | null }
export interface DailyPlan {
  items: DailyItem[];
  /** Solo admins y jefes/as: lo vencido de otras personas del equipo. */
  team: { overdue: number; openedNoStep: number; people: Array<{ userId: string; overdue: number }> } | null;
}

export const SEND_HOUR = 7;
/** Si el cron no pudo enviarlo a primera hora, se intenta hasta esta hora; después, ese día se salta. */
export const LAST_HOUR = 12;
const DAY = 86_400_000;

/** Fecha (AAAA-MM-DD) y hora local en una zona horaria. Zona inválida → Europe/Madrid. */
export function localClock(now: Date, timeZone: string): { day: string; hour: number } {
  const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  let parts: Intl.DateTimeFormatPart[];
  try { parts = fmt(timeZone).formatToParts(now); } catch { parts = fmt('Europe/Madrid').formatToParts(now); }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** ¿Toca enviarle hoy? Entre las 7:00 y las 12:00 de su hora local, y una sola vez por día. */
export function dailyDue(now: Date, timeZone: string, alreadySent: boolean): { due: boolean; day: string } {
  const { day, hour } = localClock(now, timeZone);
  return { due: !alreadySent && hour >= SEND_HOUR && hour < LAST_HOUR, day };
}

export function dailyPlan(
  member: { userId: string; manager: boolean },
  dossiers: DailyDossier[],
  opens: Map<string, DailyOpen>,
  now: Date,
  timeZone: string,
): DailyPlan {
  const t = now.getTime();
  const today = localClock(now, timeZone).day;
  const live = dossiers.filter((d) => d.outcome === 'open' && d.status !== 'archived');
  const later = (x: string | null | undefined) => !!x && localClock(new Date(x), timeZone).day > today;
  const reasonOf = (d: DailyDossier): DailyReason | null => {
    // La empresa ya tiene fecha más adelante («hablamos en enero»): manda sobre un paso viejo de la propuesta.
    if (later(d.accountNextStepAt)) return null;
    if (d.nextStepAt && Date.parse(d.nextStepAt) < t) return 'overdue';
    if (d.nextStepAt && localClock(new Date(d.nextStepAt), timeZone).day === today) return 'today';
    // Aparcada hasta una fecha (la suya o la de su empresa: «hablamos en enero»): nada hasta ese día, ni aunque la abran.
    if (later(d.nextStepAt)) return null;
    if (opens.has(d.id)) return 'opened';
    if (d.status === 'published' && !d.nextStepAt && !d.accountNextStepAt && d.publishedAt && t - Date.parse(d.publishedAt) > DAY) return 'noNextStep';
    return null;
  };
  const ORDER: DailyReason[] = ['overdue', 'today', 'opened', 'noNextStep'];
  const items = live.filter((d) => d.authorId === member.userId)
    .map((d) => ({ dossier: d, reason: reasonOf(d), opened: opens.get(d.id) ?? null }))
    .filter((x): x is DailyItem => x.reason !== null)
    .sort((a, b) => ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason)
      || (a.dossier.nextStepAt ?? '').localeCompare(b.dossier.nextStepAt ?? '')
      || (b.opened?.lastAt ?? '').localeCompare(a.opened?.lastAt ?? ''));
  // Sin próximo paso: como mucho 5, para que el email no sea una lista eterna.
  const capped = [...items.filter((i) => i.reason !== 'noNextStep'), ...items.filter((i) => i.reason === 'noNextStep').slice(0, 5)];

  let team: DailyPlan['team'] = null;
  if (member.manager) {
    const others = live.filter((d) => d.authorId && d.authorId !== member.userId);
    const late = others.filter((d) => d.nextStepAt && Date.parse(d.nextStepAt) < t && !later(d.accountNextStepAt));
    const by = new Map<string, number>();
    for (const d of late) by.set(d.authorId!, (by.get(d.authorId!) ?? 0) + 1);
    team = {
      overdue: late.length,
      openedNoStep: others.filter((d) => opens.has(d.id) && !d.nextStepAt && !d.accountNextStepAt).length,
      people: [...by].map(([userId, overdue]) => ({ userId, overdue })).sort((a, b) => b.overdue - a.overdue).slice(0, 5),
    };
    if (!team.overdue && !team.openedNoStep) team = null;
  }
  return { items: capped, team };
}

/** Enlace a «Preparar mensaje» con la propuesta ya elegida y el tipo de mensaje que toca. */
export function composeHref(d: DailyDossier, reason: DailyReason): string {
  const type = reason === 'opened' || reason === 'noNextStep' ? 'tras_reunion' : 'seguimiento';
  return `/admin/compose?dossier=${encodeURIComponent(d.id)}&type=${type}&go=1`;
}

/**
 * Reuniones de hoy (criterio de Cristian: «otro recordatorio distinto del para hoy… más importante, que el correo diga
 * que es importante»): las empresas con el próximo paso «Reunión» hoy y las propuestas cuyo paso de hoy es una reunión.
 * Van en un correo aparte, marcado como importante, y no se repiten en «Para hoy».
 */
export interface DailyMeetingRow {
  id: string; tenantId: string; ownerId: string | null; name: string; nextStep: string | null; nextStepAt: string | null; nextChannel: string | null; contactName: string | null;
}
export interface DailyMeeting { kind: 'account' | 'dossier'; id: string; name: string; step: string | null; at: string; contact: string | null }
const MEETING = /(reuni[oó]n|reunirnos|\bcita\b|meeting|\bdemo\b|quedada|hemos quedado|reunião|미팅|회의)/iu;

export function meetingsToday(userId: string, accounts: DailyMeetingRow[], dossiers: DailyDossier[], now: Date, timeZone: string): DailyMeeting[] {
  const today = localClock(now, timeZone).day;
  const isToday = (iso: string | null) => !!iso && localClock(new Date(iso), timeZone).day === today;
  const fromAccounts = accounts.filter((a) => a.ownerId === userId && a.nextChannel === 'meeting' && isToday(a.nextStepAt))
    .map((a): DailyMeeting => ({ kind: 'account', id: a.id, name: a.name, step: a.nextStep, at: a.nextStepAt!, contact: a.contactName }));
  const fromDossiers = dossiers.filter((d) => d.authorId === userId && d.outcome === 'open' && d.status !== 'archived' && isToday(d.nextStepAt) && MEETING.test(d.nextStep ?? ''))
    .map((d): DailyMeeting => ({ kind: 'dossier', id: d.id, name: d.company || d.title, step: d.nextStep, at: d.nextStepAt!, contact: null }));
  return [...fromAccounts, ...fromDossiers].sort((a, b) => a.at.localeCompare(b.at));
}
