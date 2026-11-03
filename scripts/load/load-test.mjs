/**
 * Prueba de carga (docs/COSTES.md §Prueba de carga): N personas a la vez haciendo un día normal de trabajo (Inicio,
 * CRM, una ficha, buscar, propuestas, Apuntar con IA, abrir una propuesta pública, entrar un lead) y cuánto tarda cada
 * cosa (p50 / p95 / p99), cuántas fallan y cuántas peticiones por segundo aguanta.
 *
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo
 *   node scripts/load/load-test.mjs --users 20 --duration 60
 *   node scripts/load/load-test.mjs --users 100 --duration 120 --think 0   (a tope, sin pausas entre clics)
 *
 * Contra la demo (por defecto) no gasta nada: la IA es la de pruebas y los datos están en memoria. Mide el servidor de
 * la aplicación, no Supabase. Para medir todo el sistema, contra un despliegue de pruebas con su propio Supabase
 * (--base https://…), nunca contra producción: crea leads e interacciones de verdad.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = (arg('base', process.env.BASE_URL || 'http://127.0.0.1:4321')).replace(/\/$/, '');
const USERS = Number(arg('users', 20));
const DURATION = Number(arg('duration', 60)) * 1000;
const THINK = Number(arg('think', 1.5)) * 1000; // pausa media entre clics
const OUT = arg('out', null);
if (/ventas\.cofundo\.io|enjoy\./.test(BASE) && !args.includes('--i-know')) {
  console.error('Esto parece producción. La prueba crea leads e interacciones: úsala contra la demo o un despliegue de pruebas (o añade --i-know).');
  process.exit(2);
}

// Personas de la demo de Enjoy (src/lib/data/store.ts).
const PEOPLE = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const SHARE = ['demo-club-sol-4Hq8', 'demo-mar-azul-9Lw2'];
const NOTES = [
  'Club Sol: hablé con Marta, quieren la pantalla los viernes. La llamo el jueves.',
  'Sala Marina - el dueño no estaba, vuelvo la semana que viene.',
  'He estado en Club Sol con Marta, les interesa para los sábados; pedir presupuesto.',
];

/** Lo que hace cada persona, con su peso (cuántas veces de cada 100 clics). */
const STEPS = [
  { name: 'Inicio (Hoy)', w: 18, run: (s) => s.get('/admin/inicio') },
  { name: 'CRM: lista', w: 14, run: (s) => s.get('/admin/accounts') },
  { name: 'CRM: ficha', w: 18, run: (s) => s.get(`/admin/accounts/${pick(s.accounts) ?? '00000000-0000-4000-8000-0000000ac001'}`) },
  { name: 'CRM: buscar', w: 10, run: (s) => s.get(`/admin/api/crm/account-search?q=${encodeURIComponent(pick(['club', 'sala', 'mar', 'sol']))}`) },
  { name: 'Propuestas', w: 8, run: (s) => s.get('/admin') },
  { name: 'Apuntar (IA)', w: 8, paid: 'crm.notes', run: (s) => s.post('/admin/accounts/apuntar', { action: 'split', text: pick(NOTES), accountId: '' }) },
  { name: 'Propuesta pública', w: 14, anon: true, run: (s) => s.get(`/d/${pick(SHARE)}`, { anon: true }) },
  { name: 'Lead de la web', w: 4, anon: true, paid: 'leads.classify', run: (s) => s.json('/api/v1/leads', lead()) },
  { name: 'Salud', w: 6, anon: true, run: (s) => s.get('/api/health', { anon: true }) },
];
const TOTAL_W = STEPS.reduce((a, x) => a + x.w, 0);
const pick = (xs) => (xs?.length ? xs[Math.floor(Math.random() * xs.length)] : undefined);
const choose = () => { let r = Math.random() * TOTAL_W; for (const s of STEPS) { r -= s.w; if (r <= 0) return s; } return STEPS[0]; };
let leadN = 0;
const lead = () => ({
  schema: 'enjoy.lead.v2', idempotency_key: `load-${Date.now()}-${++leadN}-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name: `Carga ${leadN}`, email: `carga${leadN}@salacarga.es`, phone: '600 123 123' },
  fields: { venue_name: `Sala Carga ${leadN % 50}`, city: 'Valencia', how_heard: 'google' }, message: 'Prueba de carga.',
  consent: { marketing: false, whatsapp_contact: false, legal_text_version: '2026-11-01', policy_url: 'https://enjoytheclub.es/es/politica-de-privacidad/', submitted_at: new Date().toISOString() },
  context: { locale: 'es', form_version: '2026-11-01', page_url: 'https://enjoytheclub.es/es/', page_path: '/es/', cta: { id: 'hero-primary', label: 'Hablemos', location: 'hero' }, time_to_submit_ms: 30000 },
});

const stats = new Map(); // nombre → { ms: [], errors, codes }
const record = (name, ms, ok, code) => {
  const s = stats.get(name) ?? { ms: [], errors: 0, codes: {} };
  s.ms.push(ms); if (!ok) s.errors++; s.codes[code] = (s.codes[code] ?? 0) + 1;
  stats.set(name, s);
};

class Session {
  constructor(userId) { this.userId = userId; this.cookie = ''; this.accounts = []; }
  headers(extra = {}, anon = false) { return { ...(anon || !this.cookie ? {} : { cookie: this.cookie }), origin: BASE, ...extra }; }
  async login() {
    const r = await fetch(`${BASE}/admin/login`, { method: 'POST', redirect: 'manual', headers: this.headers({ 'content-type': 'application/x-www-form-urlencoded' }, true), body: new URLSearchParams({ action: 'demo', userId: this.userId }) });
    this.cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    if (!this.cookie) throw new Error(`No se pudo entrar (${r.status}): ¿es la demo?`);
    const list = await (await fetch(`${BASE}/admin/accounts`, { headers: this.headers() })).text();
    this.accounts = [...new Set([...list.matchAll(/\/admin\/accounts\/([0-9a-f-]{36})/g)].map((m) => m[1]))].slice(0, 40);
  }
  async get(path, o = {}) {
    const r = await fetch(`${BASE}${path}`, { headers: this.headers({}, o.anon), redirect: 'manual' });
    await r.arrayBuffer();
    // Una redirección al login es un fallo (la sesión no vale); otras, se siguen como el navegador.
    if (r.status >= 300 && r.status < 400) {
      const to = r.headers.get('location') ?? '';
      if (/\/admin\/login/.test(to)) return { status: 401 };
      const r2 = await fetch(new URL(to, BASE), { headers: this.headers({}, o.anon) }); await r2.arrayBuffer(); return r2;
    }
    return r;
  }
  async post(path, form) {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', redirect: 'manual', headers: this.headers({ 'content-type': 'application/x-www-form-urlencoded' }), body: new URLSearchParams(form) });
    await r.arrayBuffer(); return r;
  }
  async json(path, body) { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); await r.arrayBuffer(); return r; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const paid = {};
async function user(i, until) {
  const s = new Session(PEOPLE[i % PEOPLE.length]);
  await s.login();
  while (Date.now() < until) {
    const step = choose();
    const t0 = performance.now();
    let ok = false, code = 0;
    try {
      const r = await step.run(s);
      code = r.status; ok = r.status < 400 || (step.name === 'Lead de la web' && r.status === 429);
    } catch (e) { code = e?.cause?.code ?? 'red'; }
    record(step.name, performance.now() - t0, ok, code);
    if (ok && step.paid) paid[step.paid] = (paid[step.paid] ?? 0) + 1;
    if (THINK > 0) await sleep(THINK * (0.3 + Math.random() * 1.4));
  }
}

const pct = (xs, p) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; };
(async () => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health) { console.error(`No responde ${BASE}. Arranca la demo: npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo`); process.exit(2); }
  console.log(`Prueba de carga: ${USERS} personas a la vez durante ${DURATION / 1000} s contra ${BASE} (pausa media ${THINK / 1000} s)…`);
  const start = Date.now();
  const until = start + DURATION;
  // Entran escalonadas en los primeros segundos (como un lunes a las 9).
  await Promise.all(Array.from({ length: USERS }, (_, i) => sleep((i * Math.min(10_000, DURATION / 4)) / USERS).then(() => user(i, until))));
  const secs = (Date.now() - start) / 1000;
  const rows = [...stats.entries()].map(([name, s]) => ({
    name, n: s.ms.length, errors: s.errors, p50: pct(s.ms, 50), p95: pct(s.ms, 95), p99: pct(s.ms, 99), max: Math.max(...s.ms), codes: s.codes,
  })).sort((a, b) => b.p95 - a.p95);
  const all = [...stats.values()].flatMap((s) => s.ms);
  const total = all.length, errors = rows.reduce((a, r) => a + r.errors, 0);
  const summary = { base: BASE, users: USERS, seconds: Math.round(secs), think: THINK / 1000, requests: total, rps: total / secs, errors, errorRate: total ? errors / total : 0,
    p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), paid, steps: rows, at: new Date().toISOString() };
  const ms = (v) => `${Math.round(v)} ms`;
  const md = [
    `# Prueba de carga · ${USERS} personas · ${Math.round(secs)} s`, '',
    `Contra ${BASE}. ${total} peticiones (${summary.rps.toFixed(1)} por segundo), ${errors} con error (${(summary.errorRate * 100).toFixed(2)} %).`,
    `En conjunto: p50 ${ms(summary.p50)} · p95 ${ms(summary.p95)} · p99 ${ms(summary.p99)}.`, '',
    '| Qué | Veces | Errores | p50 | p95 | p99 | Máx |', '|---|---:|---:|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.name} | ${r.n} | ${r.errors} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} |`), '',
    `Operaciones de pago que habría hecho: ${Object.entries(paid).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ninguna'}.`,
  ].join('\n');
  console.log(`\n${md}`);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    const stamp = summary.at.replace(/[:.]/g, '-');
    writeFileSync(join(OUT, `carga-${USERS}-${stamp}.json`), JSON.stringify(summary, null, 2));
    writeFileSync(join(OUT, `carga-${USERS}-${stamp}.md`), md);
    console.log(`\nGuardado en ${OUT}`);
  }
  const fails = rows.filter((r) => r.errors > 0).map((r) => `${r.name}: ${JSON.stringify(r.codes)}`);
  if (fails.length) console.log(`\nCódigos de los que fallaron: ${fails.join(' · ')}`);
})();
