/**
 * Smoke del mapa del CRM (docs/CRM_DINAMICO.md §16), con el Google de pruebas (AI_RESEARCH_FIXTURE=1, sin clave):
 * puntos exactos, situar ciudades (admin) → burbujas por ciudad, resumen al tocar un punto, colorear por comercial,
 * filtros, y el comercial ve el suyo sin lo de admin.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-map.cjs
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

  const p = await login('admin@enjoy.test');
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  await Promise.all([p.waitForURL(/\/admin\/map/), p.click('[data-testid=tab-map]')]);
  await p.goto(`${BASE}/admin/map?ver=all`);
  await p.waitForSelector('#crm-map[data-ready="1"]');
  const pts = Number(await p.getAttribute('[data-testid=map]', 'data-points'));
  assert(pts >= 3, `puntos con ubicación exacta (${pts})`);
  assert((await p.locator('path.map-point').count()) === pts, 'pintados en el mapa');

  // Situar las ciudades: luego las empresas sin ubicación exacta salen en la burbuja de su ciudad.
  assert(await p.isVisible('[data-testid=map-locate]'), 'el admin puede situar las ciudades');
  await Promise.all([p.waitForEvent('load', { timeout: 120000 }), p.click('[data-testid=map-locate]')]);
  await p.waitForSelector('#crm-map[data-ready="1"]');
  const cities = Number(await p.getAttribute('[data-testid=map]', 'data-cities'));
  assert(cities >= 1 && (await p.locator('[data-testid=map-city]').count()) === cities, `burbujas por ciudad (${cities})`);
  assert(!(await p.isVisible('[data-testid=map-locate]')), 'ya no quedan ciudades por situar');
  assert((await p.textContent('[data-testid=map-summary]')).includes('agrupadas en su ciudad'), 'el resumen lo explica');

  // Tocar un punto: su resumen y «Abrir ficha».
  await p.locator('path.map-point').first().click({ force: true });
  await p.waitForSelector('.leaflet-popup-content [data-testid=map-popup]');
  const pop = await p.textContent('.leaflet-popup-content');
  assert(pop.includes('Prioridad') && pop.includes('Abrir ficha'), 'resumen del punto');
  assert((await p.getAttribute('.leaflet-popup-content a.btn', 'href')).startsWith('/admin/accounts/'), 'abre su ficha');
  if (OUT) await p.screenshot({ path: `${OUT}/map-admin.png` });

  // Colorear por comercial de la zona (admin y gerentes).
  await Promise.all([p.waitForURL(/color=comercial/), p.selectOption('[data-testid=map-color]', 'comercial')]);
  await p.waitForSelector('#crm-map[data-ready="1"]');
  assert((await p.textContent('[data-testid=map-legend]')).includes('Zona sin asignar'), 'leyenda por comercial');
  if (OUT) await p.screenshot({ path: `${OUT}/map-reps.png` });

  // Filtro: solo las libres.
  await Promise.all([p.waitForURL(/estado=free/), p.selectOption('[data-testid=map-state]', 'free')]);
  await p.waitForSelector('#crm-map[data-ready="1"]');
  assert(Number(await p.getAttribute('[data-testid=map]', 'data-points')) <= pts, 'los filtros se aplican al mapa');

  // El comercial: su mapa, sin situar ciudades ni colorear por comercial.
  const r = await login('rep@enjoy.test');
  await r.goto(`${BASE}/admin/map`);
  await r.waitForSelector('#crm-map[data-ready="1"]');
  assert(!(await r.isVisible('[data-testid=map-locate]')) && !(await r.isVisible('[data-testid=map-color]')), 'el comercial no ve lo de admin');
  if (OUT) await r.screenshot({ path: `${OUT}/map-rep.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
