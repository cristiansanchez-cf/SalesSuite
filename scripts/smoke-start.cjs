/**
 * Smoke de «Empieza aquí» (docs/FOUNDATIONS.md §4.1): el comercial ve qué vendemos, a quién y cómo se vende;
 * sus condiciones solo aparecen cuando un/a admin las marca como acordadas.
 *   npm run build && npm run start:demo ; node scripts/smoke-start.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const REP = '11111111-1111-4111-8111-111111111111';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

async function login(b, email) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${email}"]`);
  await p.waitForURL(/\/admin/);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const rep = await login(b, 'rep@enjoy.test');
  // Menú corto (docs/CRM_DINAMICO.md §8): 5 destinos; «Empieza aquí» es una pestaña de Inicio.
  assert((await rep.locator('.co-sidebar .co-nav a').count()) <= 5, 'menú de Vender con 5 destinos como mucho');
  await rep.click('[data-testid=nav-home]');
  await rep.waitForURL(/\/admin\/inicio/);
  await rep.click('[data-testid=tab-start]');
  await rep.waitForURL(/\/admin\/start/);
  assert((await rep.getAttribute('[data-testid=nav-home]', 'aria-current')) === 'page', 'en «Empieza aquí», Inicio sigue marcado');
  for (const s of ['what', 'who', 'how', 'terms', 'steps']) assert(await rep.isVisible(`[data-testid=start-${s}]`), `sección ${s}`);
  assert((await rep.locator('[data-testid=start-what] li').count()) > 0, 'qué vendemos: el catálogo');
  const plays = await rep.locator('[data-testid=start-play]').count();
  const labelled = (await rep.locator('[data-testid=start-play] [data-testid=proven]').count()) + (await rep.locator('[data-testid=start-play] [data-testid=hypothesis]').count());
  assert(plays === 0 || labelled === plays, 'cada jugada dice si está comprobada o es hipótesis');
  assert(await rep.isVisible('[data-testid=terms-pending]'), 'sin condiciones acordadas: mensaje humilde, sin cifras');
  if (OUT) await rep.screenshot({ path: `${OUT}/start-rep.png`, fullPage: true });

  // Admin: acuerda y muestra las condiciones del comercial.
  const admin = await login(b, 'admin@enjoy.test');
  await admin.goto(`${BASE}/admin/commissions/team?tab=plan`);
  const row = admin.locator(`[data-testid=terms-${REP}]`);
  await row.locator('summary').click();
  await row.locator('textarea[name=note]').fill('70 % del paquete 1, 50 % del paquete 2');
  await row.locator('input[name=visible]').check();
  await row.locator('button[type=submit]').click();
  await admin.waitForLoadState();
  assert((await admin.textContent('body')).includes('Condiciones guardadas'), 'admin guarda las condiciones');

  await rep.reload();
  assert(!(await rep.isVisible('[data-testid=terms-pending]')), 'ya no sale el mensaje de pendiente');
  assert((await rep.textContent('[data-testid=terms-note]')).includes('70 % del paquete 1'), 'el comercial ve sus condiciones');
  if (OUT) await rep.screenshot({ path: `${OUT}/start-rep-terms.png`, fullPage: true });

  // Historial: un cambio más (nueva nota) y el comercial puede ver lo que se acordó antes.
  const rowH = admin.locator(`[data-testid=terms-${REP}]`);
  if ((await rowH.getAttribute('open')) === null) await rowH.locator('summary').click();
  await rowH.locator('textarea[name=note]').fill('75 % del paquete 1 desde noviembre');
  await rowH.locator('button[type=submit]').click();
  await admin.waitForLoadState();
  assert((await admin.textContent(`[data-testid=terms-history-${REP}]`)).includes('70 % del paquete 1'), 'admin: historial con la versión anterior');
  await rep.reload();
  await rep.click('[data-testid=terms-history] summary');
  assert((await rep.textContent('[data-testid=terms-history]')).includes('70 % del paquete 1'), 'comercial: historial de sus condiciones');

  // Volver a ocultarlas para no afectar a otros smokes.
  const row2 = admin.locator(`[data-testid=terms-${REP}]`);
  if ((await row2.getAttribute('open')) === null) await row2.locator('summary').click();
  await row2.locator('input[name=visible]').uncheck();
  await row2.locator('button[type=submit]').click();
  await admin.waitForLoadState();
  await rep.reload();
  assert(await rep.isVisible('[data-testid=terms-pending]'), 'ocultas de nuevo');
  await b.close();
})();
