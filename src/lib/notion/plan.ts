/**
 * Importar desde Notion (docs/CRM_DINAMICO.md §48): de las filas de una base de Notion a lo que se crea en el CRM.
 * Lógica pura (con pruebas): qué columna va a qué campo, cómo se parte el título en empresa y personas, qué tipo se
 * propone y qué filas se dejan fuera por defecto. Lo que propone se revisa y se cambia en la vista previa.
 */
import type { FieldType } from '../crm/fields';
import type { KindDef } from '../accounts/types';
import type { DocBlock } from './doc';
import type { Entry } from './entries';

/** Una propiedad de una fila: su tipo en Notion y su valor (texto; las fechas, en ISO). */
export interface NotionProp { type: string; text: string | null; start?: string | null; end?: string | null }
/** Lo leído de Notion de cada fila (se guarda en la importación hasta que se importa). */
export interface NotionRow {
  pageId: string; url: string; createdTime: string; lastEditedTime: string;
  props: Record<string, NotionProp>;
  /** El cuerpo (se lee después, página a página). */
  blocks?: DocBlock[]; chars?: number; textHash?: string; counts?: Record<string, number>; entries?: Entry[]; readError?: string | null;
}
/** Lo que se decide en la vista previa. */
export interface NotionChoice { include: boolean; kind: string; name: string; people: string[] }
export interface NotionImportData {
  databaseId: string; dataSourceId: string; title: string;
  rows: NotionRow[]; choices: NotionChoice[];
  /** Columna → a dónde va. */
  columns: Record<string, ColumnTarget>;
  /** Cuándo se leyó y, tras importar, qué empresa salió de cada fila. */
  readAt: string; accountIds?: Array<string | null>;
}
export type ColumnTarget =
  | { to: 'name' } | { to: 'nextStep' } | { to: 'nextStepAt' } | { to: 'ignore' }
  | { to: 'field'; label: string; type: FieldType; options?: string[] };

/**
 * Tipos de Cofundo (los que se añaden al espacio si no están). Perfiles como en Enjoy (§32): a quien se vende (venue),
 * quien trabaja con muchos clientes y es punto de entrada (promoter) y profesionales que colaboran (dj).
 */
export const COFUNDO_KINDS: KindDef[] = [
  { key: 'company', label: 'Startup', plural: 'Startups', icon: 'star', profile: 'venue' },
  { key: 'cliente-desarrollo', label: 'Cliente de desarrollo', plural: 'Clientes de desarrollo', icon: 'briefcase', profile: 'venue' },
  { key: 'inversor', label: 'Inversor o fondo', plural: 'Inversores', icon: 'globe', profile: 'promoter' },
  { key: 'alianza', label: 'Alianza', plural: 'Alianzas', icon: 'heart-handshake', profile: 'promoter' },
  { key: 'asesor', label: 'Asesor', plural: 'Asesores', icon: 'graduation-cap', profile: 'dj' },
  { key: 'ecosistema', label: 'Institucional / ecosistema', plural: 'Ecosistema', icon: 'users', profile: 'promoter' },
];

// Nombres de columna que tienen un sitio propio; el resto, campo del CRM con el mismo nombre (algunos, más claros).
const IS_NEXT = /^pr[oó]ximo paso$/i;
const IS_NEXT_AT = /^fecha (del )?pr[oó]ximo paso$/i;
const RENAME: Record<string, string> = { origen: 'Vehículo', tipo: 'Tipo (Notion)', canal: 'Canal principal' };
/** A dónde va cada columna, según su tipo en Notion. */
export function defaultColumns(rows: NotionRow[]): Record<string, ColumnTarget> {
  const cols = new Map<string, string>();
  for (const r of rows) for (const [k, p] of Object.entries(r.props)) if (!cols.has(k)) cols.set(k, p.type);
  const out: Record<string, ColumnTarget> = {};
  for (const [k, type] of cols) {
    const label = RENAME[k.toLowerCase()] ?? k;
    if (type === 'title') out[k] = { to: 'field', label: 'Nombre en Notion', type: 'text' };
    else if (IS_NEXT.test(k)) out[k] = { to: 'nextStep' };
    else if (IS_NEXT_AT.test(k) && type === 'date') out[k] = { to: 'nextStepAt' };
    else if (type === 'select' || type === 'status') {
      const opts = [...new Set(rows.map((r) => r.props[k]?.text).filter((v): v is string => !!v))];
      out[k] = { to: 'field', label, type: 'select', options: opts };
    } else if (type === 'multi_select') out[k] = { to: 'field', label, type: 'multi_select' };
    else if (type === 'date') out[k] = { to: 'field', label, type: 'date' };
    else if (type === 'number') out[k] = { to: 'field', label, type: 'number' };
    else if (type === 'checkbox') out[k] = { to: 'field', label, type: 'checkbox' };
    else if (type === 'url') out[k] = { to: 'field', label, type: 'url' };
    else if (type === 'email') out[k] = { to: 'field', label, type: 'email' };
    else if (type === 'phone_number') out[k] = { to: 'field', label, type: 'phone' };
    else if (type === 'rich_text') out[k] = { to: 'field', label, type: 'long_text' };
    else out[k] = { to: 'ignore' };
  }
  return out;
}

