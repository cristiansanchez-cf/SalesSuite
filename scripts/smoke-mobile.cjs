/**
 * Smoke del móvil (390×844): NINGUNA página de la app desborda en horizontal (docs/UX_REVIEW.md #1).
 * Criterio: document.documentElement.scrollWidth <= clientWidth.
 *
 * Recorre todas las páginas .astro de src/pages con cada rol de demo:
 *  - sin sesión: /, /admin/login, 404 y el enlace público de una propuesta publicada (/d/<token>, en presentación y ?ver=scroll);
 *  - admin@enjoy.test, rep@enjoy.test, dj@enjoy.test (colaborador): todas las de /admin; las que dan 403/404 o redirigen
 *    para ese rol se saltan sin fallar, pero las marcadas en `must` tienen que cargar;
 *  - super@cofundo.test: /admin/platform (lo demás lo ve igual que un admin).
 * Las rutas dinámicas ([id], [key]...) no se fijan a mano: se sacan de los enlaces (a[href], iframe[src]) de las páginas ya
 * visitadas (listas → detalle), así que el orden de ROUTES importa (padres antes que hijos).
 * En el builder también se miran las pestañas «Vista previa» y «Guion».
 * Assert aparte: ROUTES cubre todos los .astro de src/pages (salvo EXCLUDED), y cada uno se ha medido al menos una vez;
 * una página nueva sin añadir aquí hace fallar el smoke.
 *   npm run build && npm run start:demo ; node scripts/smoke-mobile.cjs
 *
 * Excluidas a propósito (no son páginas: endpoints .ts, no se miden):
 *  - admin/api/**            API JSON del builder y export del playbook (descargas).
 *  - admin/auth/callback.ts, admin/auth/confirm.ts   callbacks de Supabase Auth (redirigen).
 *  - admin/locale.ts, admin/logout.ts                acciones POST/redirect.
 *  - api/**                  API pública (health, track, cron, v1, dev/outbox).
 *  - demo-media/[key].ts     imágenes de demo.
 * Páginas .astro excluidas (EXCLUDED_ASTRO): admin/notifications/[id].astro, que no pinta nada (marca el aviso como leído y
 * redirige a su destino, que ya se mide por su cuenta).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

/** .astro de src/pages que el smoke no recorre, con motivo. */
const EXCLUDED_ASTRO = {
  'admin/notifications/[id].astro': 'solo marca el aviso como leído y redirige (303) a lo que pide',
};

/**
 * Desbordes conocidos: clave «ruta-o-fichero» → motivo. No fallan el CI, salen como KNOWN.
 * KNOWN BUG: ... (docs/TESTING.md → Bugs encontrados)
 */
const KNOWN = {};

const A = 'admin@enjoy.test', R = 'rep@enjoy.test', D = 'dj@enjoy.test', S = 'super@cofundo.test';
const UUID = '[0-9a-f-]{36}';

/**
 * file: fichero de src/pages; path: URL fija, o find: regex del enlace a buscar en lo ya visitado;
 * suffix: se añade al enlace encontrado; variants: sufijos (query) que también se miden, o «@/ruta» para otra URL fija del mismo fichero;
 * must: roles para los que TIENE que cargar; status: el esperado si no es 200.
 */
