#!/usr/bin/env tsx
/**
 * Traduce el contenido de un espacio a los idiomas que tiene activados (tenant.content_locales) con Claude
 * (docs/I18N.md §Contenido): jugadas, sectores, actores, situaciones, módulos del catálogo y recorrido de Aprende.
 * Solo lo nuevo o lo que ha cambiado desde su traducción; lo revisado por una persona y sin cambios no se toca. El
 * original no se toca nunca. Glosario y notas: tenants/<espacio>/tenant.json → content_i18n.
 *
 *   npx tsx scripts/content-translate.ts oquea [--dry-run] [--force] [--locale ko]
 *
 * Necesita PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y (salvo --dry-run) ANTHROPIC_API_KEY.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { batchTexts, extractTexts, planWork, sourceHash, type ContentItem, type StoredTranslation } from '../src/lib/i18n/content';
import { supabasePlaybookDb } from '../src/lib/playbook/db-supabase';
import { supabaseEvidenceDb } from '../src/lib/evidence/db-supabase';

const MODEL = 'claude-opus-5-5';
const LANG: Record<string, string> = { ko: 'Korean (ko-KR)', en: 'English', pt: 'Brazilian Portuguese (pt-BR)', es: 'Spanish (Spain)' };
const log = (...m: unknown[]) => console.log('•', ...m);

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Todo lo que se traduce del espacio, en la forma en que lo lee la consola. */
async function collect(sb: SupabaseClient, tenantId: string, tour: unknown, locales: string[]): Promise<ContentItem[]> {
  const pdb = supabasePlaybookDb(sb);
  const edb = supabaseEvidenceDb(sb);
  const [plays, segments, personas, segMods, facets] = await Promise.all([
    pdb.listPlays(tenantId), pdb.listSegments(tenantId), pdb.listPersonas(tenantId), pdb.listSegmentModules(tenantId), edb.listFacets(tenantId),
  ]);
  const modules = must(await sb.from('module').select('id, name, description').eq('tenant_id', tenantId), 'módulos') ?? [];
  const versions = modules.length
    ? must(await sb.from('module_version').select('id, module_id, version, default_props').in('module_id', modules.map((m) => m.id)).eq('status', 'published'), 'versiones') ?? []
    : [];
  // La consola enseña la última versión publicada de cada módulo.
  const latest = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if ((latest.get(v.module_id)?.version ?? -1) < v.version) latest.set(v.module_id, v);
  // Y las versiones que llevan las propuestas ya hechas en esos idiomas (pueden ser anteriores a la última).
  const dossiers = (must(await sb.from('dossier').select('id, locale').eq('tenant_id', tenantId), 'propuestas') ?? []).filter((d) => locales.includes(String(d.locale).slice(0, 2)));
  const pinnedIds = dossiers.length
    ? [...new Set((must(await sb.from('dossier_item').select('module_version_id').in('dossier_id', dossiers.map((d) => d.id)), 'bloques') ?? []).map((i) => i.module_version_id as string))]
    : [];
  for (const v of versions) if (pinnedIds.includes(v.id) && latest.get(v.module_id)?.id !== v.id) latest.set(`${v.module_id}:${v.id}`, v);
  const item = (kind: ContentItem['kind'], ref: string, obj: Record<string, unknown>): ContentItem => ({ kind, ref, pairs: extractTexts(kind, obj) });
  return [
    ...plays.filter((p) => p.status !== 'archived').map((p) => item('play', p.id, p as unknown as Record<string, unknown>)),
    ...segments.map((s) => item('segment', s.id, s as unknown as Record<string, unknown>)),
    ...personas.map((p) => item('persona', p.id, p as unknown as Record<string, unknown>)),
    ...segMods.map((m) => item('segment_module', `${m.segmentId}:${m.moduleId}`, m as unknown as Record<string, unknown>)),
    ...facets.map((f) => item('facet', f.id, f as unknown as Record<string, unknown>)),
    ...modules.map((m) => item('module', m.id, m)),
    ...[...latest.values()].map((v) => item('module_version', v.id, { props: v.default_props })),
    item('tenant', tenantId, { tour }),
  ];
}

const OUT = z.object({ items: z.array(z.object({ i: z.number().int(), t: z.string() })) });
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, t: { type: 'string' } }, required: ['i', 't'], additionalProperties: false } } },
  required: ['items'],
  additionalProperties: false,
} as const;

function systemPrompt(company: string, target: string, glossary: string[], notes: string | undefined) {
  return [
    `You translate the sales content of ${company} from Spanish into ${LANG[target] ?? target}.`,
    'The readers are the company\'s own sales reps in that country. They read this content to learn the product and to know what to say to customers: sales scripts, objection handling, ideal customer profiles, proposal slides and product walkthroughs.',
    'Write the way a native sales professional in that market would say it: natural, clear and professional, never word-for-word. When a text is something the rep says to a customer, keep it speakable and polite.',
    'Rules:',
    '- Translate every input string. Return one output per input, with the same "i".',
    '- Keep placeholders exactly as written: {company}, {prospect} and anything else in curly braces.',
    '- Keep formatting: line breaks, Markdown (**bold**, lists with "-" or "1."), quotes «…», emojis, numbers, percentages, prices, units and dates.',
    '- Keep brand and product names, people\'s names, dive site and place names, and certification names (e.g. Open Water, Advanced Open Water, Divemaster) as they are.',
    '- Do not add, remove or explain anything. If a string is only a proper noun, return it unchanged.',
    ...(glossary.length ? ['Glossary (follow it exactly):', ...glossary.map((g) => `- ${g}`)] : []),
    ...(notes ? ['Notes from the company:', notes] : []),
    'Input: a JSON array of {"i", "t"}. Output: {"items": [{"i", "t"}]} with the translations.',
  ].join('\n');
}

