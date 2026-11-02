/**
 * Correos al CRM (docs/CRM_DINAMICO.md §47): qué es cada correo que llega a la dirección de una persona.
 * - Reenviado («RV:», «Fwd:», «---------- Forwarded message», «De: … Enviado: …» de Outlook): el del otro lado es el
 *   remitente del correo original (si lo escribió él) o su destinatario (si lo reenvía la persona después de mandarlo).
 * - En copia (CC/CCO) o redirigido por una regla: el del otro lado es el destinatario (si lo manda la persona) o el
 *   remitente (si llega de fuera).
 * Funciones puras: sin red ni base de datos.
 */

const FREE = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.es', 'yahoo.com', 'yahoo.es',
  'icloud.com', 'me.com', 'msn.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.es', 'aol.com', 'telefonica.net']);
export const isFreeDomain = (d: string) => FREE.has(d.toLowerCase());

/** «Laura Gómez <Laura@SalaX.es>» → laura@salax.es (o null). */
export function addressOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(s) ?? /([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(s);
  return m ? m[1]!.toLowerCase().replace(/^mailto:/, '') : null;
}
export const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/** El token de «apuntar-<token>@dominio» entre los destinatarios. */
export function tokenFrom(addresses: string[], domain: string | null): string | null {
  for (const a of addresses) {
    const e = addressOf(a);
    if (!e) continue;
    const m = /^apuntar-([a-z0-9]{24})@(.+)$/.exec(e);
    if (m && (!domain || m[2] === domain.toLowerCase())) return m[1]!;
  }
  return null;
}

const FWD_SUBJECT = /^\s*(fwd?|rv|reenv|tr|wg)\s*:/i;
const FWD_MARKER = /^[ \t>]*(-{3,}\s*(forwarded message|mensaje reenviado|message transféré)\s*-{3,}|begin forwarded message:|inicio del mensaje reenviado:|_{10,})\s*$/im;
const HDR = (names: string) => new RegExp(`^[ \\t>*]*(?:${names})\\s*:\\s*(.+)$`, 'im');
const FROM = HDR('from|de');
const TO = HDR('to|para|à');
const DATE = HDR('date|sent|enviado|fecha|envoyé');
const SUBJ = HDR('subject|asunto|objet');

export interface Original { from: string | null; to: string[]; date: string | null; subject: string | null; body: string }

/** Si el texto es un reenvío, la cabecera y el cuerpo del correo original (lo primero que se reenvía). */
export function forwarded(subject: string, text: string): Original | null {
  const marker = FWD_MARKER.exec(text);
  const isFwd = FWD_SUBJECT.test(subject) || !!marker;
  if (!isFwd) return null;
  // La cabecera del original: desde el marcador (o el primer «De:/From:») hasta la primera línea en blanco tras ella.
  const start = marker ? marker.index + marker[0].length : (FROM.exec(text)?.index ?? -1);
  if (start < 0) return null;
  const rest = text.slice(start).replace(/^\s*\n/, '');
  const lines = rest.split('\n');
  let end = 0;
  for (; end < Math.min(lines.length, 14); end++) {
    if (!lines[end]!.trim()) { if (end > 0) break; continue; }
  }
  const head = lines.slice(0, end).join('\n');
  const from = FROM.exec(head)?.[1] ?? null;
  if (!from) return null;
  const toLine = TO.exec(head)?.[1] ?? '';
  return {
    from: addressOf(from),
    to: toLine.split(/[,;]/).map(addressOf).filter((x): x is string => !!x),
    date: DATE.exec(head)?.[1]?.trim() ?? null,
    subject: SUBJ.exec(head)?.[1]?.trim() ?? null,
    body: lines.slice(end).join('\n'),
  };
}

/** Quita lo citado (respuestas anteriores) y la firma larga: se queda con lo nuevo del correo. */
export function freshText(text: string): string {
  const cut = /^[ \t]*(?:>.*|-{2,}\s*original message\s*-{2,}.*|-{3,}\s*(?:forwarded message|mensaje reenviado)\s*-{3,}|_{10,}|(?:on|el)\s.{4,120}(?:wrote|escribió):\s*|(?:de|from):\s.+\n(?:[ \t]*(?:enviado|sent|fecha|date):\s.+))$/im;
  const m = cut.exec(text);
  const body = (m ? text.slice(0, m.index) : text).replace(/\r/g, '');
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML → texto (por si el correo no trae versión de texto). */
export function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface Incoming { from: string; to: string[]; cc: string[]; subject: string; text: string; date: string }
export interface Reading {
  /** in: lo escribió el del otro lado; out: lo escribió la persona (o alguien de su empresa). */
  direction: 'in' | 'out';
  /** Los del otro lado (sin la persona, su empresa ni la dirección de apuntar), el primero es el principal. */
  counterparts: string[];
  subject: string;
  /** Lo nuevo del correo (sin citas), para la nota. */
  body: string;
  forwarded: boolean;
  /** Fecha del original si se sabe leer; si no, la de llegada. */
  at: string;
}

/**
 * Lee un correo llegado a la dirección de la persona. `own`: sus direcciones; `internal`: dominios de su empresa (lo que
 * va entre compañeros no es del cliente); `inbox`: el dominio de las direcciones de apuntar.
 */
export function readEmail(e: Incoming, o: { own: string[]; internal: string[]; inbox: string | null }): Reading {
  const own = new Set(o.own.map((x) => x.toLowerCase()));
  const internal = new Set(o.internal.map((x) => x.toLowerCase()).filter((d) => d && !isFreeDomain(d)));
  const ours = (a: string) => own.has(a) || internal.has(domainOf(a)) || (!!o.inbox && domainOf(a) === o.inbox.toLowerCase()) || /^apuntar-/.test(a);
  const from = addressOf(e.from) ?? '';
  const fw = forwarded(e.subject, e.text);
  const clean = (s: string | null) => (s ?? '').replace(FWD_SUBJECT, '').replace(/^\s*(re|rv|fwd?)\s*:\s*/i, '').trim();
  if (fw && fw.from) {
    const outgoing = ours(fw.from);
    const others = outgoing ? fw.to.filter((a) => !ours(a)) : [fw.from];
    const parsed = fw.date ? Date.parse(fw.date) : NaN;
    return {
      direction: outgoing ? 'out' : 'in', counterparts: [...new Set(others)], subject: clean(fw.subject ?? e.subject), body: freshText(fw.body), forwarded: true,
      at: Number.isFinite(parsed) && parsed <= Date.parse(e.date) + 60_000 ? new Date(parsed).toISOString() : e.date,
    };
  }
  const outgoing = ours(from);
  const others = outgoing ? [...e.to, ...e.cc].map((a) => addressOf(a)).filter((a): a is string => !!a && !ours(a)) : [from];
  return { direction: outgoing ? 'out' : 'in', counterparts: [...new Set(others)], subject: clean(e.subject), body: freshText(e.text), forwarded: false, at: e.date };
}

/** La nota de la interacción: asunto y lo nuevo del correo, corto. */
export function noteOf(r: Reading, max = 1500): string {
  const body = r.body.length > max ? `${r.body.slice(0, max).trimEnd()}…` : r.body;
  return [r.subject ? `«${r.subject}»` : '', body].filter(Boolean).join('\n\n').slice(0, 4000);
}
