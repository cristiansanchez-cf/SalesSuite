/**
 * Traducir los textos propios de una propuesta (los que el comercial escribe encima de los módulos) al copiarla para
 * otro comercial en otro idioma (docs/I18N.md §Contenido). Mismo criterio que scripts/content-translate.ts: Claude,
 * salida JSON con esquema y el glosario del espacio (tenants/<espacio>/tenant.json → content_i18n).
 */
import Anthropic from '@anthropic-ai/sdk';
import { isText, skipKey } from './content';

export interface TextTranslator { translate(texts: string[], targetLocale: string): Promise<Map<string, string>> }

const LANG: Record<string, string> = { ko: 'Korean (ko-KR)', en: 'English', pt: 'Portuguese', es: 'Spanish (Spain)', ca: 'Catalan', fr: 'French' };
export const langOf = (locale: string) => LANG[locale.slice(0, 2)] ?? locale;

// El glosario del espacio se carga en ./translate-glossary (import.meta.glob, solo dentro de la app): así los scripts
// (scripts/sample-dossiers.ts) pueden usar el traductor sin Vite.

export function systemPrompt(company: string, target: string, glossary: string[], notes?: string): string {
  return [
    `You translate a sales proposal of ${company} from Spanish into ${langOf(target)}.`,
    'The texts are what the sales rep wrote on top of the proposal for a prospect: headlines, short paragraphs, button labels, names of the prospect. The prospect reads them.',
    'Write the way a native sales professional in that market would say it: natural, clear and professional, never word-for-word.',
    'Rules:',
    '- Translate every input string. Return one output per input, with the same "i".',
    '- Keep placeholders exactly as written: {company}, {prospect} and anything else in curly braces.',
    '- Keep formatting: line breaks, Markdown, quotes «…», emojis, numbers, prices, units and dates.',
    '- Keep brand and product names, people\'s names and place names as they are. If a string is only a proper noun, return it unchanged.',
    '- Do not add, remove or explain anything.',
    ...(glossary.length ? ['Glossary (follow it exactly):', ...glossary.map((g) => `- ${g}`)] : []),
    ...(notes ? ['Notes from the company:', notes] : []),
    'Input: a JSON array of {"i", "t"}. Output: {"items": [{"i", "t"}]} with the translations.',
  ].join('\n');
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 't'], properties: { i: { type: 'integer' }, t: { type: 'string' } } } } },
} as const;

/** Lo que devuelve Claude → mapa original → traducción (solo índices pedidos y textos no vacíos). */
export function readTranslations(json: unknown, texts: string[]): Map<string, string> {
  const items = Array.isArray((json as { items?: unknown })?.items) ? (json as { items: Array<{ i?: unknown; t?: unknown }> }).items : [];
  const out = new Map<string, string>();
  for (const x of items) if (Number.isInteger(x?.i) && texts[x.i as number] !== undefined && typeof x.t === 'string' && x.t.trim()) out.set(texts[x.i as number], x.t);
  return out;
}

export function claudeTranslator(apiKey: string, ctx: { company: string; glossary: string[]; notes?: string }, fetchImpl?: typeof fetch): TextTranslator {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async translate(texts, target) {
      const out = new Map<string, string>();
      for (let i = 0; i < texts.length; i += 120) {
        const part = texts.slice(i, i + 120);
        const res = await client.beta.messages.create({
          model: 'claude-opus-5-5', max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: systemPrompt(ctx.company, target, ctx.glossary, ctx.notes),
          messages: [{ role: 'user', content: JSON.stringify(part.map((t, k) => ({ i: k, t }))) }],
        } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;
        if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(`traducción sin terminar (${res.stop_reason})`);
        const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        for (const [k, v] of readTranslations(JSON.parse(text), part)) out.set(k, v);
      }
      return out;
    },
  };
}

/** Para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave): marca el texto con el idioma, sin llamar a nadie. */
export const fixtureTranslator = (): TextTranslator => ({
  async translate(texts, target) { return new Map(texts.map((t) => [t, `[${target.slice(0, 2)}] ${t}`])); },
});

/**
 * Los textos traducibles de unas personalizaciones (hojas de texto, sin URLs, colores ni claves). Las claves que no son
 * texto (tip.kind, screen, icon…: SKIP_KEYS de content.ts) no se miran: traducir «info» rompía el bloque.
 */
export function overrideTexts(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') { if (isText(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => overrideTexts(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!skipKey(k)) overrideTexts(x, out); }
  return out;
}
/** Las mismas personalizaciones con los textos cambiados (lo que no está en el mapa, y las claves que no son texto, igual). */
export function applyTranslations<T>(v: T, map: Map<string, string>): T {
  if (typeof v === 'string') return (map.get(v) ?? v) as T;
  if (Array.isArray(v)) return v.map((x) => applyTranslations(x, map)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, skipKey(k) ? x : applyTranslations(x, map)])) as T;
  return v;
}
