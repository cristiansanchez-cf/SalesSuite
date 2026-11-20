/**
 * En prueba (docs/CLIENTS.md §En prueba): lógica pura. Una prueba tiene inicio y fin (días, sin hora); mientras está en
 * marcha, la empresa sale «En prueba hasta…» en todas partes. Se avisa los últimos días y, si se pasa la fecha sin
 * decidir, «¿Se queda?». Si paga o se cierra con acuerdo después de empezarla, cuenta como convertida sin hacer nada.
 */
export interface Trial {
  id: string; accountId: string; startsOn: string; endsOn: string; note: string | null;
  createdBy: string | null; createdAt: string; endedAt: string | null; outcome: 'stays' | 'leaves' | null;
}

/** Las duraciones de siempre («10 o 15 días, un mes, dos meses»). Meses de verdad, no 30 días. */
export const TRIAL_PRESETS = [
  { key: '10d', days: 10 }, { key: '15d', days: 15 }, { key: '1m', months: 1 }, { key: '2m', months: 2 },
] as const satisfies ReadonlyArray<{ key: string; days?: number; months?: number }>;
export type TrialPreset = (typeof TRIAL_PRESETS)[number]['key'];

/** Los últimos días: se avisa. */
export const TRIAL_SOON_DAYS = 3;

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** El día que acaba una prueba que empieza `from` con esa duración (el 31 + 1 mes → el último del mes siguiente). */
export function trialEnd(from: string, preset: TrialPreset): string {
  const p = TRIAL_PRESETS.find((x) => x.key === preset)!;
  return trialEndFrom(from, 'days' in p ? { days: p.days } : { months: p.months });
}

/** ¿En marcha? Sin acabar y sin convertirse (pagó o se cerró con acuerdo después de empezarla). */
export function isOpen(t: Trial | null | undefined, wonAt: string | null): t is Trial {
  if (!t || t.endedAt) return false;
  return !(wonAt && Date.parse(wonAt) > Date.parse(t.createdAt));
}

export type TrialTone = 'running' | 'soon' | 'over';
export interface TrialStatus {
  /** Días que quedan (0 = acaba hoy; negativo = se pasó hace N días). */
  daysLeft: number;
  /** De cuántos días es. */
  length: number;
  /** Cuántos lleva (para la barra). */
  elapsed: number;
  tone: TrialTone;
}
/** Cómo va, con el día de hoy en la zona del equipo (YYYY-MM-DD). */
export function trialStatus(t: Pick<Trial, 'startsOn' | 'endsOn'>, today: string): TrialStatus {
  const length = Math.max(1, Math.round((utc(t.endsOn) - utc(t.startsOn)) / DAY));
  const daysLeft = Math.round((utc(t.endsOn) - utc(today)) / DAY);
  const elapsed = Math.min(length, Math.max(0, Math.round((utc(today) - utc(t.startsOn)) / DAY)));
  return { daysLeft, length, elapsed, tone: daysLeft < 0 ? 'over' : daysLeft <= TRIAL_SOON_DAYS ? 'soon' : 'running' };
}

/** El aviso de «acaba la prueba» en los próximos pasos: unos días antes (o el día que empieza, si es muy corta). */
export function trialReminderDay(t: Pick<Trial, 'startsOn' | 'endsOn'>): string {
  return isoDay(Math.max(utc(t.startsOn), utc(t.endsOn) - TRIAL_SOON_DAYS * DAY));
}
export const TRIAL_STEP = 'Acaba la prueba: ¿se queda?';

/** Lo que dice el asistente o una nota («2 meses», «15 días», «un mes», «hasta el 20 de enero» ya viene como fecha). */
export function trialFromWords(text: string): TrialPreset | { days: number } | { months: number } | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = (w: string) => ({ un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, diez: 10, quince: 15, veinte: 20, treinta: 30 } as Record<string, number>)[w] ?? Number(w);
  const m = /\b(\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|diez|quince|veinte|treinta)\s+(dias?|semanas?|mes(?:es)?)\b/.exec(t);
  if (!m) return null;
  const k = n(m[1]!);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (m[2]!.startsWith('mes')) return k === 1 ? '1m' : k === 2 ? '2m' : k <= 12 ? { months: k } : null;
  const days = m[2]!.startsWith('semana') ? k * 7 : k;
  return days === 10 ? '10d' : days === 15 ? '15d' : days <= 366 ? { days } : null;
}

/** Fin a partir de lo que diga («2 meses», «15 días»…). */
export function trialEndFrom(from: string, d: TrialPreset | { days: number } | { months: number }): string {
  if (typeof d === 'string') return trialEnd(from, d);
  if ('days' in d) return isoDay(utc(from) + d.days * DAY);
  // Meses de verdad: el 31 + 1 mes → el último día del mes siguiente.
  const x = new Date(utc(from));
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + d.months);
  x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()));
  return isoDay(x.getTime());
}
