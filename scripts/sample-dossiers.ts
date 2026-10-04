/**
 * Dossiers de ejemplo en un espacio real, para verlos en producción (docs/PUESTA_EN_MARCHA.md §Dossiers de ejemplo).
 *
 *   npm run tenant:samples -- enjoy [--dry-run]
 *   Autor: ADMIN_EMAILS (el primero) o, si no se indica, el admin más antiguo del espacio.
 *
 * Uno por sector prioritario (Locales, Promotoras, Conciertos), con sus módulos recomendados, una tarifa y
 * publicado con enlace (el del cliente, en «Compartir» del editor). Quedan en modo prueba: tus aperturas no cuentan. Idempotente: si ya existe el
 * ejemplo de ese sector (prospect_meta.sample), no lo duplica y vuelve a enseñar su enlace.
 */
import { parseProposal, planProposal } from '../src/lib/proposal/preset';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface Sample { key: string; segment: string; title: string; company: string; contact: string; tariff: string; coupon?: string }

const SAMPLES: Sample[] = [
  { key: 'locales', segment: 'ocio-nocturno', title: 'Propuesta para Sala Ejemplo', company: 'Sala Ejemplo', contact: 'Marta (gerente)', tariff: 'Local mediano (150–500)' },
  { key: 'promotoras', segment: 'promotoras', title: 'Propuesta para Promotora Ejemplo', company: 'Promotora Ejemplo', contact: 'Javi (producción)', tariff: 'Evento de promotora', coupon: 'PACK5' },
  { key: 'conciertos', segment: 'conciertos', title: 'Propuesta para Auditorio Ejemplo', company: 'Auditorio Ejemplo', contact: 'Lucía (programación)', tariff: 'Sala 1.000–5.000' },
];

