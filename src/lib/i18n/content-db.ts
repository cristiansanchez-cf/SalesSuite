/**
 * Dónde viven las traducciones del contenido (tabla content_i18n) y qué idiomas tiene cada espacio (tenant.content_locales).
 * La consola solo lee; las escribe scripts/content-translate.ts con el service role.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { applyTexts, type ContentKind } from './content';
import { demoDb } from '../data/store';

export interface ContentTranslation { texts: Record<string, string>; status: 'auto' | 'reviewed'; sourceHash?: string }
export interface ContentI18nDb {
  /** Idiomas a los que se traduce el contenido del espacio (además del suyo). */
  locales(tenantId: string): Promise<string[]>;
  load(tenantId: string, locale: string, kind: ContentKind): Promise<Map<string, ContentTranslation>>;
}

export function supabaseContentI18nDb(sb: SupabaseClient): ContentI18nDb {
  return {
    async locales(t) {
      const { data, error } = await sb.from('tenant').select('content_locales').eq('id', t).maybeSingle();
      // Sin la migración (o sin acceso): como si no hubiera traducciones.
      return error ? [] : ((data?.content_locales as string[] | null) ?? []);
    },
    async load(t, locale, kind) {
      const { data, error } = await sb.from('content_i18n').select('ref, texts, status, source_hash').eq('tenant_id', t).eq('locale', locale).eq('kind', kind);
      if (error) return new Map();
      return new Map((data ?? []).map((r) => [r.ref as string, { texts: r.texts as Record<string, string>, status: r.status as 'auto' | 'reviewed', sourceHash: r.source_hash as string }]));
    },
  };
}

export function demoContentI18nDb(): ContentI18nDb {
  return {
    async locales(t) { return demoDb().tenant.find((x) => x.id === t)?.content_locales ?? []; },
    async load(t, locale, kind) {
      return new Map((demoDb().content_i18n ?? []).filter((r) => r.tenant_id === t && r.locale === locale && r.kind === kind)
        .map((r) => [r.ref, { texts: r.texts, status: r.status, sourceHash: r.source_hash }]));
    },
  };
}

export const emptyContentI18nDb: ContentI18nDb = { locales: async () => [], load: async () => new Map() };

// ---------------------------------------------------------------- en la petición
/**
 * El middleware la abre cuando quien lee usa un idioma al que el espacio traduce su contenido (y está vendiendo, no
 * configurando: en Configurar se edita el original). Fuera de ella, las lecturas devuelven el original.
 */
interface Scope { tenantId: string; locale: string; db: ContentI18nDb; cache: Map<ContentKind, Promise<Map<string, ContentTranslation>>>; used: { auto: boolean; any: boolean } }
const store = new AsyncLocalStorage<Scope>();

export const withContentLocale = <R>(s: { tenantId: string; locale: string; db: ContentI18nDb } | null, fn: () => R): R =>
  s ? store.run({ ...s, cache: new Map(), used: { auto: false, any: false } }, fn) : fn();

/** ¿Esta página ha enseñado contenido traducido? (para la marca «traducción automática»). */
export const contentTranslated = (): { locale: string; auto: boolean } | null => {
  const s = store.getStore();
  return s && s.used.any ? { locale: s.locale, auto: s.used.auto } : null;
};

/**
 * Pone la traducción encima de cada cosa de la lista. `view` saca de cada una el objeto con los campos traducibles
 * (en la forma de CONTENT_FIELDS) y `back` lo vuelve a meter en la cosa.
 */
export async function overlayList<T>(kind: ContentKind, rows: T[], refOf: (r: T) => string, view: (r: T) => Record<string, unknown> = (r) => r as Record<string, unknown>, back: (r: T, v: Record<string, unknown>) => T = (_r, v) => v as T): Promise<T[]> {
  const s = store.getStore();
  if (!s || rows.length === 0) return rows;
  if (!s.cache.has(kind)) s.cache.set(kind, s.db.load(s.tenantId, s.locale, kind).catch(() => new Map()));
  const map = await s.cache.get(kind)!;
  if (map.size === 0) return rows;
  return rows.map((r) => {
    const tr = map.get(refOf(r));
    if (!tr) return r;
    s.used.any = true;
    if (tr.status === 'auto') s.used.auto = true;
    return back(r, applyTexts(view(r), tr.texts));
  });
}

/** Traducciones de los módulos por huella del original, para una vista previa en otro idioma (como la propuesta pública). */
export async function moduleTranslations(db: ContentI18nDb, tenantId: string, locale: string): Promise<Record<string, Record<string, string>> | undefined> {
  const lang = locale.slice(0, 2);
  if (!(await db.locales(tenantId).catch((): string[] => [])).includes(lang)) return undefined;
  const map = await db.load(tenantId, lang, 'module_version').catch(() => new Map<string, ContentTranslation>());
  return Object.fromEntries([...map.values()].filter((t) => t.sourceHash).map((t) => [t.sourceHash!, t.texts]));
}
