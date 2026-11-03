/**
 * Cuánto cuesta una empresa al mes (docs/COSTES.md §Modelo): lo que hace su equipo (perfiles) × lo que cuesta cada cosa.
 *   node scripts/load/cost-model.mjs                       → las tres empresas tipo
 *   node scripts/load/cost-model.mjs --companies 10        → y el reparto de los fijos entre 10 empresas
 *   node scripts/load/cost-model.mjs --calibrate costes.json  → con lo que cuesta de verdad cada cosa (el «por vez» del panel)
 *
 * Lo que cuesta cada cosa (por vez, en dólares) sale de los tokens típicos de cada llamada con los precios oficiales de
 * Claude (src/lib/usage/prices.ts). Son estimaciones: en cuanto haya uso real, el panel de Plataforma → Coste por empresa
 * dice el «por vez» de verdad, y se le pasa aquí con --calibrate.
 */
import { readFileSync } from 'node:fs';

const M = 1_000_000;
const haiku = (i, o) => (i * 0.10 + o * 0.50) / M;
const sonnet = (i, o) => (i * 2 + o * 10) / M;
const opus = (i, o) => (i * 4 + o * 20) / M;
const SEARCH = 10 / 1000;

/** Por vez. `why`: de dónde sale. */
export const PER_OP = {
  'crm.notes': { usd: haiku(6000, 1000), why: 'Haiku: ~6.000 tokens de entrada (instrucciones, campos y lo que cuenta) y ~1.000 de salida' },
  'crm.research': { usd: sonnet(60000, 3000) + 5 * SEARCH, why: 'Sonnet con ~5 búsquedas web: ~60.000 tokens de entrada (lo que lee) y ~3.000 de salida' },
  'crm.cleanup': { usd: sonnet(25000, 8000), why: 'Sonnet, una tanda de ~50 empresas' },
  'assistant.draft': { usd: haiku(1000, 150), why: 'Haiku: una propuesta de mensaje' },
  'assistant.audio': { usd: 0.006, why: 'Whisper: un audio de 1 minuto' },
  'leads.classify': { usd: haiku(800, 150), why: 'Haiku: ¿encaja el mensaje automático con este lead?' },
  'whatsapp.template': { usd: 0.02, why: 'Plantilla Utility en España (estimación; Meta la cobra por mensaje)' },
  email: { usd: 0.0004, why: 'Resend Pro: 20 $ por 50.000 correos' },
  'i18n.translate': { usd: opus(10000, 10000), why: 'Opus: traducir una tanda de textos de la empresa (al cambiarlos)' },
  'social.download': { usd: 0, why: 'API de medios (CONVERT_API_KEY): sin precio (USAGE_PRICE_MEDIA_CALL)' },
};
const STORAGE_GB = 0.021;
/** Tope de hoy por espacio entre Apuntar e Investigar (LIMITS.ai en src/lib/crm/service.ts). */
export const AI_CAP_DAY = 40;

/** Lo que hace cada empresa tipo al mes (22 días laborables). */
export const PROFILES = {
  ligera: {
    label: 'Ligera (3 personas, poco uso de IA)', people: 3, days: 22,
    perPersonDay: { 'crm.notes': 2, 'assistant.draft': 1, 'assistant.audio': 0.3 },
    perMonth: { 'crm.research': 8, 'crm.cleanup': 1, 'leads.classify': 30, 'whatsapp.template': 30 + 3 * 22, email: 30 * 2 + 3 * 22, 'i18n.translate': 0, 'social.download': 10 },
    proposalsWithMedia: 4,
  },
  normal: {
    label: 'Normal (8 personas, Apuntar a diario)', people: 8, days: 22,
    perPersonDay: { 'crm.notes': 6, 'assistant.draft': 3, 'assistant.audio': 1 },
    perMonth: { 'crm.research': 40, 'crm.cleanup': 4, 'leads.classify': 120, 'whatsapp.template': 120 * 2 + 8 * 22, email: 120 * 2 + 8 * 22 * 2, 'i18n.translate': 2, 'social.download': 40 },
    proposalsWithMedia: 20,
  },
  intensa: {
    label: 'Intensa (12 personas, todo con IA: «se pone como un loco»)', people: 12, days: 22,
    perPersonDay: { 'crm.notes': 25, 'assistant.draft': 8, 'assistant.audio': 6 },
    perMonth: { 'crm.research': 12 * 22 * 2, 'crm.cleanup': 20, 'leads.classify': 400, 'whatsapp.template': 400 * 2 + 12 * 22, email: 400 * 2 + 12 * 22 * 2, 'i18n.translate': 6, 'social.download': 200 },
    proposalsWithMedia: 80,
  },
};
/** Fijos de la plataforma al mes (Vercel Pro, Supabase Pro, Resend Pro). Se cambian con --fixed «Vercel=20,Supabase=25». */
const FIXED = { Vercel: 20, Supabase: 25, Resend: 20 };

