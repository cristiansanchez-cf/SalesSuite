/**
 * Campos del CRM (docs/CRM_DINAMICO.md): cada espacio define los suyos, como las propiedades de una base de datos de
 * Notion. Aquí, la definición, la validación de los valores (una sola implementación para demo y Supabase) y cómo se
 * enseñan. Los valores viven en `account.fields` (clave → valor).
 */
import { z } from 'zod';

export const FIELD_TYPES = ['text', 'long_text', 'number', 'money', 'checkbox', 'select', 'multi_select', 'date', 'url', 'email', 'phone', 'rating'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const OPTION_TYPES: FieldType[] = ['select', 'multi_select'];

export interface FieldOption { key: string; label: string }
export interface CrmField {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  type: FieldType;
  options: FieldOption[];
  group: string | null;
  position: number;
  help: string | null;
  required: boolean;
  inList: boolean;
  filterable: boolean;
  /** Claves de sector en los que aplica. Vacío = todos. */
  segments: string[];
  archivedAt: string | null;
  /** De qué es el campo: de la empresa o de la persona. */
  target: FieldTarget;
  /** Listas (etiquetas) en las que aplica, p. ej. «fbd». Vacío = todas. */
  tags: string[];
  /** Es la etapa del embudo de su lista (selección): sale como estado y se filtra. */
  isStage: boolean;
}
export type FieldTarget = 'account' | 'contact';
export type FieldValue = string | number | boolean | string[];
export type FieldValues = Record<string, FieldValue>;

/** «Nº de instructores» → «n-de-instructores». */
export const slugKey = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'campo';

const optionsText = z.string().max(4000).transform((t) => {
  const seen = new Set<string>();
  return t.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60).map((label) => {
    let key = slugKey(label);
    for (let i = 2; seen.has(key); i++) key = `${slugKey(label)}-${i}`;
    seen.add(key);
    return { key, label: label.slice(0, 60) };
  });
});

