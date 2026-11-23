/**
 * Importar con tu IA (docs/IMPORTAR_IA.md): la IA de la persona (conectada por MCP) manda sus empresas por tandas a un
 * área de espera; nada entra en el CRM hasta que una persona lo revisa y pulsa «Aplicar» en la app.
 * Lógica pura (con pruebas): validar cada empresa, decir fila a fila qué está bien y qué no (para que la IA lo corrija
 * y lo reenvíe), juntar por referencia (reenviar no duplica) y preparar el CSV de la importación de siempre.
 *
 * Lo que se protege:
 *  · duplicados: referencia propia de cada empresa (reenviar = actualizar) y, al aplicar, nombre + ciudad como siempre;
 *  · inventos: cada empresa trae el texto de donde sale, guardado tal cual (se ve al revisar);
 *  · fechas: las interacciones, solo con fecha explícita y no futura; sin fecha, van como dato, no como conversación;
 *  · lo que no existe en el CRM (tipos, preguntas): se dice en la respuesta y no se guarda.
 */
import { CHANNELS, type Channel } from './followup';

export const MAX_BATCH = 25;
export const MAX_ROWS = 2000;

export interface AiPerson { name: string; role: string | null; phone: string | null; email: string | null }
export interface AiInteraction { date: string; channel: Channel; note: string }
export interface AiRow {
  ref: string;
  name: string;
  kind: string | null;
  city: string | null;
  address: string | null;
  phone: string | null; email: string | null; website: string | null; instagram: string | null; linkedin: string | null;
  people: AiPerson[];
  facts: string[];
  interactions: AiInteraction[];
  next: { what: string; date: string | null } | null;
  qualification: Record<string, string>;
  /** El texto original del que sale (tal cual, para revisar que no se ha inventado nada). */
  source: string;
  /** Avisos de esta fila (lo que no se ha guardado y por qué). */
  problems: string[];
  receivedAt: string;
}
export interface AiImportData {
  label: string;
  rows: AiRow[];
  startedAt: string;
  /** La IA dice que ha terminado (lista para revisar). */
  finishedAt: string | null;
  /** Tras aplicar: qué empresa salió de cada referencia. */
  applied?: Record<string, string>;
}

export interface RowCtx {
  /** Tipos del espacio: clave y nombre (se acepta cualquiera de los dos). */
  kinds: Array<{ key: string; label: string; plural?: string }>;
  /** ¿Vale esta respuesta de cualificación? (la del paquete del espacio; sin paquete, ninguna). */
  validQual: (key: string, value: string) => boolean;
  /** Hoy (AAAA-MM-DD), para no aceptar conversaciones en el futuro. */
  today: string;
}

const line = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (v: unknown, n: number) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const opt = (v: unknown, n: number) => line(v, n) || null;
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Un día que existe (2026-02-30 no). */
export const realDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
/** La referencia de una empresa: la que diga la IA o, si no, su nombre y ciudad (así reenviarla no la duplica). */
export const refOf = (ref: unknown, name: string, city: string | null) => (line(ref, 120) || fold(`${name} ${city ?? ''}`)).slice(0, 120);

