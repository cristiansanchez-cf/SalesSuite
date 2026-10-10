/**
 * Dossiers de ejemplo en un espacio real, para verlos en producción (docs/PUESTA_EN_MARCHA.md §Dossiers de ejemplo).
 *
 *   npm run tenant:samples -- enjoy [--dry-run]
 *   Autor: ADMIN_EMAILS (el primero) o, si no se indica, el admin más antiguo del espacio.
 *
 * Las combinaciones más típicas de cada receta (ver SAMPLES), con su tarifa y publicadas con enlace (el del cliente, en
 * «Compartir» del editor). Idempotente: si ya existe el ejemplo (prospect_meta.sample), lo rehace sin duplicarlo ni
 * cambiar su enlace; los que ya no están en la lista se borran.
 *
 * Propuestas de cada comercial (`perRep`): una copia para cada comercial del espacio (rol «rep»), con él como autor y
 * en su idioma (`locale`): los textos propios (título, cliente y personalizaciones) se traducen con Claude
 * (ANTHROPIC_API_KEY) y el glosario del espacio, como «Dar copia a un comercial» del editor. Los textos de los módulos
 * ya salen traducidos por content_i18n (acción «traducir»). Y la propuesta «Sin autor» pasa a ser del autor.
 */
import { readFileSync } from 'node:fs';
import { claudeTranslator, applyTranslations, overrideTexts, type TextTranslator } from '../src/lib/i18n/translate';
import { isText } from '../src/lib/i18n/content';
import { parseProposal, planProposal } from '../src/lib/proposal/preset';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * `company`: el nombre que sale en la propuesta («Propuesta para tu sala»); null = ninguno (se enseña a varios).
 * `answers`: la combinación de la receta del sector (tipo, ángulo, preguntas). `live`: las aperturas cuentan.
 */
interface Sample {
  key: string; segment: string; title: string; company: string | null; contact: string | null; tariff: string | null; coupon?: string; answers?: string[]; live?: boolean;
  /** Una por comercial (rol «rep»), con él como autor, en este idioma. */
  perRep?: boolean; locale?: string;
  /**
   * Canal de contacto de cada comercial (docs/PERSONALIZE.md §Contacto del comercial) si aún no tiene uno: queda puesto y con el
   * número/usuario vacío, para que cada uno lo complete en su propuesta (hasta entonces sale el de la marca).
   */
  contactChannel?: 'whatsapp' | 'kakao' | 'line' | 'telegram' | 'instagram' | 'phone' | 'email';
  /** Textos propios encima de la receta, por bloque (se mezclan con los de la receta). */
  props?: Record<string, Record<string, unknown>>;
}