async function translateBatch(client: Anthropic, system: string, texts: string[]): Promise<{ out: Map<string, string>; usage: { in: number; out: number } }> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(texts.map((t, i) => ({ i, t }))) }],
  } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;
  const usage = { in: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0), out: res.usage.output_tokens };
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
    console.warn(`  ! tanda sin traducir (${res.stop_reason}); se reintentará en la próxima pasada`);
    return { out: new Map(), usage };
  }
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const parsed = OUT.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`respuesta con otra forma: ${parsed.error.message}`);
  const out = new Map<string, string>();
  for (const { i, t } of parsed.data.items) if (texts[i] !== undefined && t.trim()) out.set(texts[i]!, t);
  return { out, usage };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const force = args.includes('--force');
  const onlyLocale = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;
  const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--locale');
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Uso: content-translate.ts <espacio> [--dry-run] [--force] [--locale ko]');
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  if (!dry && !process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY (secreto del repositorio)');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const tenant = must(await sb.from('tenant').select('id, name, default_locale, content_locales, tour').eq('slug', slug).maybeSingle(), 'espacio');
  if (!tenant) throw new Error(`No existe el espacio «${slug}»`);
  const locales = ((tenant.content_locales as string[] | null) ?? []).filter((l) => !onlyLocale || l === onlyLocale);
  if (!locales.length) { log(`«${slug}» no traduce su contenido (content_locales vacío): nada que hacer.`); return; }
  const file = await readFile(`tenants/${slug}/tenant.json`, 'utf8').then((x) => JSON.parse(x)).catch(() => ({}));
  const glossary: string[] = file.content_i18n?.glossary ?? [];
  const notes: string | undefined = file.content_i18n?.notes;

  const items = await collect(sb, tenant.id, tenant.tour, locales);
  log(`${tenant.name}: ${items.filter((x) => x.pairs.length).length} cosas con texto, ${items.reduce((n, x) => n + x.pairs.length, 0)} textos`);
  const client = dry ? null : new Anthropic();
  let tokensIn = 0;
  let tokensOut = 0;

  for (const locale of locales) {
    const stored: StoredTranslation[] = (must(await sb.from('content_i18n').select('kind, ref, source_hash, status').eq('tenant_id', tenant.id).eq('locale', locale), 'traducciones') ?? [])
      .map((r) => ({ kind: r.kind, ref: r.ref, sourceHash: r.source_hash, status: r.status }));
    const { todo, stale } = planWork(items, stored, force);
    const batches = batchTexts(todo);
    log(`${locale}: ${todo.length} por traducir (${batches.flat().length} textos únicos, ${batches.length} tandas) · ${stale.length} que ya no existen`);
    if (dry) continue;

    const done = new Map<string, string>();
    for (const [n, texts] of batches.entries()) {
      const { out, usage } = await translateBatch(client!, systemPrompt(tenant.name, locale, glossary, notes), texts);
      tokensIn += usage.in;
      tokensOut += usage.out;
      for (const [s, t] of out) done.set(s, t);
      log(`  tanda ${n + 1}/${batches.length}: ${out.size}/${texts.length}`);
    }
    // Solo se guarda una cosa si todos sus textos tienen traducción (si no, en la próxima pasada).
    const rows = todo.flatMap((it) => {
      if (!it.pairs.every(([, s]) => done.has(s))) return [];
      return [{
        tenant_id: tenant.id, locale, kind: it.kind, ref: it.ref, texts: Object.fromEntries(it.pairs.map(([p, s]) => [p, done.get(s)!])),
        source_hash: sourceHash(it.pairs), status: 'auto', updated_at: new Date().toISOString(),
      }];
    });
    for (let i = 0; i < rows.length; i += 200) must(await sb.from('content_i18n').upsert(rows.slice(i, i + 200)), 'guardar traducciones');
    for (const s of stale) must(await sb.from('content_i18n').delete().eq('tenant_id', tenant.id).eq('locale', locale).eq('kind', s.kind).eq('ref', s.ref), 'borrar traducción vieja');
    log(`${locale}: ${rows.length}/${todo.length} guardadas, ${stale.length} borradas`);
  }
  if (!dry) log(`tokens: ${tokensIn} de entrada, ${tokensOut} de salida (≈ ${((tokensIn * 4 + tokensOut * 20) / 1e6).toFixed(2)} $ con ${MODEL})`);
  console.log(`\n✓ Contenido de ${slug} traducido${dry ? ' (prueba: nada escrito)' : ''}.`);
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1); });
