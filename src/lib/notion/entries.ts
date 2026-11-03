/**
 * La bitácora de una página → entradas con fecha (docs/CRM_DINAMICO.md §48). No se inventa nada:
 * - EXACT: el día está escrito («3 nov 2026», «2026-06-03», «16-jun-2026», «14/06/2026»); con hora si la lleva.
 * - Sin año («23 abr», «02/06»): se usa el de la entrada anterior de la misma lista o sección, si lo tiene
 *   (`yearFromPrevious`, para revisarlo); si no hay ninguna con año, se queda como aproximada. Un título con fecha suelto
 *   por la página no hereda el año de otro.
 * - APPROX: rangos («10–13 oct», «12 → 19 jun»), «~26 jun», «mediados de sept.», «Antes de la 1ª reunión» o sin fecha.
 *   No se convierten en interacción: siguen en el documento.
 * Dónde se buscan: en las secciones «Bitácora» / «Historial» (cada subtítulo o, si no hay, cada viñeta de primer nivel
 * es una entrada) y, en el resto, los títulos que empiezan por una fecha.
 */
import { docMarkdown, plain, type DocBlock } from './doc';

export type EntryKind = 'exact' | 'approx';
export interface Entry {
  kind: EntryKind;
  /** El título o la primera línea de la entrada, tal cual. */
  title: string;
  /** Fecha y hora (ISO) si es exacta; `dateOnly` si solo se sabe el día. */
  at: string | null; dateOnly: boolean;
  yearFromPrevious: boolean;
  /** Por qué es aproximada («rango», «sin año», «sin fecha»…). */
  why: string | null;
  /** El texto entero de la entrada en Markdown (título incluido). */
  note: string;
  channel: 'whatsapp' | 'email' | 'phone' | 'meeting' | 'other';
  /** Dónde estaba: «Bitácora», «Historial»… o «Título». */
  section: string;
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7,
  ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const END = '(?=$|[\\s,.:;·—–\\-()\\[\\]]|\\*)';
const RE_ISO = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${END}`);
const RE_TEXT = new RegExp(`^(\\d{1,2})(?:\\s+de)?[\\s\\-/]+(${MON})\\.?(?:(?:\\s+de)?[\\s\\-/]+(\\d{4}))?${END}`, 'i');
const RE_NUM = new RegExp(`^(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?${END}`);
const RE_TIME = /^[\s,]*(?:a las\s+)?(\d{1,2}):(\d{2})(?!\d)/;
const RE_RANGE_HEAD = new RegExp(`^(\\d{1,2})\\s*[–\\-]\\s*(\\d{1,2})\\s+(${MON})`, 'i');
const APPROX_WORDS = /^(~|aprox|alrededor|hacia|mediados|finales|principios|primeros|antes|después|despues|hasta|desde|tras|sin fecha|semana)/i;

/** Lee la fecha del principio de un texto. */
export function leadDate(raw: string): { y: number | null; m: number; d: number; hh?: number; mm?: number; rest: string } | { approx: string } | null {
  const s = raw.replace(/^[\s*_]+/, '').trim();
  if (APPROX_WORDS.test(s)) return { approx: 'aproximada' };
  if (RE_RANGE_HEAD.test(s)) return { approx: 'rango' };
  let m: RegExpExecArray | null;
  let y: number | null = null, mo = 0, d = 0, rest = '';
  if ((m = RE_ISO.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = s.slice(m[0].length); }
  else if ((m = RE_TEXT.exec(s))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3] ? +m[3] : null; rest = s.slice(m[0].length); }
  else if ((m = RE_NUM.exec(s))) { d = +m[1]; mo = +m[2]; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null; rest = s.slice(m[0].length); }
  else return null;
  // Un rango que empieza por fecha («12-may → 14-jun», «20 may → 3 jun»): aproximada.
  if (/^\s*(→|->|–\s*\d|-\s*\d|al\s+\d|a\s+\d)/.test(rest)) return { approx: 'rango' };
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = RE_TIME.exec(rest);
  return t && +t[1] < 24 && +t[2] < 60 ? { y, m: mo, d, hh: +t[1], mm: +t[2], rest: rest.slice(t[0].length) } : { y, m: mo, d, rest };
}
const realDay = (y: number, m: number, d: number) => { const x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };
/** La hora local de Madrid → ISO. Sin hora: las 10:00, como los próximos pasos de solo fecha (se enseña sin hora). */
function madridIso(y: number, m: number, d: number, hh = 10, mm = 0): string {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parts = Object.fromEntries(tz.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return new Date(guess - (asLocal - guess)).toISOString();
}
/** Canal, solo si el título lo dice. */
export function channelOf(title: string): Entry['channel'] {
  const hits: Array<[number, Entry['channel']]> = [];
  const at = (re: RegExp, c: Entry['channel']) => { const i = title.search(re); if (i >= 0) hits.push([i, c]); };
  at(/whats\s?app/i, 'whatsapp');
  at(/\b(e-?mail|correo|mail)\b/i, 'email');
  at(/\b(llamada|llamé|llamo|telef[oó]n)/i, 'phone');
  at(/\b(reuni[oó]n|presencial|meeting|videollamada)\b/i, 'meeting');
  return hits.sort((a, b) => a[0] - b[0])[0]?.[1] ?? 'other';
}

const LOG_SECTION = /^(bit[aá]cora|historial)/i;
interface Raw { title: string; blocks: DocBlock[]; section: string; group: string }

/** Las entradas en el orden de la página. */
export function extractEntries(doc: DocBlock[]): Entry[] {
  const raws: Raw[] = [];
  // Secciones: cada título abre una; las de bitácora/historial se recorren entrada a entrada.
  for (let i = 0; i < doc.length; i++) {
    const b = doc[i];
    if (b.type !== 'heading') continue;
    const title = plain(b.text).trim();
    const lvl = b.level ?? 2;
    // Hasta el siguiente título del mismo nivel o más alto.
    let j = i + 1;
    while (j < doc.length && !(doc[j].type === 'heading' && (doc[j].level ?? 2) <= lvl)) j++;
    const body = [...(b.children ?? []), ...doc.slice(i + 1, j)];
    if (LOG_SECTION.test(title)) {
      const subs = body.some((x) => x.type === 'heading');
      let cur: Raw | null = null;
      for (const x of body) {
        if (x.type === 'heading') {
          cur = { title: plain(x.text).trim(), blocks: [x], section: title, group: title };
          raws.push(cur);
        } else if (!subs && (x.type === 'bulleted' || x.type === 'numbered')) {
          cur = { title: plain(x.text).trim(), blocks: [x], section: title, group: title };
          raws.push(cur);
        } else if (cur) cur.blocks.push(x);
      }
      i = j - 1;
    } else if (leadDate(title) && !('approx' in (leadDate(title) as object))) {
      // Un título con fecha fuera de la bitácora («2 jul 2026 — Cerrado ganado»).
      raws.push({ title, blocks: doc.slice(i, j).filter((x, k) => k === 0 || x.type !== 'heading' || (x.level ?? 2) > lvl), section: 'Título', group: `título-${i}` });
    }
  }
  // Fechas: el año que falta, el de la entrada anterior de la misma lista.
  const lastYear = new Map<string, number>();
  return raws.map((r): Entry => {
    const note = docMarkdown(r.blocks).trim();
    const base = { title: r.title, note, channel: channelOf(r.title), section: r.section };
    const ld = leadDate(r.title);
    if (!ld) return { ...base, kind: 'approx', at: null, dateOnly: true, yearFromPrevious: false, why: 'sin fecha' };
    if ('approx' in ld) return { ...base, kind: 'approx', at: null, dateOnly: true, yearFromPrevious: false, why: ld.approx };
    let year = ld.y;
    const fromPrev = year == null;
    if (year == null) year = lastYear.get(r.group) ?? null;
    else lastYear.set(r.group, year);
    if (year == null) return { ...base, kind: 'approx', at: null, dateOnly: true, yearFromPrevious: false, why: 'sin año' };
    if (!realDay(year, ld.m, ld.d)) return { ...base, kind: 'approx', at: null, dateOnly: true, yearFromPrevious: false, why: 'fecha imposible' };
    const timed = ld.hh != null;
    return { ...base, kind: 'exact', at: madridIso(year, ld.m, ld.d, ld.hh, ld.mm), dateOnly: !timed, yearFromPrevious: fromPrev, why: null };
  });
}
