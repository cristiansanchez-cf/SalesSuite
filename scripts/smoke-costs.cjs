/**
 * Smoke del coste por empresa (docs/COSTES.md), en demo: el superadmin ve el gasto de cada espacio, su detalle (en qué
 * y quién) y el resumen en Plataforma; un admin de un espacio no entra.
 *   npm run build && npm run start:demo ; node scripts/smoke-costs.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const login = async (p, who) => { await p.context().clearCookies(); await p.goto(`${BASE}/admin/login`); await p.click(`[data-testid="demo-${who}"]`); await p.waitForURL(/\/admin/); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })).newPage();
  await login(p, 'super@cofundo.test');
  await p.goto(`${BASE}/admin/platform`);
  assert(await p.isVisible('[data-testid=platform-costs]'), 'Plataforma enseña el gasto del mes');
  await p.click('[data-testid=platform-costs]');
  await p.waitForSelector('[data-testid=cost-space]');
  const spaces = await p.$$eval('[data-testid=cost-space]', (xs) => xs.map((x) => Number(x.getAttribute('data-variable'))));
  assert(spaces.length >= 2 && spaces[0] >= spaces[1] && spaces[0] > 0, `cada espacio con su gasto, el que más arriba (${spaces.join(', ')})`);
  await p.click('[data-testid=cost-detail] >> nth=0');
  await p.waitForSelector('[data-testid=cost-features] [data-feature]');
  assert((await p.textContent('[data-testid=cost-features]')).includes('Investigar empresas'), 'el detalle dice en qué');
  assert((await p.$$('[data-testid=cost-users] tbody tr')).length > 0, 'y quién');
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'cabe en el móvil');
  // El tope de IA de esta empresa: 120 usos al día por persona y un gasto máximo por debajo de lo gastado.
  await p.fill('[data-testid=cost-limit-form] input[name=aiPerUserDay]', '120');
  await p.fill('[data-testid=cost-limit-form] input[name=aiMonthUsd]', '0.5');
  await Promise.all([p.waitForURL(/ok=limits/), p.click('[data-testid=cost-limit-save]')]);
  assert(await p.isVisible('[data-testid=cost-limit-saved]'), 'tope guardado');
  assert((await p.textContent('[data-testid=cost-limit]')).includes('120'), 'sale en su ficha de coste');
  assert(await p.isVisible('[data-testid=cost-limit-reached]'), 'y avisa de que ya ha llegado al tope de gasto');
  await p.fill('[data-testid=cost-limit-form] input[name=aiMonthUsd]', '');
  await Promise.all([p.waitForURL(/ok=limits/), p.click('[data-testid=cost-limit-save]')]);
  assert(!(await p.isVisible('[data-testid=cost-limit-reached]')), 'sin tope de gasto, no avisa');
  await p.click('[data-testid=costs-prev]');
  await p.waitForURL(/m=\d{4}-\d{2}/);
  assert(true, 'mes anterior');
  await login(p, 'admin@enjoy.test');
  await p.goto(`${BASE}/admin/platform/costes`);
  assert(!(await p.isVisible('[data-testid=costs]')), 'un admin de un espacio no lo ve');
  await b.close();
})();
