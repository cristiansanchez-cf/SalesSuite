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
  await rep.click('[data-testid=nav-start]');
  await rep.waitForURL(/\/admin\/start/);
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
