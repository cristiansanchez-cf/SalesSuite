/**
 * Smoke E2E manual (Playwright) contra un servidor en marcha:
 *   npm run build && DEV_TENANT_SLUG=enjoy PORT=4321 npm start
 *   node scripts/smoke-e2e.cjs            (BASE_URL=http://127.0.0.1:4321 por defecto)
 * Comprueba: orden/ocultos/precios, 404s, y que dos tabs-showcase animan de forma independiente.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  for (const t of ['demo-draft-Kp9wQ1', 'demo-revoked-Zt4c', 'demo-expired-Bn3r']) {
    const r = await p.goto(`${BASE}/d/${t}`);
    assert(r.status() === 404, `${t} → 404`);
  }

  await p.goto(`${BASE}/d/demo-sala-x-7Qm2`, { waitUntil: 'networkidle' });
  const types = await p.$$eval('[data-block-type]', (els) => els.map((e) => e.dataset.blockType));
  assert(JSON.stringify(types) === JSON.stringify(['hero-pitch', 'tabs-showcase', 'tabs-showcase', 'pricing-card']), 'orden + oculto ausente');
  const prices = await p.$$eval('[data-testid=item-price] strong', (els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
  assert(JSON.stringify(prices) === JSON.stringify(['250 €', '450 €']), `precios por módulo ${prices}`);
  const total = (await p.textContent('[data-testid=pricing-figure]')).replace(/\s+/g, ' ');
  assert(total.includes('700 €'), 'total per_module = 700 €');
  const primary = await p.$eval('.ds-root', (e) => getComputedStyle(e).getPropertyValue('--color-primary').trim());
  assert(primary === '255 39 187', 'tema Enjoy (#ff27bb)');

  const active = () => p.$$eval('[data-module="tabs-showcase"]', (rs) =>
    rs.map((r) => [...r.querySelectorAll('[role=tab]')].findIndex((t) => t.getAttribute('aria-selected') === 'true')));
  const [first, second] = await p.$$('[data-module="tabs-showcase"]');
  await second.scrollIntoViewIfNeeded();
  await (await second.$$('[role=tab]'))[1].click();
  assert(JSON.stringify(await active()) === '[0,1]', 'click en instancia 2 no afecta a la 1');
  await first.scrollIntoViewIfNeeded();
  await p.mouse.move(0, 0);
  await p.waitForTimeout(5200);
  assert((await active())[0] === 1, 'auto-advance de la instancia 1 independiente');
  assert(errors.length === 0, `sin errores JS ${errors}`);
  await b.close();
})();
