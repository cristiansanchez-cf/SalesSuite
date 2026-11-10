/**
 * Traducir lo que escribe el equipo (docs/I18N.md §Lo que escribe el equipo): notas, interacciones, «lo que sabemos»,
 * próximo paso, resumen de Investigar… Se traduce una vez, al pulsar «Traducir», y se guarda por la huella del texto
 * original (text_translation): quien lo vuelva a abrir en ese idioma lo ve ya traducido, sin llamar a la IA.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import { guessLang } from './guess-lang';
import type { TextTranslator } from './translate';

export const UGC_MODEL = 'claude-haiku-5-5';
/** Por petición: cuántos textos y de qué largo como mucho (una página de la consola cabe de sobra). */
export const UGC_MAX_TEXTS = 80;
export const UGC_MAX_LEN = 4000;

export const textHash = (text: string) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 32);

export interface UgcStore {
  get(tenantId: string, locale: string, hashes: string[]): Promise<Map<string, string>>;
  put(tenantId: string, locale: string, rows: Array<{ hash: string; text: string }>): Promise<void>;
}

/** Lee con la sesión de quien mira (RLS: solo su espacio) y escribe con el service role (solo el servidor). */
export function supabaseUgcStore(reader: SupabaseClient, writer: SupabaseClient | null): UgcStore {
  return {
    async get(t, locale, hashes) {
      if (!hashes.length) return new Map();
      const res = await reader.from('text_translation').select('source_hash, text').eq('tenant_id', t).eq('locale', locale).in('source_hash', hashes);
      if (res.error) return new Map(); // aún sin migrar: nada guardado
      return new Map((res.data ?? []).map((r) => [r.source_hash as string, r.text as string]));
    },
    async put(t, locale, rows) {
      if (!writer || !rows.length) return;
      const { error } = await writer.from('text_translation').upsert(rows.map((r) => ({ tenant_id: t, locale, source_hash: r.hash, text: r.text })), { onConflict: 'tenant_id,locale,source_hash' });
      if (error) console.warn('[ugc] no se ha guardado la traducción:', error.message);
    },
  };
}

export function demoUgcStore(): UgcStore {
  const rows = () => ((demoDb() as unknown as { text_translation?: Array<{ tenant_id: string; locale: string; source_hash: string; text: string }> }).text_translation ??= []);
  return {
    async get(t, locale, hashes) {
      const want = new Set(hashes);
      return new Map(rows().filter((r) => r.tenant_id === t && r.locale === locale && want.has(r.source_hash)).map((r) => [r.source_hash, r.text]));
    },
    async put(t, locale, list) {
      const all = rows();
      for (const r of list) {
        const cur = all.find((x) => x.tenant_id === t && x.locale === locale && x.source_hash === r.hash);
        if (cur) cur.text = r.text; else all.push({ tenant_id: t, locale, source_hash: r.hash, text: r.text });
      }
    },
  };
}

/** Lo que de verdad hay que mirar: textos con algo de largo, sin repetir, en otro idioma que el de quien lee. */
export function foreignTexts(texts: unknown, locale: string): string[] {
  const lang = locale.slice(0, 2);
  const list = Array.isArray(texts) ? texts.filter((x): x is string => typeof x === 'string') : [];
  return [...new Set(list.map((x) => x.trim()).filter((x) => x.length >= 4 && x.length <= UGC_MAX_LEN))]
    .filter((x) => { const g = guessLang(x); return g !== null && g !== lang; })
    .slice(0, UGC_MAX_TEXTS);
}

/**
 * Original → traducción. `translator` null: solo lo ya guardado (lo que se pide al abrir una página). Con traductor,
 * se traduce lo que falta y se guarda para la próxima vez.
 */
export async function translateTexts(store: UgcStore, tenantId: string, locale: string, texts: string[], translator: TextTranslator | null): Promise<Record<string, string>> {
  const lang = locale.slice(0, 2);
  const byHash = new Map(texts.map((x) => [textHash(x), x]));
  const saved = await store.get(tenantId, lang, [...byHash.keys()]);
  const out: Record<string, string> = {};
  for (const [h, x] of byHash) if (saved.has(h)) out[x] = saved.get(h)!;
  const missing = texts.filter((x) => !(x in out));
  if (translator && missing.length) {
    const done = await translator.translate(missing, lang);
    const rows: Array<{ hash: string; text: string }> = [];
    for (const x of missing) {
      const tr = done.get(x)?.trim();
      if (!tr) continue;
      out[x] = tr;
      rows.push({ hash: textHash(x), text: tr.slice(0, 20000) });
    }
    await store.put(tenantId, lang, rows);
  }
  return out;
}

/** Las instrucciones: notas internas de un equipo comercial, traducidas fieles para un compañero. */
export const ugcSystem = (company: string) => (target: string) => [
  `You translate internal notes written by the sales team of ${company} so that a teammate who reads ${target === 'ko' ? 'Korean' : target === 'en' ? 'English' : target === 'pt' ? 'Portuguese' : 'Spanish (Spain)'} understands them.`,
  'They are CRM notes: what happened with a client, what we know about them, next steps, research summaries. Short and informal.',
  'Rules:',
  '- Translate every input string, faithfully and naturally. Do not add, soften, summarise or explain anything.',
  '- Keep people\'s names, company names, place names, phone numbers, emails, URLs, dates, prices and numbers exactly as written.',
  '- Keep line breaks. If a string is already in the target language or is only a proper noun, return it unchanged.',
  'Input: a JSON array of {"i", "t"}. Output: {"items": [{"i", "t"}]} with the translations.',
].join('\n');