const ROUTES = [
  // Sin sesión.
  { file: 'index.astro', path: '/', anon: true },
  { file: 'admin/login.astro', path: '/admin/login', anon: true },
  { file: '404.astro', path: `/no-existe-${Date.now().toString(36)}`, anon: true, status: 404 },
  { file: 'd/[token].astro', find: /^\/d\/[A-Za-z0-9_-]{8,128}$/, variants: ['', '?ver=scroll'], anon: true },
  // Consola.
  { file: 'admin/index.astro', path: '/admin', variants: ['', '?status=published'], must: [A, R, D, S] },
  { file: 'admin/forbidden.astro', path: '/admin/forbidden', status: 403, must: [A] },
  { file: 'admin/welcome.astro', path: '/admin/welcome', variants: ['', '?step=2', '?step=3'], must: [A, R, D] },
  { file: 'admin/start.astro', path: '/admin/start', must: [A, R, D] },
  { file: 'admin/inicio.astro', path: '/admin/inicio', must: [A, R] },
  { file: 'admin/account.astro', path: '/admin/account', must: [A, R, D] },
  { file: 'admin/wins.astro', path: '/admin/wins', variants: ['', '?outcome=lost'], must: [A, R, D] },
  { file: 'admin/compose.astro', path: '/admin/compose', must: [A, R] },
  { file: 'admin/analytics.astro', path: '/admin/analytics', must: [A, R, D] },
  { file: 'admin/notifications/index.astro', path: '/admin/notifications', variants: ['', '?ver=todo'], must: [A, R, D] },
  { file: 'admin/accounts/index.astro', path: '/admin/accounts', must: [A, R] },
  { file: 'admin/accounts/[id].astro', find: new RegExp(`^/admin/accounts/${UUID}$`), must: [A, R] },
  { file: 'admin/commissions/index.astro', path: '/admin/commissions', must: [A, R, D] },
  { file: 'admin/commissions/team.astro', path: '/admin/commissions/team', variants: ['', '?tab=plan', '?tab=api', '?tab=cupones', '?tab=ingresos'], must: [A] },
  { file: 'admin/learn/index.astro', path: '/admin/learn', must: [A, R, D] },
  { file: 'admin/learn/tour.astro', path: '/admin/learn/tour', must: [A, R, D] },
  { file: 'admin/learn/[topic].astro', find: new RegExp(`^/admin/learn/${UUID}$`), variants: ['', '@/admin/learn/general', '@/admin/learn/empresa'], must: [A, R, D] },
  { file: 'admin/learn/preview/[moduleId].astro', find: new RegExp(`^/admin/learn/preview/${UUID}$`), must: [A, R, D] },
  { file: 'admin/learn/sector/[key].astro', find: /^\/admin\/learn\/sector\/[\w-]+$/, must: [A, R, D] },
  { file: 'admin/learn/sector/[key]/[persona].astro', find: /^\/admin\/learn\/sector\/[\w-]+\/[\w-]+$/, must: [A, R] },
  { file: 'admin/playbook/index.astro', path: '/admin/playbook', variants: ['', '?tab=market'], must: [A] },
  { file: 'admin/playbook/[playId].astro', find: new RegExp(`^/admin/playbook/${UUID}$`), variants: ['', '@/admin/playbook/new'], must: [A] },
  { file: 'admin/setup.astro', path: '/admin/setup', variants: ['', '?step=1', '?step=2', '?step=3', '?step=4', '?step=5'], must: [A] },
  { file: 'admin/playbook/segment/[id].astro', find: new RegExp(`^/admin/playbook/segment/${UUID}$`), must: [A] },
  { file: 'admin/playbook/persona/[id].astro', find: new RegExp(`^/admin/playbook/persona/${UUID}$`), must: [A] },
  { file: 'admin/setup/ia.astro', path: '/admin/setup/ia', variants: ['', '?b=empresa', '?b=mercado', '?b=jugadas', '?b=precios', '?b=situaciones', '?b=listo'], must: [A] },
  { file: 'admin/team/index.astro', path: '/admin/team', must: [A] },
  { file: 'admin/team/org.astro', path: '/admin/team/org', must: [A] },
  { file: 'admin/team/partners/[userId].astro', find: new RegExp(`^/admin/team/partners/${UUID}$`), must: [A] },
  { file: 'admin/catalog/index.astro', path: '/admin/catalog', must: [A] },
  { file: 'admin/catalog/[versionId].astro', find: new RegExp(`^/admin/catalog/${UUID}$`), must: [A] },
  { file: 'admin/catalog/preview/[versionId].astro', find: new RegExp(`^/admin/catalog/preview/${UUID}$`), must: [A] },
  { file: 'admin/prices.astro', path: '/admin/prices', must: [A] },
  { file: 'admin/brand/index.astro', path: '/admin/brand', must: [A] },
  { file: 'admin/brand/preview.astro', path: '/admin/brand/preview', variants: ['', '?ver=scroll'], must: [A] },
  { file: 'admin/territory.astro', path: '/admin/territory', must: [A] },
  { file: 'admin/platform.astro', path: '/admin/platform', must: [S] },
  // Propuestas (el builder, con sus pestañas, y lo que cuelga de él).
  { file: 'admin/dossiers/[id]/index.astro', find: new RegExp(`^/admin/dossiers/${UUID}$`), must: [A, R], builder: true },
  { file: 'admin/dossiers/[id]/analytics.astro', find: new RegExp(`^/admin/dossiers/${UUID}/analytics$`), must: [A, R] },
  { file: 'admin/dossiers/[id]/preview.astro', find: new RegExp(`^/admin/dossiers/${UUID}/preview$`), must: [A, R] },
  { file: 'admin/dossiers/[id]/script.astro', find: new RegExp(`^/admin/dossiers/${UUID}/script$`), must: [A, R] },
  // El enlace a «documentar el cierre» solo sale con la propuesta ganada/perdida y editable: se usa el id del builder
  // (el comercial no puede documentar la de otro: 403, se salta).
  { file: 'admin/dossiers/[id]/debrief.astro', find: new RegExp(`^/admin/dossiers/${UUID}$`), suffix: '/debrief', must: [A] },
];