/** Palabras de nombre de organización: con ellas, un título no es una persona. */
const ORG_WORDS = /\b(capital|ventures?|group|grupo|fondo|fund|club|labs?|studio|estudio|partners|holding|fiesta|festival|agency|agencia|consulting|consultor[ií]a|solutions|tech|digital|media|app|apps|s\.?l\.?|s\.?a\.?|ltd|inc|llc|gmbh|foundation|fundaci[oó]n|asociaci[oó]n|universidad|instituto|ayuntamiento|hub|lab)\b/i;
/**
 * El título → empresa y personas, solo con lo que dice el título:
 * «Persona — Empresa» y «Persona / Empresa» → la empresa y esa persona; «Empresa (Ana · Luis)» → la empresa y ellos;
 * el resto, el título tal cual (si parece el nombre de una persona, también como persona; se revisa en la vista previa).
 */
export function splitTitle(raw: string): { name: string; people: string[] } {
  const t = raw.replace(/^[\p{Extended_Pictographic}\p{S}️‍\s]+/u, '').trim();
  const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(t) ?? /^(.+?)\s+\/\s+(.+)$/.exec(t);
  if (dash) return { name: dash[2].trim(), people: [dash[1].trim()] };
  const paren = /^(.+?)\s*\(([^()]+)\)$/.exec(t);
  if (paren && /[·,]/.test(paren[2])) return { name: paren[1].trim(), people: paren[2].split(/\s*[·,]\s*/).map((x) => x.trim()).filter(Boolean) };
  // ¿Nombre de persona? 2 a 4 palabras, todas con mayúscula inicial y solo letras (con guion o apóstrofo).
  const words = t.split(/\s+/);
  const person = words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{Lu}[\p{L}'’-]+$/u.test(w)) && !ORG_WORDS.test(t);
  return { name: t, people: person ? [t] : [] };
}

/** El tipo que se propone, con las columnas «Tipo» y «Origen» de Notion (se cambia en la vista previa). */
export function defaultKind(tipo: string | null, origen: string | null): string {
  const t = (tipo ?? '').toLowerCase(), o = (origen ?? '').toLowerCase();
  if (t.startsWith('partner') || t.includes('aliad')) return 'alianza';
  if (t.startsWith('asesor')) return 'asesor';
  if (t.startsWith('institucional') || t.includes('ecosistema')) return 'ecosistema';
  if (t.includes('inversor') || t.includes('fondo')) return 'inversor';
  if (o.includes('consultor')) return 'cliente-desarrollo';
  return 'company';
}
/** Fuera por defecto: los clientes de las startups (Enjoy, Oquea), que se llevan en el CRM de cada startup. */
export function defaultInclude(tipo: string | null, origen: string | null): boolean {
  const t = (tipo ?? '').toLowerCase(), o = (origen ?? '').toLowerCase();
  return !(t === 'cliente' && (o.includes('enjoy') || o.includes('oquea')));
}
export function defaultChoice(r: NotionRow): NotionChoice {
  const title = Object.values(r.props).find((p) => p.type === 'title')?.text ?? '';
  const tipo = r.props.Tipo?.text ?? null, origen = r.props.Origen?.text ?? null;
  const { name, people } = splitTitle(title);
  return { include: defaultInclude(tipo, origen), kind: defaultKind(tipo, origen), name: name.slice(0, 160) || 'Sin nombre', people: people.map((p) => p.slice(0, 160)) };
}

/** Los tipos del espacio con los de Cofundo que falten (sin tocar los que ya hay). */
export function withKinds(current: KindDef[], wanted: KindDef[] = COFUNDO_KINDS): KindDef[] {
  const out = [...current];
  const base = out.find((k) => k.key === 'company');
  const wb = wanted.find((k) => k.key === 'company');
  // El principal se renombra solo si sigue con el nombre de serie («Empresa»).
  if (base && wb && base.label === 'Empresa') Object.assign(base, { label: wb.label, plural: wb.plural, icon: wb.icon });
  for (const k of wanted) if (!out.some((x) => x.key === k.key)) out.push(k);
  return out.slice(0, 12);
}

/** El valor de una columna para el CRM (tal cual; las fechas, el día). */
export function cellFor(p: NotionProp | undefined): string {
  if (!p || p.text == null) return '';
  if (p.type === 'date') return (p.start ?? '').slice(0, 10) + (p.end ? ` → ${p.end.slice(0, 10)}` : '');
  return p.text;
}

/** Resumen de las entradas de una fila (para la vista previa). */
export function entryStats(es: Entry[] | undefined) {
  const e = es ?? [];
  return { total: e.length, exact: e.filter((x) => x.kind === 'exact').length, fromPrevious: e.filter((x) => x.yearFromPrevious).length, approx: e.filter((x) => x.kind === 'approx').length, tooLong: e.filter((x) => x.kind === 'exact' && x.note.length > 4000).length };
}
