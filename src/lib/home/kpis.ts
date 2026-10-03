/**
 * Inicio (docs/UX_REVIEW.md #2): lo que el CEO o jefe/a necesita ver en diez segundos y lo que el comercial
 * tiene que hacer hoy. Cálculo PURO a partir de datos ya cargados (lo prueba kpis.test.ts).
 */
import type { DossierRecord } from '../admin/types';
import type { RevenueEvent } from '../commissions/types';

export interface PersonRow { userId: string; name: string; open: number; wonMonth: number; overdue: number }
export interface TeamKpis {
  wonMonth: number; wonPrevMonth: number;
  /** Ganadas / (ganadas + perdidas) en los últimos 90 días; null si no hay cierres. */
  closeRate: number | null; closedLast90: number;
  openPipeline: number; publishedOpen: number;
  revenueMonthCents: number; revenueCurrency: string;
  overdue: Array<DossierRecord & { authorName: string }>;
  people: PersonRow[];
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const prevMonth = (d: Date) => monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)));

export function teamKpis(dossiers: DossierRecord[], events: RevenueEvent[], names: Map<string, string>, now: Date): TeamKpis {
  const m = monthKey(now);
  const pm = prevMonth(now);
  const t = now.getTime();
  const at = (d: DossierRecord) => d.outcomeAt ?? d.updatedAt ?? '';
  const won = dossiers.filter((d) => d.outcome === 'won');
  const closed90 = dossiers.filter((d) => d.outcome !== 'open' && t - Date.parse(at(d) || '1970-01-01') <= 90 * 86_400_000);
  const open = dossiers.filter((d) => d.outcome === 'open' && d.status !== 'archived');
  const overdue = open.filter((d) => d.nextStepAt && Date.parse(d.nextStepAt) < t)
    .sort((a, b) => a.nextStepAt!.localeCompare(b.nextStepAt!))
    .map((d) => ({ ...d, authorName: names.get(d.authorId ?? '') ?? 'Sin autor' }));
  const monthRevenue = events.filter((e) => e.status === 'confirmed' && e.kind !== 'metric' && e.occurredAt.startsWith(m));
  const currency = monthRevenue[0]?.currency ?? 'EUR';
  const revenue = monthRevenue.filter((e) => e.currency === currency).reduce((s, e) => s + (e.kind === 'refund' ? -e.revenueCents : e.revenueCents), 0);
  const people = new Map<string, PersonRow>();
  const row = (u: string) => people.get(u) ?? people.set(u, { userId: u, name: names.get(u) ?? 'Sin autor', open: 0, wonMonth: 0, overdue: 0 }).get(u)!;
  for (const d of open) if (d.authorId) row(d.authorId).open++;
  for (const d of won) if (d.authorId && at(d).startsWith(m)) row(d.authorId).wonMonth++;
  for (const d of overdue) if (d.authorId) row(d.authorId).overdue++;
  const closedWon = closed90.filter((d) => d.outcome === 'won').length;
  return {
    wonMonth: won.filter((d) => at(d).startsWith(m)).length,
    wonPrevMonth: won.filter((d) => at(d).startsWith(pm)).length,
    closeRate: closed90.length ? closedWon / closed90.length : null,
    closedLast90: closed90.length,
    openPipeline: open.length,
    publishedOpen: open.filter((d) => d.status === 'published').length,
    revenueMonthCents: revenue, revenueCurrency: currency,
    overdue,
    people: [...people.values()].sort((a, b) => b.wonMonth - a.wonMonth || b.overdue - a.overdue || a.name.localeCompare(b.name, 'es')),
  };
}

export interface MyDay {
  overdue: DossierRecord[];
  today: DossierRecord[];
  upcoming: DossierRecord[];
  noNextStep: DossierRecord[];
}
/** El día del comercial: lo vencido primero, después lo de hoy y lo de esta semana; lo publicado sin próximo paso, al final. */
export function myDay(dossiers: DossierRecord[], userId: string, now: Date): MyDay {
  const mine = dossiers.filter((d) => d.authorId === userId && d.outcome === 'open' && d.status !== 'archived');
  const dayEnd = new Date(now); dayEnd.setUTCHours(23, 59, 59, 999);
  const week = now.getTime() + 7 * 86_400_000;
  const by = (a: DossierRecord, b: DossierRecord) => (a.nextStepAt ?? '').localeCompare(b.nextStepAt ?? '');
  const with_ = mine.filter((d) => d.nextStepAt);
  return {
    overdue: with_.filter((d) => Date.parse(d.nextStepAt!) < now.getTime()).sort(by),
    today: with_.filter((d) => Date.parse(d.nextStepAt!) >= now.getTime() && Date.parse(d.nextStepAt!) <= dayEnd.getTime()).sort(by),
    upcoming: with_.filter((d) => Date.parse(d.nextStepAt!) > dayEnd.getTime() && Date.parse(d.nextStepAt!) <= week).sort(by),
    noNextStep: mine.filter((d) => !d.nextStepAt && d.status === 'published'),
  };
}
