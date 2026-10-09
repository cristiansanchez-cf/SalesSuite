/**
 * Importar un CSV al CRM (docs/CRM_DINAMICO.md §Importar): una sola lógica, pura y probada, para demo y Supabase.
 *
 *   readCsv → suggestMapping (qué es cada columna, qué tipo, cómo se unifican los valores) → buildPlan (qué se crea,
 *   qué se fusiona, qué va a notas) → el servicio lo ejecuta y guarda lo necesario para deshacer.
 *
 * Nada se pierde: un valor que no encaja en su campo se queda en las notas con el nombre de su columna.
 */
import { parseCsv } from '../accounts/service';
import { parseValue, slugKey, type CrmField, type FieldOption, type FieldType, type FieldValues } from './fields';
import { ACCOUNT_CORE, CONTACT_CORE, type ColumnMap, type CoreKey, type ImportMapping, type ImportStats } from './types';

export type ImportTarget = 'account' | 'contact';
export const MAX_ROWS = 5000;

export const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** CSV → cabeceras y filas del mismo ancho (quita el BOM de Notion/Excel y las columnas sin cabecera ni datos). */
export function readCsv(text: string): { headers: string[]; rows: string[][] } {
  const all = parseCsv(text.replace(/^﻿/, ''));
  if (!all.length) return { headers: [], rows: [] };
  const width = Math.max(...all.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => all[0][i]?.trim() || `Columna ${i + 1}`);
  const rows = all.slice(1, MAX_ROWS + 1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return { headers, rows };
}

/** «🆕 Sin contactar» → «Sin contactar». */
export const cleanLabel = (s: string) => s.replace(/^[\p{Extended_Pictographic}\p{S}️‍\s]+/u, '').replace(/[️‍]/g, '').trim();
/** Variantes de lo mismo: «DJ/AV», «DJ+AV» y «DJ / AV» → «DJ + AV». */
export function canonicalOption(s: string): string {
  const c = cleanLabel(s);
  const parts = c.split(/\s*(?:\/|\+|&|\by\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(' + ') : c;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
/** «March 5, 2026», «5 de marzo de 2026», «05/03/2026» (día primero) o ISO con hora → «2026-03-05». */
export function toIsoDate(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return +m[2] <= 12 && +m[1] <= 31 ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
  m = norm(v).match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(+m[2])}`;
  m = norm(v).match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?\s+(?:de\s+)?(\d{4})/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(+m[1])}`;
  return null;
}
/** «€1,200.00», «1.200 €», «95 %» → número en texto. */
export function toNumber(s: string): string | null {
  let v = s.replace(/[€$£%\s]/g, '').replace(/^EUR|EUR$/i, '');
  if (!v) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, '');           // 1,200.50
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); // 1.200,50
  else v = v.replace(',', '.');
  return Number.isFinite(Number(v)) ? v : null;
}
const YES = new Set(['yes', 'si', 'true', '1', 'x', '✓', '✔', 'checked', 'verdadero']);
const NO = new Set(['no', 'false', '0', '', 'unchecked', 'falso']);

/** Un valor del CSV, listo para `parseValue` de su campo. */
export function rawFor(type: FieldType, s: string): string | string[] {
  const v = s.trim();
  switch (type) {
    case 'checkbox': return YES.has(norm(v)) ? 'true' : '';
    case 'date': return v ? toIsoDate(v) ?? v : '';
    case 'number': case 'money': case 'rating': return v ? toNumber(v) ?? v : '';
    case 'url': return /^@?[\w.]+$/.test(v) && !v.includes('.') ? `https://instagram.com/${v.replace(/^@/, '')}` : v;
    default: return v;
  }
}

// ------------------------------------------------------------------ sugerencias por columna

const CORE_NAMES: Record<CoreKey, string[]> = {
  name: ['name', 'nombre', 'razon social', 'nombre comercial', 'full name', 'nombre completo', 'contacto'],
  company: ['empresa', 'empresa/local', 'company', 'local', 'club', 'organizacion', 'organization', 'negocio', 'sala'],
  role: ['rol', 'cargo', 'puesto', 'role', 'position', 'title', 'job title'],
  city: ['ciudad', 'city', 'localidad', 'municipio', 'poblacion', 'provincia'],
  email: ['email', 'e-mail', 'correo', 'mail', 'correo electronico'],
  phone: ['telefono', 'phone', 'movil', 'tlf', 'tel', 'whatsapp', 'celular'],
  instagram: ['instagram', 'instagram url', 'url instagram', 'ig', 'instagram (@)'],
  linkedin: ['linkedin', 'linkedin url', 'url linkedin'],
  notes: ['notas', 'notes', 'notas internas', 'comentarios', 'observaciones'],
  owner: ['responsable', 'owner', 'comercial', 'asignado', 'asignada', 'assigned to', 'vendedor'],
  address: ['direccion', 'address', 'domicilio'],
  externalRef: ['id', 'referencia', 'ref', 'external id', 'codigo'],
  group: ['grupo', 'group', 'grupo empresarial', 'cadena'],
  website: ['web', 'website', 'web oficial', 'sitio web', 'pagina web', 'url web', 'url'],
};
const STAGE = /^(status|estado|etapa|stage|fase|pipeline)\b/;
/** Cabeceras que suelen ser una lista de opciones aunque haya pocas filas. */
const SELECT_HINT = /\b(tipo|type|categoria|category|accion|segmento|sector|prioridad|priority|perfil|origen|source|canal)\b/;

export interface ColumnProfile {
  header: string;
  filled: number;
  /** Valores distintos (limpios) con cuántas veces salen, de más a menos. Solo si son pocos. */
  values: Array<{ value: string; count: number }>;
  distinct: number;
  samples: string[];
  suggestion: ColumnMap;
}

function guessType(header: string, vals: string[], distinct: number): { type: FieldType; isStage?: boolean } {
  const h = norm(header);
  const all = (re: RegExp) => vals.length > 0 && vals.every((v) => re.test(v.trim()));
  if (STAGE.test(h) && distinct <= 30) return { type: 'select', isStage: true };
  // La cabecera manda en email, teléfono y enlaces: lo que no encaje irá a notas con su columna.
  if (/^(e-?mail|correo)\b/.test(h) || all(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return { type: 'email' };
  if (/\b(telefono|phone|movil|whatsapp)\b/.test(h)) return { type: 'phone' };
  if (/\b(url|web|website|enlace|link|instagram|linkedin|tiktok|facebook)\b/.test(h)) return { type: 'url' };
  if (all(/^(https?:\/\/|www\.)\S+$/i)) return { type: 'url' };
  if (vals.every((v) => YES.has(norm(v)) || NO.has(norm(v)))) return { type: 'checkbox' };
  if (vals.every((v) => toIsoDate(v))) return { type: 'date' };
  if (vals.every((v) => toNumber(v) !== null)) return { type: vals.some((v) => /[€$£]|EUR/.test(v)) || /precio|importe|presupuesto|€/.test(h) ? 'money' : 'number' };
  if (all(/^[+\d][\d\s().-]{5,24}$/)) return { type: 'phone' };
  const avg = vals.reduce((n, v) => n + v.length, 0) / Math.max(1, vals.length);
  const canon = new Set(vals.map((v) => norm(canonicalOption(v)))).size;
  const hinted = SELECT_HINT.test(h) && canon <= 30;
  if (avg < 40 && (hinted || (canon <= 15 && vals.length >= 5 && canon < vals.length / 2))) {
    return { type: vals.some((v) => /,\s*\S/.test(v)) && distinct > 3 ? 'multi_select' : 'select' };
  }
  return { type: avg > 80 ? 'long_text' : 'text' };
}

/** Qué es cada columna: un dato de serie, un campo que ya existe o un campo nuevo (con su tipo adivinado). */
export function profileColumns(headers: string[], rows: string[][], target: ImportTarget, fields: CrmField[]): ColumnProfile[] {
  const core: readonly CoreKey[] = target === 'account' ? ACCOUNT_CORE : CONTACT_CORE;
  const taken = new Set<string>();
  const active = fields.filter((f) => !f.archivedAt && f.target === target);
  return headers.map((header, i) => {
    const raw = rows.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    const counts = new Map<string, number>();
    for (const v of raw) counts.set(cleanLabel(v), (counts.get(cleanLabel(v)) ?? 0) + 1);
    const values = [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
    const h = norm(header);
    let suggestion: ColumnMap;
    const coreKey = core.find((k) => !taken.has(k) && (CORE_NAMES[k].includes(h) || CORE_NAMES[k].includes(h.replace(/\s*\(.*\)$/, ''))));
    const field = active.find((f) => f.key === slugKey(header) || norm(f.label) === h);
    if (!raw.length) suggestion = { to: 'ignore' };
    else if (coreKey) { suggestion = { to: 'core', key: coreKey }; taken.add(coreKey); }
    else if (field) suggestion = { to: 'field', key: field.key };
    else suggestion = { to: 'new', label: header.slice(0, 60), ...guessType(header, raw, counts.size) };
    return { header, filled: raw.length, values: values.length <= 40 ? values : [], distinct: counts.size, samples: values.slice(0, 3).map((v) => v.value), suggestion };
  });
}

/** Mapeo inicial: columnas sugeridas y, en las de opciones, cada valor del CSV a su opción unificada. */
export function suggestMapping(profiles: ColumnProfile[], fields: CrmField[]): ImportMapping {
  const columns: Record<string, ColumnMap> = {};
  const values: Record<string, Record<string, string>> = {};
  for (const p of profiles) {
    columns[p.header] = p.suggestion;
    const opts = optionTarget(p.suggestion, fields);
    if (opts === 'new') {
      const firstSeen = new Map<string, string>();
      for (const { value } of p.values) { const c = canonicalOption(value); const k = norm(c); if (!firstSeen.has(k)) firstSeen.set(k, c); }
      values[p.header] = Object.fromEntries(p.values.map(({ value }) => [value, firstSeen.get(norm(canonicalOption(value))) ?? value]));
    } else if (opts) {
      values[p.header] = Object.fromEntries(p.values.map(({ value }) => {
        const o = opts.find((x) => norm(x.label) === norm(canonicalOption(value)) || x.key === slugKey(value));
        return [value, o?.label ?? canonicalOption(value)];
      }));
    }
  }
  return { columns, values, tag: null, segmentId: null };
}
/** ¿La columna va a un campo de opciones? 'new' si se crea; las opciones si ya existe. */
function optionTarget(m: ColumnMap, fields: CrmField[]): FieldOption[] | 'new' | null {
  if (m.to === 'new') return m.type === 'select' || m.type === 'multi_select' ? 'new' : null;
  if (m.to === 'field') { const f = fields.find((x) => x.key === m.key); return f && (f.type === 'select' || f.type === 'multi_select') ? f.options : null; }
  return null;
}

// ------------------------------------------------------------------ plan

export interface PlanContext {
  target: ImportTarget;
  fields: CrmField[];
  accounts: Array<{ id: string; name: string; city: string | null; parentId: string | null; notes: string | null; fields: FieldValues; tags: string[] }>;
  contacts: Array<{ id: string; name: string; email: string | null; linkedin: string | null; companies: string[] }>;
  members: Array<{ userId: string; name: string; email: string }>;
}
export interface NewField { header: string; key: string; label: string; type: FieldType; options: FieldOption[]; isStage: boolean }
export interface PlannedAccount {
  ref: string; name: string; city: string | null; address: string | null; externalRef: string | null; notes: string | null; ownerId: string | null;
  fields: FieldValues; group: string | null; existingId: string | null; isGroup: boolean; rows: number[];
  /** Contacto de la empresa (solo al importar empresas). */
  contact?: { phone?: string | null; email?: string | null; instagram?: string | null; linkedin?: string | null; website?: string | null };
}
export interface PlannedContact {
  ref: string; name: string; email: string | null; phone: string | null; instagram: string | null; linkedin: string | null; city: string | null;
  notes: string | null; ownerId: string | null; fields: FieldValues; existingId: string | null; companies: Array<{ ref: string; role: string | null }>; rows: number[];
}
export interface ImportIssue { row: number; column: string; value: string; error: string }
export interface ImportPlan {
  newFields: NewField[];
  /** Campos que ya existían y ganan opciones. */
  fieldOptions: Array<{ id: string; key: string; options: FieldOption[] }>;
  accounts: PlannedAccount[];
  contacts: PlannedContact[];
  /** Ciudades distintas (para buscar o crear su zona). */
  cities: string[];
  issues: ImportIssue[];
  /** Empresas de la columna «empresa» que no lo son («CEO», «DJ»…): la persona queda sin empresa. */
  junkCompanies: string[];
  stats: ImportStats;
}

/** Valores de «empresa» que en realidad son un cargo o están vacíos de sentido. */
const JUNK = new Set(['ceo', 'dj', 'director', 'directora', 'founder', 'cofounder', 'co-founder', 'fundador', 'fundadora', 'owner', 'manager', 'gerente',
  'promotor', 'promotora', 'artista', 'artist', 'freelance', 'autonomo', 'autonoma', 'n/a', 'na', 'none', 'ninguna', 'ninguno', 'sin empresa', 'independiente',
  'productor', 'productora', 'producer', 'socio', 'socia', 'partner', 'cmo', 'coo', 'cto', 'resident dj', 'dj residente', 'propietario', 'propietaria']);
export function isJunkCompany(v: string, personName: string): boolean {
  const n = norm(v).replace(/[.\s]+$/, '');
  return !n || JUNK.has(n) || !/[a-z0-9]/.test(n) || n === norm(personName);
}
/** «Cristian Alberto Sánchez Salido» ↔ miembro «Cristian Sánchez»: todas las palabras de uno están en el otro. */
export function matchMember(v: string, members: PlanContext['members']): string | null {
  const n = norm(v);
  if (!n) return null;
  const words = (s: string) => norm(s).split(/[^a-z0-9@.]+/).filter(Boolean);
  const vw = new Set(words(v));
  const hit = members.find((m) => norm(m.email) === n)
    ?? members.find((m) => norm(m.name) === n)
    ?? members.filter((m) => { const mw = words(m.name); return mw.length >= 2 && mw.every((w) => vw.has(w)); }).at(0)
    ?? members.filter((m) => { const mw = new Set(words(m.name)); const w = [...vw]; return w.length >= 2 && w.every((x) => mw.has(x)); }).at(0)
    // Un miembro con un solo nombre («Cristian») vale si es el único que empieza así.
    ?? (() => { const first = words(v)[0]; const hits = members.filter((m) => { const mw = words(m.name); return mw.length === 1 && mw[0] === first; }); return hits.length === 1 ? hits[0] : undefined; })();
  return hit?.userId ?? null;
}
/** Particulas que van en minúscula dentro de un nombre («Sala de la Luz»). */
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'da', 'do', 'dos', 'van', 'von', 'di', 'and', 'of', 'the']);
/**
 * Mayúsculas uniformes: solo toca lo que viene TODO en mayúsculas o TODO en minúsculas («LA RÍTMICA CLUB» → «La Rítmica
 * Club», «aaron ruiz» → «Aaron Ruiz»). Lo que ya viene mezclado se respeta («DJ Mikel», «McDonald's»). En mayúsculas,
 * las siglas sin vocales se quedan («BCN», «DJ»).
 */
export function niceCase(s: string): string {
  const v = s.replace(/\s+/g, ' ').trim();
  const letters = v.replace(/[^\p{L}]/gu, '');
  if (!letters) return v;
  const upper = letters === letters.toUpperCase();
  const lower = letters === letters.toLowerCase();
  if (!upper && !lower) return v;
  return v.split(' ').map((w, i) => {
    const l = w.toLowerCase();
    if (i > 0 && SMALL.has(l)) return l;
    if (upper && w.length <= 4 && !/[AEIOUÁÉÍÓÚÜ]/i.test(w) && /\p{L}/u.test(w)) return w; // siglas
    return l.replace(/(^|[-'’(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  }).join(' ');
}
/** Primera letra en mayúscula (papeles: «owner» → «Owner»). */
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Límites de las columnas de serie (lo que no cabe va a notas, nunca rompe la importación). */
export const CORE_MAX = { website: 300, name: 160, city: 80, role: 80, email: 200, phone: 40, instagram: 300, linkedin: 300, address: 300, externalRef: 120, company: 160, group: 160 } as const;
const cleanUrl = (s: string) => s.trim().split(/\s+/)[0]?.replace(/[)\],;]+$/, '') ?? '';
const appendNote = (prev: string | null, line: string) => (prev ? (prev.includes(line) ? prev : `${prev}\n${line}`) : line).slice(0, 4000);

export function buildPlan(headers: string[], rows: string[][], mapping: ImportMapping, ctx: PlanContext): ImportPlan {
  const stats: ImportStats = { rows: rows.length, duplicates: 0, accountsCreated: 0, accountsMerged: 0, contactsCreated: 0, contactsMerged: 0,
    links: 0, fieldsCreated: 0, zonesCreated: 0, noCompany: 0, toNotes: 0, unknownOwners: [] };
  const issues: ImportIssue[] = [];
  const junk = new Set<string>();

  // Campos nuevos: clave única frente a los que ya hay; las opciones salen de los valores unificados.
  const keys = new Set(ctx.fields.map((f) => f.key));
  const newFields: NewField[] = [];
  const fieldOptions: ImportPlan['fieldOptions'] = [];
  const colField = new Map<string, CrmField>();
  for (const h of headers) {
    const m = mapping.columns[h];
    if (m?.to === 'field') {
      const f = ctx.fields.find((x) => x.key === m.key && x.target === ctx.target);
      if (!f) continue;
      const g = withMappedOptions(f, { ...Object.fromEntries((mapping.options?.[h] ?? []).map((l) => [l, l])), ...mapping.values[h] });
      colField.set(h, g);
      if (g.options.length > f.options.length) fieldOptions.push({ id: f.id, key: f.key, options: g.options });
    }
    if (m?.to !== 'new') continue;
    let key = slugKey(m.label);
    for (let i = 2; keys.has(key); i++) key = `${slugKey(m.label)}-${i}`;
    keys.add(key);
    const labels = [...new Set([...(mapping.options?.[h] ?? []), ...Object.values(mapping.values[h] ?? {})].map((x) => x.trim()).filter(Boolean))];
    const isOpt = m.type === 'select' || m.type === 'multi_select';
    const options = isOpt ? optionsFrom(m.type === 'multi_select' ? labels.flatMap((l) => l.split(/\s*,\s*/)) : labels) : [];
    const nf: NewField = { header: h, key, label: m.label, type: isOpt && !options.length ? 'text' : m.type, options, isStage: !!m.isStage && m.type === 'select' };
    newFields.push(nf);
    colField.set(h, { id: '', tenantId: '', key, label: nf.label, type: nf.type, options, group: null, position: 0, help: null, required: false, inList: false,
      filterable: false, segments: [], archivedAt: null, target: ctx.target, tags: [], isStage: nf.isStage });
  }
  stats.fieldsCreated = newFields.length;

  const col = (k: CoreKey) => headers.findIndex((h) => { const m = mapping.columns[h]; return m?.to === 'core' && m.key === k; });
  const at = (r: string[], k: CoreKey) => { const i = col(k); return i < 0 ? '' : (r[i] ?? '').trim(); };

  // Índices de lo que ya hay.
  const accByName = new Map<string, PlanContext['accounts']>();
  for (const a of ctx.accounts) accByName.set(norm(a.name), [...(accByName.get(norm(a.name)) ?? []), a]);
  const existingAccount = (name: string, city: string | null) => {
    const list = accByName.get(norm(name)) ?? [];
    return list.find((a) => city && norm(a.city) === norm(city)) ?? list.find((a) => !city || !a.city) ?? null;
  };
  const conByKey = new Map<string, string>();
  for (const c of ctx.contacts) {
    if (c.email) conByKey.set(`e:${norm(c.email)}`, c.id);
    if (c.linkedin) conByKey.set(`l:${norm(c.linkedin)}`, c.id);
    for (const co of c.companies.length ? c.companies : ['']) conByKey.set(`n:${norm(c.name)}|${norm(co)}`, c.id);
  }

  const accounts = new Map<string, PlannedAccount>();
  const contacts = new Map<string, PlannedContact>();
  const contactKey = new Map<string, string>();
  const unknownOwners = new Set<string>();
  const cities = new Set<string>();
  const seen = new Set<string>();

  const owner = (v: string) => {
    if (!v) return null;
    const id = matchMember(v, ctx.members);
    if (!id) unknownOwners.add(v);
    return id;
  };
  /** Empresa por nombre (+ ciudad en una importación de empresas); se crea en el plan o apunta a una existente. */
  const companyRef = (name: string, city: string | null, row: number, byCity: boolean): PlannedAccount => {
    const ref = `${norm(name)}|${byCity ? norm(city) : ''}`;
    let a = accounts.get(ref);
    if (!a) {
      const ex = existingAccount(name, city);
      a = { ref, name: name.slice(0, 160), city, address: null, externalRef: null, notes: null, ownerId: null, fields: {}, group: null, existingId: ex?.id ?? null, isGroup: false, rows: [] };
      accounts.set(ref, a);
    }
    if (!a.city && city) a.city = city;
    if (!a.rows.includes(row)) a.rows.push(row);
    return a;
  };

  rows.forEach((r, i) => {
    const row = i + 2; // como en la hoja: la 1 es la cabecera
    const sig = JSON.stringify(r.map((x) => x.trim()));
    if (seen.has(sig)) { stats.duplicates++; return; }
    seen.add(sig);
    // Lo que no cabe en su columna va a notas con su nombre de columna (nunca rompe la importación).
    let notes: string | null = at(r, 'notes') || null;
    const fit = (k: keyof typeof CORE_MAX, v: string): string => {
      if (v.length <= CORE_MAX[k]) return v;
      notes = appendNote(notes, `${headers[col(k as CoreKey)] ?? k}: ${v}`);
      issues.push({ row, column: headers[col(k as CoreKey)] ?? k, value: v.slice(0, 80), error: `Demasiado largo (máx. ${CORE_MAX[k]})` });
      stats.toNotes++;
      return '';
    };
    const name = niceCase(fit('name', at(r, 'name')));
    if (!name) { issues.push({ row, column: '', value: '', error: 'Sin nombre: fila omitida' }); return; }
    const city = niceCase(fit('city', at(r, 'city'))) || null;
    if (city) cities.add(city);

    // Campos y notas.
    const values: FieldValues = {};

    headers.forEach((h, ci) => {
      const f = colField.get(h);
      const v = (r[ci] ?? '').trim();
      if (!f || !v) return;
      const mapped = mapping.values[h]?.[cleanLabel(v)] ?? (f.type === 'select' || f.type === 'multi_select' ? canonicalOption(v) : v);
      const res = parseValue(f, rawFor(f.type, f.type === 'multi_select' ? v.split(/\s*,\s*/).map((x) => mapping.values[h]?.[cleanLabel(x)] ?? canonicalOption(x)).join(', ') : mapped));
      if (res.ok && res.value !== null && !(f.type === 'checkbox' && res.value === false)) values[f.key] = res.value;
      else if (!res.ok) { notes = appendNote(notes, `${h}: ${v}`); issues.push({ row, column: h, value: v, error: res.error }); stats.toNotes++; }
    });
    const ownerId = owner(at(r, 'owner'));

    if (ctx.target === 'account') {
      const a = companyRef(name, city, row, true);
      a.address ||= fit('address', at(r, 'address')) || null;
      a.externalRef ||= fit('externalRef', at(r, 'externalRef')) || null;
      a.ownerId ||= ownerId;
      // Contacto de la empresa: lo que no es un email o un enlace válido va a notas con su columna.
      const c = (a.contact ??= {});
      const email = fit('email', at(r, 'email')).toLowerCase();
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) c.email ||= email;
      else if (email) { notes = appendNote(notes, `${headers[col('email')]}: ${email}`); issues.push({ row, column: headers[col('email')], value: email, error: 'Email no válido' }); stats.toNotes++; }
      c.phone ||= fit('phone', at(r, 'phone')) || null;
      const link = (k: 'instagram' | 'linkedin' | 'website') => {
        const raw = cleanUrl(at(r, k));
        if (!raw) return null;
        const v = k === 'instagram' && /^@?[\w.]{2,30}$/.test(raw) ? `https://www.instagram.com/${raw.replace(/^@/, '')}/` : /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(raw) ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : '';
        if (!v) { notes = appendNote(notes, `${headers[col(k)]}: ${raw}`); return null; }
        return fit(k, v) || null;
      };
      c.instagram ||= link('instagram');
      c.linkedin ||= link('linkedin');
      c.website ||= link('website');
      if (notes) a.notes = appendNote(a.notes, notes);
      for (const [k, v] of Object.entries(values)) if (a.fields[k] === undefined) a.fields[k] = v;
      const group = niceCase(fit('group', at(r, 'group')));
      if (group && norm(group) !== norm(name)) {
        const g = companyRef(group, null, row, false);
        g.isGroup = true;
        a.group = g.ref;
      }
      return;
    }

    // Personas: la empresa (si lo es) y su papel en ella.
    let company = fit('company', at(r, 'company'));
    let role = capFirst(fit('role', at(r, 'role'))) || null;
    if (company && norm(company) === norm(name)) company = ''; // su propio nombre (artistas): no es una empresa
    if (company && isJunkCompany(company, name)) {
      junk.add(company);
      if (!role) role = capFirst(company.replace(/[.\s]+$/, ''));
      else notes = appendNote(notes, `${headers[col('company')]}: ${company}`);
      company = '';
    }
    company = niceCase(company);
    const email = fit('email', at(r, 'email')).toLowerCase() || null;
    const linkedin = /linkedin\.com\//i.test(at(r, 'linkedin')) ? fit('linkedin', cleanUrl(at(r, 'linkedin'))) || null : null;
    if (at(r, 'linkedin') && !linkedin) notes = appendNote(notes, `${headers[col('linkedin')]}: ${at(r, 'linkedin')}`);
    const insta = at(r, 'instagram') ? fit('instagram', rawFor('url', cleanUrl(at(r, 'instagram'))) as string) || null : null;
    const ks = [email && `e:${norm(email)}`, linkedin && `l:${norm(linkedin)}`, `n:${norm(name)}|${norm(company)}`].filter(Boolean) as string[];
    const ref = ks.map((k) => contactKey.get(k)).find(Boolean);
    let c = ref ? contacts.get(ref) : undefined;
    if (!c) {
      const existingId = ks.map((k) => conByKey.get(k)).find(Boolean) ?? null;
      c = { ref: ks[0], name: name.slice(0, 160), email, phone: null, instagram: null, linkedin, city, notes: null, ownerId, fields: {}, existingId, companies: [], rows: [] };
      contacts.set(c.ref, c);
    }
    for (const k of ks) if (!contactKey.has(k)) contactKey.set(k, c.ref);
    c.rows.push(row);
    c.email ||= email; c.linkedin ||= linkedin; c.city ||= city; c.ownerId ||= ownerId;
    c.phone ||= fit('phone', at(r, 'phone')) || null;
    c.instagram ||= insta;
    if (notes) c.notes = appendNote(c.notes, notes);
    for (const [k, v] of Object.entries(values)) if (c.fields[k] === undefined) c.fields[k] = v;
    if (company) {
      const a = companyRef(company, city, row, false);
      const link = c.companies.find((x) => x.ref === a.ref);
      if (!link) c.companies.push({ ref: a.ref, role });
      else link.role ||= role;
    }
  });

  const accs = [...accounts.values()];
  const cons = [...contacts.values()];
  stats.accountsCreated = accs.filter((a) => !a.existingId).length;
  stats.accountsMerged = accs.filter((a) => a.existingId).length;
  stats.contactsCreated = cons.filter((c) => !c.existingId).length;
  stats.contactsMerged = cons.filter((c) => c.existingId).length;
  stats.links = cons.reduce((n, c) => n + c.companies.length, 0);
  stats.noCompany = ctx.target === 'contact' ? cons.filter((c) => !c.companies.length).length : 0;
  stats.unknownOwners = [...unknownOwners];
  return { newFields, fieldOptions, accounts: accs, contacts: cons, cities: [...cities], issues, junkCompanies: [...junk], stats };
}

function optionsFrom(labels: string[]): FieldOption[] {
  const seen = new Set<string>();
  const out: FieldOption[] = [];
  for (const l of labels.map((x) => x.trim()).filter(Boolean)) {
    if (out.some((o) => norm(o.label) === norm(l))) continue;
    let key = slugKey(l);
    for (let i = 2; seen.has(key); i++) key = `${slugKey(l)}-${i}`;
    seen.add(key);
    out.push({ key, label: l.slice(0, 60) });
    if (out.length >= 60) break;
  }
  return out;
}
/** Un campo de opciones que ya existe gana las opciones nuevas que el mapeo nombra (se guardan al importar). */
export function withMappedOptions(f: CrmField, map: Record<string, string> | undefined): CrmField {
  if (!map || (f.type !== 'select' && f.type !== 'multi_select')) return f;
  const extra = optionsFrom(Object.values(map)).filter((o) => !f.options.some((x) => norm(x.label) === norm(o.label)));
  const used = new Set(f.options.map((o) => o.key));
  return { ...f, options: [...f.options, ...extra.map((o) => { let k = o.key; for (let i = 2; used.has(k); i++) k = `${o.key}-${i}`; used.add(k); return { ...o, key: k }; })] };
}
