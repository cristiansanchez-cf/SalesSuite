/**
 * Contenido de cada empresa en otro idioma (docs/I18N.md §Contenido). La traducción de cada cosa (jugada, sector,
 * actor, situación, módulo, recorrido…) se guarda como «ruta → texto» y se pone encima del original al leer. El
 * original no se toca. Lo comparten la consola (lectura) y scripts/content-translate.ts (escritura).
 */
import { createHash } from 'node:crypto';

export type ContentKind = 'play' | 'segment' | 'persona' | 'facet' | 'module' | 'module_version' | 'segment_module' | 'tenant';

/** Campos con texto de cada cosa (en la forma en que la ve la app). Lo demás (claves, iconos, enlaces…) no se traduce. */
export const CONTENT_FIELDS: Record<ContentKind, string[]> = {
  play: ['title', 'body', 'whenToUse', 'whyItWorks'],
  segment: ['name', 'description', 'valueProp', 'icp', 'disqualifiers', 'buyingProcess', 'dealSize', 'salesCycle', 'notice', 'proposal'],
  persona: ['name', 'goals', 'pains', 'kpis', 'howToApproach', 'avoid', 'canHelp', 'canBlock'],
  facet: ['label', 'question', 'options'],
  module: ['name', 'description'],
  module_version: ['props'],
  segment_module: ['fit'],
  tenant: ['tour'],
};

/** Claves cuyo valor nunca es texto para leer (identificadores, enlaces, medios, enums). */
const SKIP_KEYS = new Set([
  'id', 'key', 'keys', 'icon', 'screen', 'src', 'href', 'url', 'image', 'images', 'photo', 'photos', 'mark', 'brand', 'exports',
  'logo', 'kind', 'stage', 'objection', 'objections', 'status', 'tone', 'audience', 'role', 'segments', 'personas', 'module',
  'moduleKey', 'blockType', 'color', 'view', 'ui', 'when', 'modes', 'priority', 'max', 'currency', 'type', 'variant',
  'musicStyles', 'cover', 'song', 'artist', 'handle', 'date', 'time', 'avatar', 'video', 'poster', 'modules',
]);
// Ni enlaces, ni rutas, ni claves tipo «como-funciona-v», ni colores o números sueltos.
const NOT_TEXT = /^(https?:|asset:|stock:|mailto:|tel:|\/|#[0-9a-f]{3,8}$)|^[\d\s.,:/%+-]*$/i;
const SLUG = /^[a-z0-9]+([._:-][a-z0-9]+)+$/; // claves con separador (minúsculas): «como-funciona-v», «club.photo»

export const isText = (s: string) => /\p{L}/u.test(s) && !NOT_TEXT.test(s.trim()) && !SLUG.test(s.trim());

/** Textos de una cosa como pares [ruta, texto], en orden estable. */
export function extractTexts(kind: ContentKind, obj: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (v: unknown, path: string, key: string) => {
    if (typeof v === 'string') { if (isText(v)) out.push([path, v]); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`, key)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        // sample.cards en app-steps: tipos de tarjeta (dive, record…), no texto.
        if (SKIP_KEYS.has(k) || /Id$|_id$/.test(k) || (key === 'sample' && k === 'cards')) continue;
        walk(x, `${path}/${k}`, k);
      }
    }
  };
  for (const f of CONTENT_FIELDS[kind]) walk(obj[f], f, f);
  return out;
}

/** Huella del original: si cambia algún texto (o su sitio), la traducción guardada está desactualizada. */
export function sourceHash(pairs: Array<[string, string]>): string {
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 32);
}

/** Copia de `obj` con los textos traducidos en su sitio. Solo sustituye donde el original sigue teniendo un texto. */
export function applyTexts<T>(obj: T, texts: Record<string, string>): T {
  const out = structuredClone(obj) as unknown as Record<string, unknown>;
  for (const [path, text] of Object.entries(texts)) {
    if (typeof text !== 'string' || !text) continue;
    const parts = path.split('/');
    let cur: unknown = out;
    for (let i = 0; i < parts.length - 1 && cur && typeof cur === 'object'; i++) cur = (cur as Record<string, unknown>)[parts[i]!];
    const last = parts[parts.length - 1]!;
    if (cur && typeof cur === 'object' && typeof (cur as Record<string, unknown>)[last] === 'string') (cur as Record<string, unknown>)[last] = text;
  }
  return out as T;
}

// ---------------------------------------------------------------- qué traducir (scripts/content-translate.ts)
export interface ContentItem { kind: ContentKind; ref: string; pairs: Array<[string, string]> }
export interface StoredTranslation { kind: ContentKind; ref: string; sourceHash: string; status: 'auto' | 'reviewed' }

/**
 * Qué hay que traducir: lo nuevo y lo que ha cambiado desde su traducción (la huella no coincide). Lo revisado por una
 * persona y sin cambios en el original no se toca. `stale`: traducciones de cosas que ya no existen (se borran).
 */
export function planWork(items: ContentItem[], stored: StoredTranslation[], force = false): { todo: ContentItem[]; stale: StoredTranslation[] } {
  const byRef = new Map(stored.map((s) => [`${s.kind}:${s.ref}`, s]));
  const todo = items.filter((it) => it.pairs.length > 0 && (force || byRef.get(`${it.kind}:${it.ref}`)?.sourceHash !== sourceHash(it.pairs)));
  const live = new Set(items.filter((it) => it.pairs.length > 0).map((it) => `${it.kind}:${it.ref}`));
  return { todo, stale: stored.filter((s) => !live.has(`${s.kind}:${s.ref}`)) };
}

/** Textos únicos (los repetidos se traducen una vez) en tandas de como mucho `maxChars` caracteres. */
export function batchTexts(items: ContentItem[], maxChars = 6000): string[][] {
  const unique = [...new Set(items.flatMap((it) => it.pairs.map(([, t]) => t)))];
  const out: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const t of unique) {
    if (cur.length && size + t.length > maxChars) { out.push(cur); cur = []; size = 0; }
    cur.push(t);
    size += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