type Res<T> = { data: T; error: { message: string } | null };
function must<T>(res: Res<T>, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const slug = args.find((a) => !a.startsWith('--')) ?? 'enjoy';
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Nombre de espacio no válido');
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const tenant = must(await sb.from('tenant').select('id, name').eq('slug', slug).maybeSingle(), 'espacio');
  if (!tenant) throw new Error(`No existe el espacio «${slug}»`);
  const tid: string = tenant.id;

  // Autor: el email indicado (debe ser miembro) o el admin más antiguo.
  const email = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim().toLowerCase();
  const members = must(await sb.from('membership').select('user_id, role, created_at, users!membership_user_id_fkey(email)').eq('tenant_id', tid).order('created_at'), 'equipo') as unknown as
    Array<{ user_id: string; role: string; users: { email: string } | null }>;
  const author = email
    ? members.find((m) => m.users?.email?.toLowerCase() === email)
    : members.find((m) => m.role === 'admin');
  if (!author) throw new Error(email ? 'Ese email no es miembro del espacio: entra una vez en la consola (o invítalo) y repite.' : 'El espacio no tiene admins todavía.');
  console.log(`• autor: ${email ? 'el email indicado' : 'el admin más antiguo'} (${author.role})`);

  const [segments, options, coupons, modules, versions, segMods, domains] = await Promise.all([
    sb.from('segment').select('id, key, proposal').eq('tenant_id', tid),
    sb.from('price_option').select('id, label, active').eq('tenant_id', tid),
    sb.from('coupon').select('id, code, active').eq('tenant_id', tid),
    sb.from('module').select('id, key').eq('tenant_id', tid),
    sb.from('module_version').select('id, module_id, version').eq('tenant_id', tid).eq('status', 'published'),
    sb.from('segment_module').select('segment_id, module_id, priority').eq('tenant_id', tid),
    sb.from('domain').select('hostname, is_primary').eq('tenant_id', tid),
  ]).then((rs) => rs.map((r, i) => must(r as Res<unknown[]>, ['sectores', 'tarifas', 'cupones', 'módulos', 'versiones', 'encajes', 'dominios'][i]) as Array<Record<string, any>>));

  const latest = new Map<string, { id: string; version: number }>();
  for (const v of versions) if ((latest.get(v.module_id)?.version ?? 0) < v.version) latest.set(v.module_id, { id: v.id, version: v.version });
  const host = (domains.find((d) => d.is_primary) ?? domains[0])?.hostname;
  const origin = host ? `https://${host}` : '';

  for (const s of SAMPLES) {
    const seg = segments.find((x) => x.key === s.segment);
    if (!seg) { console.log(`• ${s.key}: sin sector «${s.segment}», se salta`); continue; }
    const existing = (must(await sb.from('dossier').select('id').eq('tenant_id', tid).eq('author_id', author.user_id).contains('prospect_meta', { sample: s.key }).limit(1), 'buscar ejemplo') ?? []) as Array<{ id: string }>;
    // Con receta del sector (docs/PROPOSAL_PRESETS.md): la propuesta «va sola», sin preguntas marcadas. Se rehace entera.
    const option = options.find((o) => o.label === s.tariff && o.active);
    const coupon = s.coupon ? coupons.find((c) => c.code === s.coupon && c.active) : undefined;
    const recipe = parseProposal(seg.proposal);
    if (recipe) {
      const keyToId = new Map(modules.map((m) => [m.key, m.id]));
      const plan = planProposal(recipe, 'full', []).map((b) => ({ ...b, v: latest.get(keyToId.get(b.module) ?? '') }));
      const lost = plan.filter((b) => !b.v).map((b) => b.module);
      if (lost.length) { console.log(`• ${s.key}: faltan módulos del catálogo (${lost.join(', ')}), se salta`); continue; }
      const rows = (dossierId: string) => plan.map((b, i) => ({ dossier_id: dossierId, module_version_id: b.v!.id, position: (i + 1) * 1024, prop_overrides: b.props }));
      if (dry) { console.log(`• ${s.key}: ${existing.length ? 'se rehará' : 'se crearía'} con la propuesta del sector (${plan.map((b) => b.block).join(' → ')})`); continue; }
      let id = existing[0]?.id;
      if (id) must(await sb.from('dossier_item').delete().eq('dossier_id', id), `vaciar ${s.key}`);
      else {
        id = (must(await sb.from('dossier').insert({
          tenant_id: tid, author_id: author.user_id, title: s.title, prospect_name: s.contact, prospect_company: s.company,
          prospect_meta: { sample: s.key }, segment_id: seg.id, view_mode: 'test', price_option_id: option?.id ?? null, coupon_id: coupon?.id ?? null,
        }).select('id').single(), `crear ${s.key}`) as { id: string }).id;
      }
      must(await sb.from('dossier_item').insert(rows(id)), `módulos ${s.key}`);
      must(await sb.from('dossier').update({ preset: { mode: 'full', answers: [] }, status: 'published', published_at: new Date().toISOString() }).eq('id', id), `publicar ${s.key}`);
      if (!existing.length) must(await sb.from('share_link').insert({ dossier_id: id }).select('id').single(), `enlace ${s.key}`);
      console.log(`• ${s.key}: ${existing.length ? 'rehecha' : 'creada'} con la propuesta del sector (${plan.length} bloques) → ${origin}/admin/dossiers/${id}`);
      continue;
    }
    const mods = segMods.filter((m) => m.segment_id === seg.id).sort((a, b) => a.priority - b.priority).map((m) => latest.get(m.module_id)).filter((v): v is { id: string; version: number } => !!v);
    if (!mods.length) { console.log(`• ${s.key}: el sector no tiene módulos recomendados, se salta`); continue; }
    if (existing.length) {
      // Ya existía: se le añaden (delante) los recomendados que le falten (p. ej. un módulo nuevo del catálogo).
      const id = existing[0].id;
      const items = (must(await sb.from('dossier_item').select('id, position, module_version_id, module_version(module_id)').eq('dossier_id', id), 'módulos del ejemplo') ?? []) as unknown as Array<{ id: string; position: number; module_version_id: string; module_version: { module_id: string } | null }>;
      // Y los que tiene, a la última versión publicada (un ejemplo enseña siempre lo de ahora).
      const stale = items.filter((x) => x.module_version && latest.get(x.module_version.module_id) && latest.get(x.module_version.module_id)!.id !== x.module_version_id);
      if (!dry) for (const x of stale) must(await sb.from('dossier_item').update({ module_version_id: latest.get(x.module_version!.module_id)!.id }).eq('id', x.id), `actualizar módulo ${s.key}`);
      const have = new Set(items.map((x) => x.module_version?.module_id));
      const missing = segMods.filter((m) => m.segment_id === seg.id).sort((a, b) => a.priority - b.priority).filter((m) => !have.has(m.module_id)).map((m) => latest.get(m.module_id)).filter((v): v is { id: string; version: number } => !!v);
      const first = Math.min(1024, ...items.map((x) => Number(x.position)));
      if (missing.length && !dry) must(await sb.from('dossier_item').insert(missing.map((v, i) => ({ dossier_id: id, module_version_id: v.id, position: (first * (i + 1)) / (missing.length + 1) }))), `añadir módulos ${s.key}`);
      console.log(`• ${s.key}: ya existía${missing.length ? ` (+${missing.length} módulo${missing.length > 1 ? 's' : ''} nuevo${missing.length > 1 ? 's' : ''})` : ''}${stale.length ? ` (${stale.length} a la última versión)` : ''} → ${origin}/admin/dossiers/${id}`);
      continue;
    }
    if (dry) { console.log(`• ${s.key}: se crearía con ${mods.length} módulos, tarifa ${option ? '✓' : '✗'}${s.coupon ? `, cupón ${coupon ? '✓' : '✗'}` : ''}`); continue; }

    const d = must(await sb.from('dossier').insert({
      tenant_id: tid, author_id: author.user_id, title: s.title, prospect_name: s.contact, prospect_company: s.company,
      prospect_meta: { sample: s.key }, segment_id: seg.id, view_mode: 'test',
      price_option_id: option?.id ?? null, coupon_id: coupon?.id ?? null,
    }).select('id').single(), `crear ${s.key}`) as { id: string };
    must(await sb.from('dossier_item').insert(mods.map((v, i) => ({ dossier_id: d.id, module_version_id: v.id, position: (i + 1) * 1024 }))), `módulos ${s.key}`);
    must(await sb.from('dossier').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', d.id), `publicar ${s.key}`);
    // El enlace del cliente no se imprime (los registros no son sitio para él): está en «Compartir» del editor.
    must(await sb.from('share_link').insert({ dossier_id: d.id }).select('id').single(), `enlace ${s.key}`);
    console.log(`• ${s.key}: creado → ${origin}/admin/dossiers/${d.id}`);
  }
  console.log(dry ? '\nEra una PRUEBA: no se ha escrito nada.' : '\n✓ Dossiers de ejemplo listos (en modo prueba: tus aperturas no cuentan).');
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