/** Una empresa de la IA → la fila que se guarda, con sus avisos. Sin nombre: null (y el motivo). */
export function cleanRow(raw: unknown, ctx: RowCtx, now = new Date()): { row: AiRow | null; error: string | null } {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const name = line(r.nombre ?? r.name, 160);
  if (name.length < 2) return { row: null, error: 'Falta el nombre de la empresa' };
  const problems: string[] = [];
  const city = opt(r.ciudad ?? r.city, 120);
  // Tipo: su clave o su nombre (singular o plural); si no existe, va al principal y se avisa.
  let kind: string | null = null;
  const k = line(r.tipo ?? r.kind, 60);
  if (k) {
    const f = fold(k);
    kind = ctx.kinds.find((d) => d.key === k || fold(d.label) === f || (d.plural && fold(d.plural) === f))?.key ?? null;
    if (!kind) problems.push(`Tipo «${k}» no existe: va a «${ctx.kinds[0]?.label ?? 'el principal'}» (tipos: ${ctx.kinds.map((d) => d.label).join(', ')})`);
  }
  const email = line(r.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`Email «${email}» no válido: no se guarda`);
  const phone = line(r.telefono ?? r.phone, 40);
  if (phone && phone.replace(/\D/g, '').length < 6) problems.push(`Teléfono «${phone}» no parece un teléfono: no se guarda`);
  const people: AiPerson[] = (Array.isArray(r.personas ?? r.people) ? (r.personas ?? r.people) as unknown[] : []).slice(0, 20).flatMap((p) => {
    const x = (p && typeof p === 'object' ? p : { nombre: p }) as Record<string, unknown>;
    const n = line(x.nombre ?? x.name, 160);
    if (n.length < 2) return [];
    const pe = line(x.email, 200).toLowerCase();
    return [{ name: n, role: opt(x.papel ?? x.role, 80), phone: opt(x.telefono ?? x.phone, 40), email: pe && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe) ? pe : null }];
  });
  const facts = (Array.isArray(r.datos ?? r.facts) ? (r.datos ?? r.facts) as unknown[] : []).map((f) => line(f, 600)).filter(Boolean).slice(0, 40);
  // Interacciones: fecha explícita (AAAA-MM-DD) y no futura. Sin fecha, la nota va como dato (no se inventa el día).
  const interactions: AiInteraction[] = [];
  for (const it of (Array.isArray(r.interacciones ?? r.interactions) ? (r.interacciones ?? r.interactions) as unknown[] : []).slice(0, 100)) {
    const x = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const note = text(x.nota ?? x.note, 4000);
    if (!note) continue;
    const date = line(x.fecha ?? x.date, 10);
    const ch = line(x.canal ?? x.channel, 20);
    const channel = ((CHANNELS as readonly string[]).includes(ch) ? ch : 'other') as Channel;
    if (!realDay(date)) { facts.push(`Sin fecha: ${note.slice(0, 560)}`); problems.push('Una interacción sin fecha exacta va como dato (no se inventa el día)'); continue; }
    if (date > ctx.today) { facts.push(`(${date}) ${note.slice(0, 560)}`); problems.push(`Interacción con fecha futura (${date}): va como dato. ¿Era un próximo paso?`); continue; }
    interactions.push({ date, channel, note });
  }
  const nx = (r.proximo_paso ?? r.next_step) as Record<string, unknown> | string | null | undefined;
  let next: AiRow['next'] = null;
  if (nx) {
    const what = typeof nx === 'string' ? line(nx, 300) : line(nx.que ?? nx.what, 300);
    const d = typeof nx === 'string' ? '' : line(nx.fecha ?? nx.date, 10);
    if (what) next = { what, date: realDay(d) ? d : null };
    if (d && !realDay(d)) problems.push(`Fecha del próximo paso «${d}» no vale (AAAA-MM-DD): queda sin fecha`);
  }
  const qualification: Record<string, string> = {};
  const rq = (r.cualificacion ?? r.qualification) as Record<string, unknown> | undefined;
  for (const [qk, qv] of Object.entries(rq && typeof rq === 'object' ? rq : {})) {
    const vals = String(qv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const ok = vals.filter((v) => ctx.validQual(qk, v));
    if (ok.length) qualification[qk] = ok.join(',');
    if (ok.length < vals.length) problems.push(`Cualificación «${qk}: ${vals.filter((v) => !ok.includes(v)).join(', ')}» no vale: no se guarda`);
  }
  const source = text(r.texto_origen ?? r.source, 6000);
  if (!source) problems.push('Sin texto de origen: al revisar no se podrá comprobar de dónde sale');
  const url = (v: unknown) => { const s = line(v, 300); return s && /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(s) ? s : s ? (problems.push(`Enlace «${s}» no válido: no se guarda`), null) : null; };
  const ig = line(r.instagram, 300);
  return {
    error: null,
    row: {
      ref: refOf(r.ref ?? r.referencia, name, city), name, kind, city, address: opt(r.direccion ?? r.address, 300),
      phone: phone && phone.replace(/\D/g, '').length >= 6 ? phone : null,
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      website: url(r.web ?? r.website), instagram: ig ? (/^@?[\w.]{2,30}$/.test(ig) ? ig : url(ig)) : null, linkedin: url(r.linkedin),
      people, facts, interactions, next, qualification, source, problems, receivedAt: now.toISOString(),
    },
  };
}

/** Juntar una tanda con lo que ya había: misma referencia = se actualiza (reenviar corrige, no duplica). */
export function mergeRows(had: AiRow[], incoming: AiRow[]): { rows: AiRow[]; added: number; updated: number } {
  const byRef = new Map(had.map((r, i) => [r.ref, i]));
  const rows = [...had];
  let added = 0, updated = 0;
  for (const r of incoming) {
    const i = byRef.get(r.ref);
    if (i === undefined) { byRef.set(r.ref, rows.length); rows.push(r); added++; } else { rows[i] = r; updated++; }
  }
  return { rows, added, updated };
}

/** La referencia en el CRM (para encontrarla al aplicar y para que otra importación no la duplique). */
export const crmRef = (ref: string) => `ia:${ref}`.slice(0, 200);

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Las columnas de la importación de siempre (empresas): datos de serie; lo demás va después, empresa a empresa. */
export const AI_HEADERS = ['Empresa', 'Referencia', 'Ciudad', 'Dirección', 'Teléfono', 'Email', 'Web', 'Instagram', 'LinkedIn', 'Notas'] as const;
export const AI_COLUMNS = { Empresa: 'name', Referencia: 'externalRef', Ciudad: 'city', Dirección: 'address', Teléfono: 'phone', Email: 'email', Web: 'website', Instagram: 'instagram', LinkedIn: 'linkedin', Notas: 'notes' } as const;
/**
 * `notesFor`: a qué referencias se les ponen los datos en Notas (las que ya están en el CRM: así «Deshacer» las deja como
 * estaban). A las nuevas, los datos van a «Lo que sabemos» al aplicar. Sin decirlo, a todas (vista previa).
 */
export function csvOf(rows: AiRow[], notesFor?: Set<string>): string {
  const body = rows.map((r) => [r.name, crmRef(r.ref), r.city ?? '', r.address ?? '', r.phone ?? '', r.email ?? '', r.website ?? '', r.instagram ?? '', r.linkedin ?? '', !notesFor || notesFor.has(r.ref) ? r.facts.join('\n') : '']);
  return [AI_HEADERS as readonly string[], ...body].map((r) => r.map((c) => csvCell(String(c))).join(',')).join('\n');
}

/** El resumen para la IA y para la pantalla. */
export function summary(rows: AiRow[], dupes: Set<string>) {
  return {
    total: rows.length,
    duplicates: rows.filter((r) => dupes.has(r.ref)).length,
    withProblems: rows.filter((r) => r.problems.length).length,
    interactions: rows.reduce((n, r) => n + r.interactions.length, 0),
    people: rows.reduce((n, r) => n + r.people.length, 0),
  };
}
