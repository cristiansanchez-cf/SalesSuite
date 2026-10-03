/**
 * Alta / actualización idempotente de un tenant en Supabase a partir de tenants/<slug>/tenant.json.
 *
 *   npm run tenant:bootstrap -- tenants/enjoy            # aplica
 *   npm run tenant:bootstrap -- tenants/enjoy --dry-run  # solo valida y muestra el plan
 *
 * Env: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role: SOLO en tu máquina o CI, nunca en el cliente).
 * Flags: --skip-assets (no sube a Storage), --skip-invites (no envía invitaciones; solo da rol a usuarios existentes).
 *
 * Qué hace:
 *  1. Valida tema, marca y el contenido de cada módulo con los MISMOS schemas que usa la app.
 *  2. Crea/actualiza el tenant (slug fijo) y sus dominios.
 *  3. Sube tenants/<slug>/assets/* a Storage (tenant-assets/<tenant_id>/brand/…) y sustituye "asset:<ruta>" por la URL pública.
 *  4. Catálogo: crea módulos que falten; si el contenido/precio cambió respecto a la última versión publicada, publica una versión nueva.
 *  5. Admins: invita a quien no tenga cuenta y garantiza rol admin en el tenant.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { brandSchema } from '../src/lib/brand';
import { personaInputSchema, playInputSchema, segmentInputSchema } from '../src/lib/playbook/schema';
import { themeTokensSchema } from '../src/lib/theme';
import { REGISTRY, isBlockType } from '../src/modules/registry';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const SKIP_ASSETS = args.includes('--skip-assets');
const SKIP_INVITES = args.includes('--skip-invites');

const tenantFile = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(80),
  default_locale: z.string().default('es-ES'),
  theme_tokens: z.unknown(),
  brand: z.unknown().default({}),
  domains: z.array(z.object({ hostname: z.string().regex(/^[a-z0-9.-]+$/), is_primary: z.boolean().default(false) })).min(1),
  admins: z.array(z.string().email()).default([]),
  catalog: z.array(z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    block_type: z.string(),
    name: z.string().min(1).max(80),
    description: z.string().max(240).nullable().default(null),
    is_catalog: z.boolean().default(true),
    default_price: z.number().min(0).nullable().default(null),
    currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
    props: z.record(z.unknown()),
  })).default([]),
  /** Mapa de mercado: sectores con cliente ideal, actores y encaje de módulos (docs/PLAYBOOK.md §Mercado). */
  market: z.array(z.object({
    key: z.string(), name: z.string(), description: z.string().nullable().default(null), value_prop: z.string().nullable().default(null),
    icp: z.string().nullable().default(null), disqualifiers: z.string().nullable().default(null), buying_process: z.string().nullable().default(null),
    deal_size: z.string().nullable().default(null), sales_cycle: z.string().nullable().default(null),
    modules: z.array(z.object({ module_key: z.string(), priority: z.number().int().min(1).max(3).default(2), fit: z.string().nullable().default(null) })).default([]),
    personas: z.array(z.object({
      key: z.string(), name: z.string(), role: z.string(), goals: z.string().nullable().default(null), pains: z.string().nullable().default(null),
      kpis: z.string().nullable().default(null), objections: z.array(z.string()).default([]), how_to_approach: z.string().nullable().default(null),
      avoid: z.string().nullable().default(null), can_help: z.string().nullable().default(null), can_block: z.string().nullable().default(null),
      angles: z.array(z.object({ module_key: z.string(), angle: z.string() })).default([]),
    })).default([]),
  })).default([]),
  /** Playbook de ventas (docs/PLAYBOOK.md). `module_key` null = jugada general. */
  playbook: z.array(z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    module_key: z.string().nullable().default(null),
    kind: z.string(), stage: z.string().nullable().default(null), objection: z.string().nullable().default(null),
    segments: z.array(z.string()).default([]),
    personas: z.array(z.string()).default([]),
    audience: z.enum(['all', 'team', 'partners']).default('all'),
    title: z.string(), body: z.string().default(''),
    when_to_use: z.string().nullable().default(null), why_it_works: z.string().nullable().default(null),
    technique_refs: z.array(z.unknown()).default([]),
    status: z.enum(['official', 'draft']).default('official'),
  })).default([]),
}).strict();

