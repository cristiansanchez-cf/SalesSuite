/**
 * El calendario de cada persona (docs/CALENDAR.md): sus próximos pasos como eventos iCalendar (RFC 5545), al que se
 * suscribe una vez desde Outlook o Google. Con hora, a esa hora; sin hora, todo el día (criterio de Cristian: «Howl
 * Crew, hablar en enero: si no hay hora, todo el día»).
 */
export interface CalItem {
  kind: 'account' | 'dossier'; id: string; tenant: string; name: string; step: string | null; at: string;
  channel: string | null; contact: string | null; url: string;
}

/**
 * ¿Lleva hora? En el CRM el próximo paso es un día (se guarda a las 10:00 del servidor); las propuestas tienen fecha y
 * hora. Sin hora: las 10:00 en punto (el valor por defecto) o las 00:00 de su día.
 */
export function hasTime(it: CalItem, timeZone: string): boolean {
  const d = new Date(it.at);
  const local = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const defaultDay = d.getUTCHours() === 10 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (it.kind === 'account') return !defaultDay && local !== '00:00';
  return local !== '00:00';
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Líneas de más de 75 octetos, partidas como pide el estándar. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).replace(/-/g, '');
const nextDay = (ymd: string) => { const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1)); return d.toISOString().slice(0, 10).replace(/-/g, ''); };

export interface CalLabels { calName: string; meeting: string; with: (who: string) => string; open: string; channels: Record<string, string> }

export function buildIcs(items: CalItem[], o: { timeZone: string; now: Date; labels: CalLabels }): string {
  const L = o.labels;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cofundo Ventas//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(L.calName)}`, `X-WR-TIMEZONE:${o.timeZone}`,
    // Que Outlook y Google lo vuelvan a mirar a menudo (cada uno decide, pero lo piden: 1 h).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const it of items) {
    const timed = hasTime(it, o.timeZone);
    const meeting = it.channel === 'meeting';
    const summary = [it.name, it.step].filter(Boolean).join(' · ') || it.name;
    const desc = [
      it.step, it.contact ? L.with(it.contact) : null, it.channel && L.channels[it.channel] ? L.channels[it.channel] : null, it.tenant, `${L.open}: ${it.url}`,
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${it.kind}-${it.id}@cofundo-ventas`, `DTSTAMP:${stamp(o.now)}`, `SUMMARY:${esc(`${meeting ? `${L.meeting}: ` : ''}${summary}`)}`);
    if (timed) {
      const start = new Date(it.at);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + (meeting ? 60 : 30) * 60_000))}`);
    } else {
      const day = dayOf(it.at, o.timeZone);
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay(day)}`, 'TRANSP:TRANSPARENT');
    }
    lines.push(`DESCRIPTION:${esc(desc)}`, `URL:${it.url}`);
    if (timed) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, `TRIGGER:-PT${meeting ? 30 : 15}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