/** Las combinaciones más típicas, para enseñar. Las que ya no están aquí se borran (con su enlace). */
const SAMPLES: Sample[] = [
  { key: 'local-pequeno', segment: 'ocio-nocturno', title: 'Enjoy para tu local · pequeño', company: 'tu local', contact: null, tariff: 'Local pequeño (hasta 150)', answers: ['tipo:estandar', 'angulo:d'], live: true },
  { key: 'local-mediano', segment: 'ocio-nocturno', title: 'Enjoy para tu local · mediano', company: 'tu local', contact: null, tariff: 'Local mediano (150–500)', answers: ['tipo:estandar', 'angulo:a', 'vj'], live: true },
  { key: 'conciertos-sala', segment: 'conciertos', title: 'Enjoy para salas de conciertos', company: 'tu sala', contact: null, tariff: 'Sala de conciertos · suscripción (más de 500)', answers: ['tipo:sala', 'angulo:a', 'pantallas'], live: true },
  { key: 'promotora', segment: 'promotoras', title: 'Enjoy para promotoras', company: 'tu promotora', contact: null, tariff: 'Promotora pequeña · evento suelto', answers: ['tipo:pequena', 'angulo:a', 'frecuencia:suelto'], live: true },
  // Hoteles: dossier de validación para un colaborador externo (documento 14). Sin precio, sin nombre de hotel.
  { key: 'hoteles-angel', segment: 'hoteles', title: 'Enjoy para hoteles y resorts', company: null, contact: null, tariff: null, live: true },
  // Oquea (espacio «oquea»): centro de buceo, sin tarifa (acuerdo de centro fundador, sin coste). Documento 05.
  { key: 'centro-buceo', segment: 'centros-buceo', title: 'Oquea para tu centro de buceo · España', company: 'Tu centro', contact: null, tariff: null, answers: ['mercado:espana', 'angulo:que-vuelvan', 'fotos'], live: false },
  { key: 'ong', segment: 'ong', title: 'Oquea para tu ONG', company: 'Tu ONG', contact: null, tariff: null, live: false },
  { key: 'centro-buceo-destino', segment: 'centros-buceo', title: 'Oquea para tu centro de buceo · abrir mercado', company: 'Tu centro', contact: null, tariff: null, answers: ['mercado:latam', 'angulo:abrir-mercado'], live: false },
  // Oquea · las dos propuestas por defecto de los comerciales de Corea (Cristian, 10-oct-2026): en coreano, una para
  // centros (turismo: buceadores de Europa y de otros países que vienen a su ciudad; la alianza internacional) y otra
  // para ONG. Sin cifras de clientes ni de descuentos (documento 05: «Nunca»).
  {
    key: 'corea-centro', segment: 'centros-buceo', perRep: true, locale: 'ko-KR', contactChannel: 'kakao', title: 'Oquea para tu centro de buceo · turismo internacional', company: 'Tu centro', contact: null, tariff: null,
    answers: ['mercado:corea', 'angulo:abrir-mercado', 'fotos'], live: false,
    props: {
      portada: { title: '{company}, centro fundador de Oquea en Corea' },
      'red-fundadores': {
        title: 'Buceadores de todo el mundo, en tu ciudad', highlight: 'de todo el mundo',
        lede: 'Oquea se está lanzando a nivel internacional y firma con centros de buceo de distintos países para que los buceadores de unos conozcan a los otros. Los centros fundadores de Corea sois los primeros: cuando un buceador de Europa prepare su viaje, encontrará tu centro en el mapa de Oquea.',
        tip: { kind: 'info', text: 'La alianza internacional: acuerdos entre centros de distintos países para que quien bucea con uno tenga ventajas al bucear con los demás. Va por fases y empieza hoy con tu centro en el mapa y tu QR en el barco.' },
      },
    },
  },
  { key: 'corea-ong', segment: 'ong', perRep: true, locale: 'ko-KR', contactChannel: 'kakao', title: 'Oquea para tu ONG', company: 'Tu ONG', contact: null, tariff: null, live: false },
];

