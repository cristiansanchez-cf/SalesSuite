/**
 * Fecha y hora del próximo paso en la zona de quien lo apunta (docs/CALENDAR.md): «el jueves a las 12» en Madrid son las
 * 11:00 o las 10:00 UTC según la época del año. Sin hora, el día se guarda como siempre (las 10:00 del servidor), que el
 * calendario pinta «todo el día».
 */
export const DEFAULT_TZ = 'Europe/Madrid';

/** Minutos que la zona va por delante de UTC en ese instante. */
function offsetMin(utcMs: number, timeZone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - utcMs) / 60_000;
}

/** «2026-11-25» + «12:00» en Madrid → instante UTC. */
export function zonedToUtc(day: string, time: string, timeZone = DEFAULT_TZ): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = DEFAULT_TZ; }
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Dos pasadas: el cambio de hora puede caer entre la suposición y el resultado.
  const first = guess - offsetMin(guess, tz) * 60_000;
  return new Date(guess - offsetMin(first, tz) * 60_000);
}

/** «12», «12:30», «9:5» → «12:00», «12:30», null si no es una hora. */
export function cleanTime(v: unknown): string | null {
  const m = /^\s*([01]?\d|2[0-3])(?:[:.h]([0-5]\d))?\s*$/.exec(String(v ?? ''));
  return m ? `${m[1]!.padStart(2, '0')}:${m[2] ?? '00'}` : null;
}

/** La hora local (HH:MM) de un instante; null si es el «sin hora» (las 10:00 en punto UTC). */
export function localTime(iso: string | null, timeZone = DEFAULT_TZ): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getUTCHours() === 10 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** El día (AAAA-MM-DD) de un instante en una zona (si la zona no vale, Madrid). */
export function localDay(d: Date, timeZone = DEFAULT_TZ): string {
  const f = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  try { return f(timeZone); } catch { return f(DEFAULT_TZ); }
}