/** Lo que se pide al crear o editar un campo. `options` llega como texto, una opción por línea. */
export const fieldInputSchema = z.object({
  label: z.string().trim().min(1, 'Ponle un nombre').max(60),
  type: z.enum(FIELD_TYPES),
  options: z.union([optionsText, z.array(z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/), label: z.string().trim().min(1).max(60) })).max(60)]).default([]),
  group: z.string().trim().max(40).transform((v) => v || null).nullable().optional(),
  help: z.string().trim().max(200).transform((v) => v || null).nullable().optional(),
  required: z.boolean().default(false),
  inList: z.boolean().default(false),
  filterable: z.boolean().default(false),
  segments: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)).max(20).default([]),
  target: z.enum(['account', 'contact']).default('account'),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/)).max(20).default([]),
  isStage: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (OPTION_TYPES.includes(v.type) && v.options.length === 0) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Añade al menos una opción (una por línea)' });
  if (v.isStage && v.type !== 'select') ctx.addIssue({ code: 'custom', path: ['isStage'], message: 'La etapa tiene que ser una selección' });
});
export type FieldInput = z.infer<typeof fieldInputSchema>;

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Valida y normaliza un valor según su campo (acepta lo que llega de un formulario: textos, «on», listas). */
export function parseValue(f: Pick<CrmField, 'type' | 'options' | 'label'>, raw: unknown): { ok: true; value: FieldValue | null } | { ok: false; error: string } {
  if (f.type === 'checkbox') return { ok: true, value: raw === true || raw === 'on' || raw === 'true' || raw === '1' || raw === 'sí' || raw === 'si' };
  if (empty(raw)) return { ok: true, value: null };
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  const bad = (what: string) => ({ ok: false as const, error: `${f.label}: ${what}` });
  switch (f.type) {
    case 'text': return s.length <= 500 ? { ok: true, value: s } : bad('máximo 500 caracteres');
    case 'long_text': return s.length <= 4000 ? { ok: true, value: s } : bad('máximo 4000 caracteres');
    case 'phone': return /^[+\d][\d\s().-]{5,24}$/.test(s) ? { ok: true, value: s } : bad('teléfono no válido');
    case 'number': case 'money': case 'rating': {
      const n = Number(s.replace(/\s/g, '').replace(/€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) return bad('tiene que ser un número');
      if (f.type === 'rating' && (n < 0 || n > 5)) return bad('de 0 a 5');
      return { ok: true, value: f.type === 'rating' ? Math.round(n) : n };
    }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? { ok: true, value: s } : bad('fecha no válida');
    case 'url': {
      const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      try { new URL(u); return { ok: true, value: u }; } catch { return bad('enlace no válido'); }
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { ok: true, value: s.toLowerCase() } : bad('email no válido');
    case 'select': {
      const o = f.options.find((x) => x.key === s) ?? f.options.find((x) => x.label.toLowerCase() === s.toLowerCase());
      return o ? { ok: true, value: o.key } : bad(`«${s}» no es una de sus opciones`);
    }
    case 'multi_select': {
      const list = (Array.isArray(raw) ? raw.map(String) : s.split(/\s*[,;]\s*/)).map((x) => x.trim()).filter(Boolean);
      const keys: string[] = [];
      for (const x of list) {
        const o = f.options.find((y) => y.key === x) ?? f.options.find((y) => y.label.toLowerCase() === x.toLowerCase());
        if (!o) return bad(`«${x}» no es una de sus opciones`);
        if (!keys.includes(o.key)) keys.push(o.key);
      }
      return { ok: true, value: keys };
    }
  }
}

/**
 * Valores de un formulario → valores guardables. Solo los campos dados (los demás se conservan), los vacíos se borran
 * y los obligatorios se exigen al crear. Devuelve todos los errores juntos.
 */
export function parseValues(fields: CrmField[], input: Record<string, unknown>, opts: { requireAll?: boolean } = {}): { values: FieldValues; cleared: string[]; errors: string[] } {
  const values: FieldValues = {};
  const cleared: string[] = [];
  const errors: string[] = [];
  for (const f of fields) {
    if (f.archivedAt) continue;
    if (!(f.key in input)) {
      if (opts.requireAll && f.required && f.type !== 'checkbox') errors.push(`${f.label}: es obligatorio`);
      continue;
    }
    const r = parseValue(f, input[f.key]);
    if (!r.ok) { errors.push(r.error); continue; }
    if (r.value === null || (f.type === 'checkbox' && r.value === false)) {
      if (f.required && f.type !== 'checkbox') errors.push(`${f.label}: es obligatorio`);
      else cleared.push(f.key);
    } else values[f.key] = r.value;
  }
  return { values, cleared, errors };
}

/** Cómo se enseña un valor (lista y ficha). */
export function formatValue(f: Pick<CrmField, 'type' | 'options'>, v: FieldValue | undefined, locale = 'es-ES'): string {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
  const opt = (k: string) => f.options.find((o) => o.key === k)?.label ?? k;
  switch (f.type) {
    case 'checkbox': return v ? '✓' : '';
    case 'select': return opt(String(v));
    case 'multi_select': return (Array.isArray(v) ? v : [String(v)]).map(opt).join(', ');
    case 'number': return new Intl.NumberFormat(locale).format(Number(v));
    case 'money': return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));
    case 'rating': return '★'.repeat(Number(v)) + '☆'.repeat(Math.max(0, 5 - Number(v)));
    case 'date': return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${v}T12:00:00`));
    case 'url': return String(v).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
    default: return String(v);
  }
}

/** ¿Cumple la cuenta el filtro de este campo? (select: una opción; multi: la contiene; checkbox: «sí»/«no»). */
export function matches(f: Pick<CrmField, 'type'>, v: FieldValue | undefined, want: string): boolean {
  if (!want) return true;
  if (f.type === 'checkbox') return want === 'yes' ? v === true : v !== true;
  if (f.type === 'multi_select') return Array.isArray(v) && v.includes(want);
  if (f.type === 'select') return v === want;
  return String(v ?? '').toLowerCase().includes(want.toLowerCase());
}

/** Campos que aplican a una empresa (por su sector y sus listas) o a una persona (por sus listas), en orden, sin archivados. */
export function fieldsFor(fields: CrmField[], segmentKey: string | null, opts: { target?: FieldTarget; tags?: string[] } = {}): CrmField[] {
  const target = opts.target ?? 'account';
  const tags = opts.tags ?? [];
  return fields.filter((f) => !f.archivedAt && (f.target ?? 'account') === target
      && (!f.segments.length || (segmentKey !== null && f.segments.includes(segmentKey)))
      && (!(f.tags ?? []).length || f.tags.some((t) => tags.includes(t))))
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, 'es'));
}

/** «Fan Business Days» → «fan-business-days»: clave de lista. */
export const tagKey = (s: string) => slugKey(s);

/** Lo que llega de un formulario con FieldInput (`present:<clave>` + `f:<clave>`) → entrada para parseValues. */
export function valuesFromForm(fields: CrmField[], form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!form.has(`present:${f.key}`)) continue;
    const all = form.getAll(`f:${f.key}`).map(String);
    out[f.key] = f.type === 'multi_select' ? all : f.type === 'checkbox' ? all.length > 0 : all[0] ?? '';
  }
  return out;
}