type TenantFile = z.infer<typeof tenantFile>;

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const log = (...a: unknown[]) => console.log(DRY ? '[dry-run]' : '•', ...a);
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) fail(`${what}: ${res.error.message}`);
  return res.data;
}
/** Como must, pero exige fila (inserts con .single()). */
function mustOne<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const d = must(res, what);
  if (d == null) fail(`${what}: no devolvió fila`);
  return d as NonNullable<T>;
}

/** JSON con claves ordenadas (jsonb de Postgres no conserva el orden de claves). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Sustituye recursivamente "asset:<ruta>" por URL usando `map`. */
function replaceAssets<T>(v: T, map: Map<string, string>, missing: Set<string>): T {
  if (typeof v === 'string' && v.startsWith('asset:')) {
    const k = v.slice(6);
    const url = map.get(k);
    if (!url) missing.add(k);
    return (url ?? v) as T;
  }
  if (Array.isArray(v)) return v.map((x) => replaceAssets(x, map, missing)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceAssets(x, map, missing)])) as T;
  return v;
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (!e.name.startsWith('.')) out.push(p);
    }
  };
  await walk(root);
  return out;
}

function toPlayInput(p: TenantFile['playbook'][number], moduleId: string | null) {
  return {
    moduleId, key: p.key, kind: p.kind, stage: p.stage, objection: p.objection, segments: p.segments, personas: p.personas, audience: p.audience, title: p.title, body: p.body,
    whenToUse: p.when_to_use ?? '', whyItWorks: p.why_it_works ?? '', techniqueRefs: p.technique_refs, status: p.status,
  };
}

/** Valida todo lo que la app validaría (con URLs de assets simuladas). */
function validate(t: TenantFile, assetKeys: string[]) {
  const missing = new Set<string>();
  // 1ª pasada: detectar assets ausentes; 2ª: validar con URLs simuladas para TODOS (sin errores en cascada).
  replaceAssets([t.theme_tokens, t.brand, t.catalog.map((m) => m.props)], new Map(assetKeys.map((k) => [k, 'x'])), missing);
  const fake = new Map([...assetKeys, ...missing].map((k) => [k, `https://assets.invalid/${k}`]));
  const errors: string[] = [];
  const theme = themeTokensSchema.safeParse(replaceAssets(t.theme_tokens ?? {}, fake, missing));
  if (!theme.success) errors.push(...theme.error.issues.map((i) => `theme_tokens.${i.path.join('.')}: ${i.message}`));
  const brand = brandSchema.safeParse(replaceAssets(t.brand ?? {}, fake, missing));
  if (!brand.success) errors.push(...brand.error.issues.map((i) => `brand.${i.path.join('.')}: ${i.message}`));
  if (t.domains.filter((d) => d.is_primary).length !== 1) errors.push('domains: exactamente uno debe ser is_primary');
  const keys = new Set<string>();
  for (const m of t.catalog) {
    if (keys.has(m.key)) errors.push(`catalog: clave duplicada ${m.key}`);
    keys.add(m.key);
    if (!isBlockType(m.block_type)) { errors.push(`catalog.${m.key}: block_type desconocido "${m.block_type}" (disponibles: ${Object.keys(REGISTRY).join(', ')})`); continue; }
    const r = REGISTRY[m.block_type].schema.safeParse(replaceAssets(m.props, fake, missing));
    if (!r.success) errors.push(...r.error.issues.map((i) => `catalog.${m.key}.props.${i.path.join('.')}: ${i.message}`));
  }
  const segKeys = new Set<string>();
  const personaKeys = new Set<string>();
  for (const sg of t.market) {
    if (segKeys.has(sg.key)) errors.push(`market: sector duplicado ${sg.key}`);
    segKeys.add(sg.key);
    const r = segmentInputSchema.safeParse({ key: sg.key, name: sg.name });
    if (!r.success) errors.push(...r.error.issues.map((i) => `market.${sg.key}.${i.path.join('.')}: ${i.message}`));
    for (const m of sg.modules) if (!keys.has(m.module_key)) errors.push(`market.${sg.key}.modules: module_key "${m.module_key}" no está en catalog`);
    for (const p of sg.personas) {
      if (personaKeys.has(p.key)) errors.push(`market: actor duplicado ${p.key}`);
      personaKeys.add(p.key);
      const rp = personaInputSchema.safeParse({ segmentId: '00000000-0000-4000-8000-000000000000', key: p.key, name: p.name, role: p.role, objections: p.objections });
      if (!rp.success) errors.push(...rp.error.issues.map((i) => `market.${sg.key}.personas.${p.key}.${i.path.join('.')}: ${i.message}`));
      for (const a of p.angles) if (!keys.has(a.module_key)) errors.push(`market.${sg.key}.personas.${p.key}.angles: module_key "${a.module_key}" no está en catalog`);
    }
  }
  const pkeys = new Set<string>();
  for (const p of t.playbook) {
    if (pkeys.has(p.key)) errors.push(`playbook: clave duplicada ${p.key}`);
    pkeys.add(p.key);
    if (p.module_key && !keys.has(p.module_key)) errors.push(`playbook.${p.key}: module_key "${p.module_key}" no está en catalog`);
    for (const sk of p.segments) if (t.market.length && !segKeys.has(sk)) errors.push(`playbook.${p.key}: sector "${sk}" no está en market`);
    for (const pk of p.personas ?? []) if (!personaKeys.has(pk)) errors.push(`playbook.${p.key}: actor "${pk}" no está en market`);
    const r = playInputSchema.safeParse(toPlayInput(p, p.module_key ? '00000000-0000-4000-8000-000000000000' : null));
    if (!r.success) errors.push(...r.error.issues.map((i) => `playbook.${p.key}.${i.path.join('.')}: ${i.message}`));
  }
  for (const k of missing) errors.push(`asset:${k} no existe en ${'assets/'} (ver assets/README.md)`);
  return errors;
}

