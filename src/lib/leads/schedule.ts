/**
 * Horarios de los envíos y minutos laborables (docs/LEADS.md §Horario). Todo en la zona horaria del espacio
 * (Europe/Madrid por defecto), sin librerías: Intl da la hora local y se busca el instante UTC que le corresponde.
 */
export interface Hours { timezone: string; sendFromHour: number; sendToHour: number; holidays: string[] }
export const WORK = { from: 9, to: 20 } as const;

export interface Local { y: number; m: number; d: number; h: number; min: number; dow: number; ymd: string }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
    fmtCache.set(tz, f);
  }
  return f;
}
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function local(at: Date, tz: string): Local {
  const p = Object.fromEntries(fmt(tz).formatToParts(at).map((x) => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  return { y, m, d, h: +p.hour % 24, min: +p.minute, dow: DOW[p.weekday] ?? 0, ymd: `${p.year}-${p.month}-${p.day}` };
}

/** El instante UTC de una hora local (y-m-d h:min en tz). Con cambio de hora, la primera que exista. */
export function zoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const l = local(new Date(t), tz);
    const diff = Date.UTC(l.y, l.m - 1, l.d, l.h, l.min) - Date.UTC(y, m - 1, d, h, min);
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

const addDays = (l: Local, n: number) => { const x = new Date(Date.UTC(l.y, l.m - 1, l.d + n)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: x.getUTCDay(), ymd: x.toISOString().slice(0, 10) }; };
export const isBusinessDay = (day: { dow: number; ymd: string }, holidays: string[]) => day.dow >= 1 && day.dow <= 5 && !holidays.includes(day.ymd);

export type Eta = 'minutes' | 'today' | 'next_business_day';

/**
 * Primer WhatsApp: dentro del horario (8:00-22:00), a los 1-3 minutos para que no parezca un robot instantáneo.
 * Fuera de él, a las 9:00 siguientes. `rand` ∈ [0,1) para las pruebas.
 */
export function firstSendAt(now: Date, h: Hours, rand = Math.random()): { at: Date; eta: Eta } {
  const l = local(now, h.timezone);
  const inWindow = l.h >= h.sendFromHour && l.h < h.sendToHour;
  if (inWindow) return { at: new Date(now.getTime() + 60_000 + Math.floor(rand * 120_000)), eta: 'minutes' };
  const day = l.h < h.sendFromHour ? addDays(l, 0) : addDays(l, 1);
  const at = zoned(day.y, day.m, day.d, 9, Math.floor(rand * 10), h.timezone);
  return { at, eta: day.ymd === l.ymd ? 'today' : 'next_business_day' };
}

/** El día laborable siguiente al de `after` (hora local), a la hora dada. */
export function nextBusinessAt(after: Date, h: Hours, hour = 10, rand = Math.random()): Date {
  const l = local(after, h.timezone);
  for (let i = 1; i <= 14; i++) {
    const day = addDays(l, i);
    if (isBusinessDay(day, h.holidays)) return zoned(day.y, day.m, day.d, hour, Math.floor(rand * 20), h.timezone);
  }
  const day = addDays(l, 1);
  return zoned(day.y, day.m, day.d, hour, 0, h.timezone);
}

/**
 * Minutos laborables entre dos instantes (lunes a viernes no festivos, 9:00-20:00 hora local). La métrica clave:
 * cuánto tarda el primer contacto. Un lead del viernes a las 21:00 contestado el lunes a las 9:10 son 10 minutos.
 */
export function businessMinutes(from: Date, to: Date, h: Hours): number {
  if (to <= from) return 0;
  let total = 0;
  const start = local(from, h.timezone);
  for (let i = 0; i < 120; i++) {
    const day = addDays(start, i);
    const open = zoned(day.y, day.m, day.d, WORK.from, 0, h.timezone);
    if (open > to) break;
    if (!isBusinessDay(day, h.holidays)) continue;
    const close = zoned(day.y, day.m, day.d, WORK.to, 0, h.timezone);
    const a = Math.max(open.getTime(), from.getTime());
    const b = Math.min(close.getTime(), to.getTime());
    if (b > a) total += (b - a) / 60_000;
  }
  return Math.round(total);
}
