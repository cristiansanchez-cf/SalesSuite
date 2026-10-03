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
  log(`tenant.json válido: ${t.catalog.length} módulos, ${files.length} assets, ${t.domains.length} dominios, ${t.admins.length} admins`);
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

  // 5. admins
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