async function main() {
  if (!dir) fail('Uso: npm run tenant:bootstrap -- tenants/<slug> [--dry-run] [--skip-assets] [--skip-invites]');
  const root = resolve(dir);
  const raw = JSON.parse(await readFile(join(root, 'tenant.json'), 'utf8'));
  delete raw.$comment;
  const parsed = tenantFile.safeParse(raw);
  if (!parsed.success) fail(`tenant.json inválido:\n  ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`);
  const t = parsed.data;

  const assetsDir = join(root, 'assets');
  // Solo tipos permitidos en Storage; el resto (README, .DS_Store…) se ignora.
  const files = (await listFiles(assetsDir)).map((p) => relative(assetsDir, p).split('\\').join('/')).filter((f) => MIME[extname(f).toLowerCase()]);
  const errors = validate(t, files);
  if (errors.length) fail(`Validación:\n  ${errors.join('\n  ')}`);
  log(`tenant.json válido: ${t.market.length} sectores, ${t.market.reduce((n, s) => n + s.personas.length, 0)} actores, ${t.playbook.length} jugadas, ${t.catalog.length} módulos, ${files.length} assets, ${t.domains.length} dominios, ${t.admins.length} admins`);
  if (DRY) { log('Nada escrito (--dry-run).'); return; }

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Faltan PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. tenant (sin assets todavía)
  const existing = must(await sb.from('tenant').select('id').eq('slug', t.slug).maybeSingle(), 'leer tenant');
  let tenantId: string = existing?.id;
  if (!tenantId) {
    tenantId = mustOne(await sb.from('tenant').insert({ slug: t.slug, name: t.name, default_locale: t.default_locale }).select('id').single(), 'crear tenant').id;
    log(`tenant creado: ${t.slug} (${tenantId})`);
  } else log(`tenant existente: ${t.slug} (${tenantId})`);

  // 2. assets
  const urls = new Map<string, string>();
  if (!SKIP_ASSETS) {
    for (const f of files) {
      const type = MIME[extname(f).toLowerCase()];
      if (!type) fail(`asset con extensión no permitida: ${f}`);
      const path = `${tenantId}/brand/${f}`;
      const bytes = await readFile(join(assetsDir, f));
      if ((await stat(join(assetsDir, f))).size > 5 * 1024 * 1024) fail(`asset > 5 MB: ${f}`);
      must(await sb.storage.from('tenant-assets').upload(path, bytes, { contentType: type, upsert: true, cacheControl: '3600' }), `subir ${f}`);
      urls.set(f, sb.storage.from('tenant-assets').getPublicUrl(path).data.publicUrl);
    }
    log(`${files.length} assets subidos a tenant-assets/${tenantId}/brand/`);
  } else {
    for (const f of files) urls.set(f, `${url}/storage/v1/object/public/tenant-assets/${tenantId}/brand/${f}`);
    log('assets: omitidos (--skip-assets); se usan las URLs donde estarían');
  }
  const missing = new Set<string>();
  const theme = replaceAssets(t.theme_tokens ?? {}, urls, missing);
  const brand = replaceAssets(t.brand ?? {}, urls, missing);
  must(await sb.from('tenant').update({ name: t.name, default_locale: t.default_locale, theme_tokens: theme, brand }).eq('id', tenantId), 'actualizar tenant');
  log('tema y marca actualizados');

  // 3. dominios
  for (const d of t.domains) {
    const cur = must(await sb.from('domain').select('id, tenant_id').eq('hostname', d.hostname).maybeSingle(), 'leer dominio');
    if (cur && cur.tenant_id !== tenantId) fail(`el dominio ${d.hostname} ya pertenece a otro tenant`);
    if (!cur) must(await sb.from('domain').insert({ tenant_id: tenantId, hostname: d.hostname, is_primary: false }), `crear dominio ${d.hostname}`);
  }
  // primario: primero desmarcar todos (índice único parcial), luego marcar
  must(await sb.from('domain').update({ is_primary: false }).eq('tenant_id', tenantId), 'reset primario');
  const primary = t.domains.find((d) => d.is_primary)!;
  must(await sb.from('domain').update({ is_primary: true }).eq('hostname', primary.hostname), 'marcar primario');
  log(`dominios: ${t.domains.map((d) => d.hostname + (d.is_primary ? ' (primario)' : '')).join(', ')}`);

  // 4. catálogo
  for (const m of t.catalog) {
    const props = replaceAssets(m.props, urls, missing);
    const found = must(await sb.from('module').select('id, block_type').eq('tenant_id', tenantId).eq('key', m.key).maybeSingle(), `leer módulo ${m.key}`);
    if (found && found.block_type !== m.block_type) fail(`módulo ${m.key}: block_type no se puede cambiar (${found.block_type} → ${m.block_type}); usa otra clave`);
    let mod: { id: string; block_type: string };
    if (!found) {
      mod = mustOne(await sb.from('module').insert({ tenant_id: tenantId, key: m.key, block_type: m.block_type, name: m.name, description: m.description, is_catalog: m.is_catalog }).select('id, block_type').single(), `crear módulo ${m.key}`);
    } else {
      mod = found;
      must(await sb.from('module').update({ name: m.name, description: m.description, is_catalog: m.is_catalog }).eq('id', mod.id), `actualizar módulo ${m.key}`);
    }
    const versions = must(await sb.from('module_version').select('id, version, status, default_props, default_price, default_currency').eq('module_id', mod.id).order('version', { ascending: false }), `versiones ${m.key}`) ?? [];
    const lastPub = versions.find((v) => v.status === 'published');
    const price = (v: unknown) => (v == null ? null : Number(v));
    const same = lastPub && canonical(lastPub.default_props) === canonical(props)
      && price(lastPub.default_price) === price(m.default_price) && lastPub.default_currency === m.currency;
    if (same) { log(`módulo ${m.key}: sin cambios (v${lastPub.version})`); continue; }
    const next = (versions[0]?.version ?? 0) + 1;
    must(await sb.from('module_version').insert({ module_id: mod.id, version: next, status: 'published', default_props: props, default_price: m.default_price, default_currency: m.currency }), `publicar ${m.key} v${next}`);
    log(`módulo ${m.key}: publicada v${next}`);
  }

  const moduleIds = new Map<string, string>(
    (must(await sb.from('module').select('id, key').eq('tenant_id', tenantId), 'leer módulos') ?? []).map((r: { id: string; key: string }) => [r.key, r.id]),
  );

  // 5. mapa de mercado (upsert por key; encajes y ángulos se sincronizan: lo que no está en el JSON se quita)
  for (const [i, sg] of t.market.entries()) {
    const segRow = {
      tenant_id: tenantId, key: sg.key, name: sg.name, description: sg.description, value_prop: sg.value_prop, icp: sg.icp,
      disqualifiers: sg.disqualifiers, buying_process: sg.buying_process, deal_size: sg.deal_size, sales_cycle: sg.sales_cycle,
      position: (i + 1) * 1024, status: 'official',
    };
    const segId = mustOne(await sb.from('segment').upsert(segRow, { onConflict: 'tenant_id,key' }).select('id').single(), `sector ${sg.key}`).id as string;
    must(await sb.from('segment_module').delete().eq('segment_id', segId), `limpiar encajes ${sg.key}`);
    if (sg.modules.length) must(await sb.from('segment_module').insert(sg.modules.map((m) => ({ tenant_id: tenantId, segment_id: segId, module_id: moduleIds.get(m.module_key)!, priority: m.priority, fit: m.fit }))), `encajes ${sg.key}`);
    for (const [j, p] of sg.personas.entries()) {
      const pRow = {
        tenant_id: tenantId, segment_id: segId, key: p.key, name: p.name, role: p.role, goals: p.goals, pains: p.pains, kpis: p.kpis,
        objections: p.objections, how_to_approach: p.how_to_approach, avoid: p.avoid, can_help: p.can_help, can_block: p.can_block, position: (j + 1) * 1024,
      };
      const pid = mustOne(await sb.from('persona').upsert(pRow, { onConflict: 'tenant_id,key' }).select('id').single(), `actor ${p.key}`).id as string;
      must(await sb.from('persona_module').delete().eq('persona_id', pid), `limpiar ángulos ${p.key}`);
      if (p.angles.length) must(await sb.from('persona_module').insert(p.angles.map((a) => ({ tenant_id: tenantId, persona_id: pid, module_id: moduleIds.get(a.module_key)!, angle: a.angle }))), `ángulos ${p.key}`);
    }
  }
  if (t.market.length) log(`mercado: ${t.market.length} sectores sincronizados`);

  // 6. playbook (upsert por key; si cambia el contenido → nueva versión con revisión)
  for (const [i, raw] of t.playbook.entries()) {
    const p = playInputSchema.parse(toPlayInput(raw, raw.module_key ? moduleIds.get(raw.module_key)! : null));
    const row = {
      module_id: p.moduleId, key: raw.key, kind: p.kind, stage: p.stage ?? null, objection: p.objection ?? null, segments: p.segments, personas: p.personas, audience: p.audience,
      title: p.title, body: p.body, when_to_use: p.whenToUse ?? null, why_it_works: p.whyItWorks ?? null, technique_refs: p.techniqueRefs,
      status: p.status, position: (i + 1) * 1024,
    };
    const cur = must(await sb.from('play').select('id, version, module_id, kind, stage, objection, segments, personas, audience, title, body, when_to_use, why_it_works, technique_refs, status').eq('tenant_id', tenantId).eq('key', raw.key).maybeSingle(), `leer jugada ${raw.key}`);
    const content = (x: Record<string, unknown>) => canonical({ ...x, position: undefined, key: undefined, id: undefined, version: undefined });
    if (!cur) {
      const id = mustOne(await sb.from('play').insert({ tenant_id: tenantId, ...row, version: 1 }).select('id').single(), `crear jugada ${raw.key}`).id;
      must(await sb.from('play_revision').insert({ tenant_id: tenantId, play_id: id, version: 1, snapshot: row, change_note: 'Importada (tenant.json)' }), `revisión ${raw.key}`);
      log(`jugada ${raw.key}: creada`);
    } else if (content(cur) !== content(row)) {
      const version = cur.version + 1;
      must(await sb.from('play').update({ ...row, version }).eq('id', cur.id), `actualizar jugada ${raw.key}`);
      must(await sb.from('play_revision').insert({ tenant_id: tenantId, play_id: cur.id, version, snapshot: row, change_note: 'Actualizada por importación (tenant.json)' }), `revisión ${raw.key}`);
      log(`jugada ${raw.key}: v${version}`);
    } else {
      must(await sb.from('play').update({ position: row.position }).eq('id', cur.id), `orden ${raw.key}`);
    }
  }
  if (t.playbook.length) log(`playbook: ${t.playbook.length} jugadas sincronizadas`);

  // 7. admins
  const redirectTo = `https://${primary.hostname}/admin/auth/confirm?next=/admin/account`;
  for (const email of t.admins.map((e) => e.toLowerCase())) {
    let user = must(await sb.from('users').select('id').ilike('email', email).maybeSingle(), `buscar ${email}`);
    if (!user) {
      if (SKIP_INVITES) { log(`admin ${email}: sin cuenta y --skip-invites → omitido`); continue; }
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error || !data.user) fail(`invitar ${email}: ${error?.message}`);
      user = { id: data.user.id };
      log(`admin ${email}: invitación enviada`);
    }
    must(await sb.from('membership').upsert({ user_id: user.id, tenant_id: tenantId, role: 'admin' }, { onConflict: 'user_id,tenant_id' }), `membership ${email}`);
    log(`admin ${email}: rol admin garantizado`);
  }

  console.log(`\n✓ Tenant ${t.slug} listo. Siguiente: DNS CNAME ${primary.hostname} → tu plataforma (docs/SETUP.md §6).`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