/** Mide el desborde y, si lo hay, los elementos más a la derecha que no están dentro de un contenedor con scroll propio. */
const measure = (p) => p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const clipped = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') return true; } return !!el.closest('[data-scroll-x]'); };
  const worst = document.documentElement.scrollWidth > w ? [...document.querySelectorAll('body *')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !clipped(el); })
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
    .map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : ''} → ${Math.round(el.getBoundingClientRect().right)}`)
    .slice(0, 4) : [];
  return { sw: document.documentElement.scrollWidth, w, worst };
});

const checkFit = (label, key, m) => {
  const fits = m.sw <= m.w;
  const detail = fits ? '' : ` (mide ${m.sw}: ${m.worst.join(' | ')})`;
  if (!fits && KNOWN[key]) console.log('KNOWN:', `${label} desborda${detail} — ${KNOWN[key]}`);
  else assert(fits, `${label} cabe en ${m.w}px${detail}`);
};

const measured = new Set();
const pageErrors = [];

/** Recorre ROUTES con una página ya (o no) logueada. `seen` acumula los enlaces internos para resolver las dinámicas. */
async function walk(p, who, routes) {
  const seen = [];
  const skipped = [];
  const collect = async () => {
    const hrefs = await p.$$eval('a[href^="/"], iframe[src^="/"]', (els) => els.map((e) => e.getAttribute('href') || e.getAttribute('src'))).catch(() => []);
    for (const h of hrefs) { const u = h.split('#')[0].split('?')[0]; if (!seen.includes(u)) seen.push(u); }
  };
  await collect();
  for (const r of routes) {
    const must = (r.must || []).includes(who) || r.anon;
    let base = r.path;
    if (!base) {
      base = seen.find((h) => r.find.test(h));
      if (!base) { if (must) assert(false, `${who} encuentra un enlace a ${r.file}`); else skipped.push(`${r.file} (sin enlace)`); continue; }
      base += r.suffix || '';
    }
    for (const v of r.variants || ['']) {
      const u = v.startsWith('@') ? v.slice(1) : `${base}${v}`;
      const res = await p.goto(`${BASE}${u}`);
      const status = res ? res.status() : 0;
      const landed = new URL(p.url());
      const redirected = landed.pathname + landed.search !== u;
      if (status !== (r.status || 200) || redirected) {
        if (must) assert(false, `${who} ${u} carga (${status}${redirected ? ` → ${landed.pathname}` : ''})`);
        else skipped.push(`${u} (${status}${redirected ? ` → ${landed.pathname}` : ''})`);
        continue;
      }
      await collect();
      await p.waitForTimeout(120);
      measured.add(r.file);
      checkFit(`${who} ${u}`, u.replace(new RegExp(UUID, 'g'), ':id'), await measure(p));
      if (r.builder && v === '') {
        for (const pane of ['Vista previa', 'Guion']) {
          const tab = p.locator('[role=tab]:visible', { hasText: pane }).first();
          if (!(await tab.count())) { assert(false, `${who} builder · pestaña ${pane} visible`); continue; }
          await tab.click();
          await p.waitForTimeout(200);
          // En «Guion» sale el enlace a la versión para imprimir (/script) cuando carga el guion.
          if (pane === 'Guion') { await p.waitForSelector('a[href$="/script"]', { timeout: 5000 }).catch(() => {}); await collect(); }
          checkFit(`${who} builder · ${pane}`, `builder:${pane}`, await measure(p));
        }
      }
    }
  }
  if (skipped.length) console.log(`skip: ${who} no ve (${skipped.length}): ${skipped.join(', ')}`);
}

(async () => {
  // Cobertura: todos los .astro de src/pages están en ROUTES (o excluidos con motivo).
  const root = path.join(__dirname, '..', 'src', 'pages');
  const files = [];
  const scan = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) scan(f); else if (f.endsWith('.astro')) files.push(path.relative(root, f).split(path.sep).join('/')); } };
  scan(root);
  const listed = new Set(ROUTES.map((r) => r.file));
  const missing = files.filter((f) => !listed.has(f) && !EXCLUDED_ASTRO[f]);
  const stale = [...listed].filter((f) => !files.includes(f));
  assert(missing.length === 0, `ROUTES cubre los ${files.length} .astro de src/pages${missing.length ? ` (faltan: ${missing.join(', ')})` : ''}`);
  assert(stale.length === 0, `ROUTES no apunta a páginas que ya no existen${stale.length ? ` (${stale.join(', ')})` : ''}`);

  const b = await chromium.launch();
  const newPage = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => pageErrors.push(`${p.url()}: ${e.message}`));
    return { ctx, p };
  };

  // Sin sesión.
  {
    const { ctx, p } = await newPage();
    await walk(p, 'anónimo', ROUTES.filter((r) => r.anon));
    await ctx.close();
  }
  // Con cada rol.
  for (const who of [A, R, D, S]) {
    const { ctx, p } = await newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin(?!\/login)/);
    const routes = ROUTES.filter((r) => !r.anon && (who !== S || (r.must || []).includes(S)));
    await walk(p, who, routes);
    await ctx.close();
  }
  await b.close();

  const unmeasured = files.filter((f) => !EXCLUDED_ASTRO[f] && !measured.has(f));
  assert(unmeasured.length === 0, `cada página se ha medido al menos una vez${unmeasured.length ? ` (sin medir: ${unmeasured.join(', ')})` : ''}`);
  assert(pageErrors.length === 0, `sin errores JS${pageErrors.length ? `: ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