/** Glosario y notas del espacio para traducir (tenants/<espacio>/tenant.json → content_i18n). */
function glossaryOf(slug: string): { glossary: string[]; notes?: string } {
  try {
    const c = JSON.parse(readFileSync(new URL(`../tenants/${slug}/tenant.json`, import.meta.url), 'utf8')).content_i18n ?? {};
    return { glossary: Array.isArray(c.glossary) ? c.glossary : [], notes: typeof c.notes === 'string' ? c.notes : undefined };
  } catch { return { glossary: [] }; }
}
/** Mezcla los textos propios de una muestra con los de la receta (objetos, por clave). */
function merge(a: Record<string, unknown>, b: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!b) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  return out;
}

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
  // Comerciales (para las propuestas de cada uno). En el registro, el email a medias.
  const reps = members.filter((m) => m.role === 'rep');
  const mask = (e?: string) => (e ? `${e.slice(0, 3)}…@${e.split('@')[1] ?? ''}` : '¿?');
  if (SAMPLES.some((x) => x.perRep)) console.log(`• comerciales: ${reps.length}${reps.length ? ` (${reps.map((r) => mask(r.users?.email)).join(', ')})` : ''}`);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const translator: TextTranslator | null = apiKey ? claudeTranslator(apiKey, { company: tenant.name, ...glossaryOf(slug) }) : null;

  // La propuesta «Sin autor» (la creó el alta del espacio): pasa a ser del autor.
  const orphans = (must(await sb.from('dossier').select('id').eq('tenant_id', tid).is('author_id', null), 'propuestas sin autor') ?? []) as Array<{ id: string }>;
  if (orphans.length && !dry) must(await sb.from('dossier').update({ author_id: author.user_id }).eq('tenant_id', tid).is('author_id', null), 'dar autor');
  if (orphans.length) console.log(`• propuestas sin autor: ${orphans.length} ${dry ? 'pasarían' : 'pasan'} a ser del autor`);

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

  // Los ejemplos que ya no están en la lista se borran (con sus módulos y su enlace).
  const keep = new Set(SAMPLES.map((x) => x.key));
  const old = (must(await sb.from('dossier').select('id, title, prospect_meta').eq('tenant_id', tid).not('prospect_meta->>sample', 'is', null), 'ejemplos') ?? []) as Array<{ id: string; title: string; prospect_meta: { sample?: string } }>;
  for (const d of old.filter((x) => !keep.has(x.prospect_meta?.sample ?? ''))) {
    if (!dry) must(await sb.from('dossier').delete().eq('id', d.id), `borrar ${d.title}`);
    console.log(`• ${d.prospect_meta.sample}: ${dry ? 'se borraría' : 'borrado'} («${d.title}»)`);
  }

  // En Corea no se usa WhatsApp: el canal de cada comercial queda puesto (KakaoTalk), a falta de su número/ID.
  const channel = SAMPLES.find((x) => x.perRep && x.contactChannel)?.contactChannel;
  if (channel) for (const r of reps) {
    const { data: u, error } = await sb.from('users').select('contact_channel, contact_value').eq('id', r.user_id).maybeSingle();
    if (error) { console.log(`• contacto de ${mask(r.users?.email)}: sin la migración del contacto (${error.message}), se salta`); continue; }
    if (u?.contact_channel) { console.log(`• contacto de ${mask(r.users?.email)}: ya tiene ${u.contact_channel}${u.contact_value ? '' : ' (falta el número/ID)'}`); continue; }
    if (!dry) must(await sb.from('users').update({ contact_channel: channel, contact_value: null }).eq('id', r.user_id).select('id'), 'poner canal');
    console.log(`• contacto de ${mask(r.users?.email)}: ${dry ? 'se pondría' : 'puesto'} ${channel}, falta que complete su número/ID`);
  }

  const jobs = SAMPLES.flatMap((s) => (s.perRep ? reps.map((r) => ({ s, owner: r, who: mask(r.users?.email) })) : [{ s, owner: author, who: '' }]));
  for (const { s: s0, owner, who } of jobs) {
    let s = s0;
    const seg = segments.find((x) => x.key === s.segment);
    if (!seg) { console.log(`• ${s.key}: sin sector «${s.segment}», se salta`); continue; }
    const existing = (must(await sb.from('dossier').select('id').eq('tenant_id', tid).eq('author_id', owner.user_id).contains('prospect_meta', { sample: s.key }).limit(1), 'buscar ejemplo') ?? []) as Array<{ id: string }>;
    // Con receta del sector (docs/PROPOSAL_PRESETS.md): la propuesta «va sola», sin preguntas marcadas. Se rehace entera.
    const option = options.find((o) => o.label === s.tariff && o.active);
    const coupon = s.coupon ? coupons.find((c) => c.code === s.coupon && c.active) : undefined;
    const recipe = parseProposal(seg.proposal);
    if (recipe) {
      const keyToId = new Map(modules.map((m) => [m.key, m.id]));
      let plan = planProposal(recipe, 'full', s.answers ?? []).map((b) => ({ ...b, props: merge(b.props, s.props?.[b.block]), v: latest.get(keyToId.get(b.module) ?? '') }));
      const lost = plan.filter((b) => !b.v).map((b) => b.module);
      if (lost.length) { console.log(`• ${s.key}: faltan módulos del catálogo (${lost.join(', ')}), se salta`); continue; }
      // En otro idioma: los textos propios (título, cliente y personalizaciones), traducidos con Claude.
      if (s.locale && !s.locale.startsWith('es') && !dry) {
        if (!translator) { console.log(`• ${s.key}: sin ANTHROPIC_API_KEY, los textos propios se quedan en español`); }
        else {
          const texts = [...new Set([s.title, s.company, s.contact, ...plan.flatMap((b) => overrideTexts(b.props))].filter((x): x is string => !!x && isText(x)))];
          const tr = await translator.translate(texts, s.locale);
          const T = (x: string | null) => (x ? tr.get(x) ?? x : x);
          s = { ...s, title: T(s.title)!, company: T(s.company), contact: T(s.contact) };
          plan = plan.map((b) => ({ ...b, props: applyTranslations(b.props, tr) }));
        }
      }
      const rows = (dossierId: string) => plan.map((b, i) => ({ dossier_id: dossierId, module_version_id: b.v!.id, position: (i + 1) * 1024, prop_overrides: b.props }));
      if (dry) { console.log(`• ${s.key}${who ? ` (${who})` : ''}: ${existing.length ? 'se rehará' : 'se crearía'} con la propuesta del sector (${plan.map((b) => b.block).join(' → ')})${s.locale ? `, en ${s.locale}` : ''}`); continue; }
      let id = existing[0]?.id;
      if (id) {
        must(await sb.from('dossier_item').delete().eq('dossier_id', id), `vaciar ${s.key}`);
        must(await sb.from('dossier').update({ title: s.title, prospect_name: s.contact, prospect_company: s.company, ...(s.locale ? { locale: s.locale } : {}) }).eq('id', id), `textos ${s.key}`);
      } else {
        id = (must(await sb.from('dossier').insert({
          tenant_id: tid, author_id: owner.user_id, title: s.title, ...(s.locale ? { locale: s.locale } : {}), prospect_name: s.contact, prospect_company: s.company,
          prospect_meta: { sample: s.key }, segment_id: seg.id, view_mode: s.live ? 'live' : 'test', price_option_id: option?.id ?? null, coupon_id: coupon?.id ?? null,
        }).select('id').single(), `crear ${s.key}`) as { id: string }).id;
      }
      must(await sb.from('dossier_item').insert(rows(id)), `módulos ${s.key}`);
      // La tarifa y el cupón, también a lo de ahora (una tarifa retirada no se queda en el ejemplo).
      must(await sb.from('dossier').update({ preset: { mode: 'full', answers: s.answers ?? [] }, view_mode: s.live ? 'live' : 'test', status: 'published', published_at: new Date().toISOString(), price_option_id: option?.id ?? null, coupon_id: coupon?.id ?? null }).eq('id', id), `publicar ${s.key}`);
      if (!existing.length) must(await sb.from('share_link').insert({ dossier_id: id }).select('id').single(), `enlace ${s.key}`);
      console.log(`• ${s.key}${who ? ` (${who})` : ''}: ${existing.length ? 'rehecha' : 'creada'} con la propuesta del sector (${plan.length} bloques${s.locale ? `, ${s.locale}` : ''}) → ${origin}/admin/dossiers/${id}`);
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
      tenant_id: tid, author_id: owner.user_id, title: s.title, prospect_name: s.contact, prospect_company: s.company,
      prospect_meta: { sample: s.key }, segment_id: seg.id, view_mode: s.live ? 'live' : 'test',
      price_option_id: option?.id ?? null, coupon_id: coupon?.id ?? null,
    }).select('id').single(), `crear ${s.key}`) as { id: string };
    must(await sb.from('dossier_item').insert(mods.map((v, i) => ({ dossier_id: d.id, module_version_id: v.id, position: (i + 1) * 1024 }))), `módulos ${s.key}`);
    must(await sb.from('dossier').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', d.id), `publicar ${s.key}`);
    // El enlace del cliente no se imprime (los registros no son sitio para él): está en «Compartir» del editor.
    must(await sb.from('share_link').insert({ dossier_id: d.id }).select('id').single(), `enlace ${s.key}`);
    console.log(`• ${s.key}: creado → ${origin}/admin/dossiers/${d.id}`);
  }
  console.log(dry ? '\nEra una PRUEBA: no se ha escrito nada.' : '\n✓ Dossiers de ejemplo listos.');
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
