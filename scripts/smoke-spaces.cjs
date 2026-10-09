/**
 * Smoke de «Cambiar de espacio» (abajo a la izquierda): quien tiene acceso a varios espacios salta de uno a otro sin
 * tocar la URL; quien solo tiene uno ve su espacio sin menú.
 *   npm run build && npm run start:demo ; node scripts/smoke-spaces.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const tenantName = (p) => p.textContent('[data-testid=workspace] summary .co-row-title');

  const rep = await login('rep@enjoy.test');
  assert(!(await rep.isVisible('[data-testid=workspace]')), 'con un solo espacio no hay menú de espacios');

  const sup = await login('super@cofundo.test');
  await sup.goto(`${BASE}/admin/inicio`);
  const before = (await tenantName(sup)).trim();
  await sup.click('[data-testid=workspace] summary');
  const items = await sup.$$eval('[data-testid=spaces] button', (els) => els.map((e) => ({ slug: e.dataset.space, here: e.getAttribute('aria-current') === 'true' })));
  assert(items.length >= 2 && items.filter((x) => x.here).length === 1, `lista de espacios con el actual marcado (${items.length})`);
  if (OUT) await sup.screenshot({ path: `${OUT}/spaces-menu.png` });
  const other = items.find((x) => !x.here);
  await Promise.all([sup.waitForNavigation(), sup.click(`[data-testid=spaces] button[data-space="${other.slug}"]`)]);
  const after = (await tenantName(sup)).trim();
  assert(after && after !== before, `cambia de espacio sin tocar la URL (${before} → ${after})`);
  await sup.click('[data-testid=workspace] summary');
  const back = items.find((x) => x.here);
  await Promise.all([sup.waitForNavigation(), sup.click(`[data-testid=spaces] button[data-space="${back.slug}"]`)]);
  assert((await tenantName(sup)).trim() === before, 'y vuelve al primero');
  await b.close();
})();
