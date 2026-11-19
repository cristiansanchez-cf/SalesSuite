/**
 * Smoke de la búsqueda de la lista del CRM: mientras llega el resultado de todo el CRM se dice que está buscando;
 * «Seleccionar todas» funciona tras buscar (y con alguna ya marcada); un admin asigna las marcadas a alguien.
 *   npm run build && npm run start:demo ; node scripts/smoke-crm-search.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  // Algo que no está entre las que se ven: dice que busca en todo el CRM (antes parecía que no existía).
  await p.route('**/admin/accounts?*', async (r) => { await new Promise((x) => setTimeout(x, 800)); await r.continue(); });
  await p.fill('#acc-q', 'zzqx');
  await p.waitForSelector('[data-testid=search-status]:visible');
  assert((await p.textContent('[data-testid=search-status]')).includes('Buscando «zzqx» en todo el CRM'), 'avisa de que busca en todo el CRM');
  await p.waitForSelector('[data-testid=search-status]', { state: 'hidden', timeout: 15000 });
  assert(true, 'al llegar el resultado, el aviso se va');
  await p.unroute('**/admin/accounts?*');

  // Buscar «a» (varias) → marcar una → «Seleccionar todas» marca todas.
  const n0 = Number(await p.evaluate(() => document.documentElement.dataset.asyncDone || 0));
  await p.fill('#acc-q', 'a');
  await p.waitForFunction((k) => Number(document.documentElement.dataset.asyncDone || 0) > k, n0);
  const rows = p.locator('[data-bulk]');
  const n = await rows.count();
  assert(n >= 2, `varias tras buscar (${n})`);
  await rows.nth(0).check();
  await p.check('[data-testid=bulk-all]');
  assert((await p.locator('[data-bulk]:checked').count()) === n, 'tras buscar, «Seleccionar todas» las marca todas');
  await p.uncheck('[data-testid=bulk-all]');
  assert((await p.locator('[data-bulk]:checked').count()) === 0, 'y las desmarca');

  // Asignar las marcadas al comercial.
  await rows.nth(0).check(); await rows.nth(1).check();
  await p.click('[data-testid=bulk-assign]');
  await p.selectOption('[data-testid=bulk-assign-to]', { label: 'Comercial Enjoy' });
  await Promise.all([p.waitForURL(/ok=assigned/), p.click('[data-testid=bulk-assign-confirm]')]);
  assert((await p.textContent('body')).includes('2 empresas asignadas a Comercial Enjoy'), 'asignadas en bloque');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