export function monthly(profile, perOp = PER_OP) {
  const ops = {};
  for (const [k, n] of Object.entries(profile.perPersonDay)) ops[k] = (ops[k] ?? 0) + n * profile.people * profile.days;
  for (const [k, n] of Object.entries(profile.perMonth)) ops[k] = (ops[k] ?? 0) + n;
  const lines = Object.entries(ops).map(([k, n]) => ({ feature: k, times: Math.round(n), each: perOp[k]?.usd ?? 0, usd: n * (perOp[k]?.usd ?? 0) })).sort((a, b) => b.usd - a.usd);
  const storageGb = (profile.proposalsWithMedia * 40) / 1024;
  const variable = lines.reduce((s, l) => s + l.usd, 0) + storageGb * STORAGE_GB;
  // Apuntar (también desde WhatsApp) e Investigar comparten el tope diario del espacio.
  const capped = ((ops['crm.notes'] ?? 0) + (ops['crm.research'] ?? 0)) / profile.days;
  return { lines, storageGb, variable, perPerson: variable / profile.people, aiPerDay: capped, overCap: capped > AI_CAP_DAY };
}

const $ = (n) => (n < 0.01 ? `${n.toFixed(4)} $` : `${n.toFixed(2)} $`);
function main() {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const companies = Number(arg('companies', 0));
  const fixed = arg('fixed') ? Object.fromEntries(arg('fixed').split(',').map((x) => x.split('=')).map(([k, v]) => [k.trim(), Number(v)])) : FIXED;
  const perOp = structuredClone(PER_OP);
  const cal = arg('calibrate');
  if (cal) for (const [k, v] of Object.entries(JSON.parse(readFileSync(cal, 'utf8')))) perOp[k] = { usd: Number(v), why: 'medido (panel)' };
  const fixedTotal = Object.values(fixed).reduce((s, v) => s + v, 0);
  const out = [];
  out.push('# Coste al mes por empresa tipo', '');
  out.push(`Fijos de la plataforma: ${Object.entries(fixed).map(([k, v]) => `${k} ${v} $`).join(' · ')} = ${fixedTotal} $/mes${companies ? `, repartidos entre ${companies} empresas` : ''}.`, '');
  for (const [key, p] of Object.entries(PROFILES)) {
    const r = monthly(p, perOp);
    out.push(`## ${p.label}`, '', '| Qué | Veces al mes | Por vez | Al mes |', '|---|---:|---:|---:|');
    for (const l of r.lines.filter((x) => x.times > 0)) out.push(`| ${l.feature} | ${l.times} | ${$(l.each)} | ${$(l.usd)} |`);
    out.push(`| Almacenamiento (${r.storageGb.toFixed(1)} GB) | | ${STORAGE_GB} $/GB | ${$(r.storageGb * STORAGE_GB)} |`);
    out.push('', `**Variable: ${$(r.variable)} al mes** (${$(r.perPerson)} por persona).${companies ? ` Con su parte de los fijos (${companies} empresas): **${$(r.variable + fixedTotal / companies)}**.` : ''}`, '');
    if (r.overCap) out.push(`> ⚠️ Haría ${Math.round(r.aiPerDay)} usos de IA al día (Apuntar + Investigar) y el tope del espacio es ${AI_CAP_DAY}: con el tope de hoy no puede trabajar así.`, '');
    out.push(`<!-- ${key} -->`, '');
  }
  out.push('## De dónde sale cada «por vez»', '');
  for (const [k, v] of Object.entries(perOp)) out.push(`- **${k}** (${$(v.usd)}): ${v.why}`);
  console.log(out.join('\n'));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
