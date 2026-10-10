/**
 * Smoke del mapa del CRM (docs/CRM_DINAMICO.md §16), con el Google de pruebas (AI_RESEARCH_FIXTURE=1, sin clave):
 * Empresas → «Mapa» (mismos filtros), puntos con el icono de su tipo, situar ciudades (admin) → las que solo tienen
 * ciudad salen en su centro, los grupos se abren al tocarlos (acercando o en abanico), resumen al tocar un punto,
 * colorear por comercial, y el comercial ve el suyo sin lo de admin.
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
  const ready = (p) => p.waitForSelector('#crm-map[data-ready="1"]');
  const count = async (p) => Number(await p.getAttribute('[data-testid=map]', 'data-points'));

  const p = await login('admin@enjoy.test');
  await p.goto(`${BASE}/admin/accounts?ver=all&estado=free`);
  assert(!(await p.isVisible('[data-testid=tab-map]')), 'el mapa no es otra pestaña: es otra forma de ver Empresas');
  await Promise.all([p.waitForURL(/\/admin\/accounts\/mapa\?.*estado=free/), p.click('[data-testid=view-map]')]);
  assert(await p.getAttribute('[data-testid=view-map]', 'aria-current') === 'page', '«Lista | Mapa», con los mismos filtros');
  await p.goto(`${BASE}/admin/accounts/mapa?ver=all`);
  await ready(p);
  const exact = await count(p);
  assert(exact >= 3, `empresas con su sitio exacto (${exact})`);
  assert((await p.locator('[data-testid=map-kinds] li').count()) === 4, 'leyenda con el icono de cada tipo');

  // Situar las ciudades: luego las que solo tienen ciudad salen en su centro (aproximadas).
  assert(await p.isVisible('[data-testid=map-locate]'), 'el admin puede situar las ciudades');
  await Promise.all([p.waitForEvent('load', { timeout: 120000 }), p.click('[data-testid=map-locate]')]);
  await ready(p);
  assert((await count(p)) > exact, `y ahora también las de su ciudad (${await count(p)})`);
  assert(!(await p.isVisible('[data-testid=map-locate]')), 'ya no quedan ciudades por situar');
  assert((await p.textContent('[data-testid=map-summary]')).includes('aproximadas'), 'el resumen lo explica');

  // Un grupo: al tocarlo se acerca hasta separarse (o, si están en el mismo sitio, se abre en abanico).
  const z0 = Number(await p.getAttribute('#crm-map', 'data-zoom'));
  const cl = p.locator('[data-testid=map-cluster]').first();
  if (await cl.count()) {
    await cl.click();
    await p.waitForTimeout(900);
    const z1 = Number(await p.getAttribute('#crm-map', 'data-zoom'));
    const legs = await p.locator('.leaflet-cluster-spider-leg, .leaflet-marker-icon [data-testid=map-point]').count();
    assert(z1 > z0 || legs > 0, `tocar un grupo lo abre (zoom ${z0} → ${z1})`);
  } else assert(true, 'sin grupos con estos datos');
  if (OUT) await p.screenshot({ path: `${OUT}/map-admin.png` });

  // Tocar un punto: su resumen y «Abrir ficha».
  await p.goto(`${BASE}/admin/accounts/mapa?ver=all&zona=`);
  await ready(p);
  await p.evaluate(() => document.querySelectorAll('[data-testid=map-cluster]').length === 0 || null);
  const pt = p.locator('[data-testid=map-point]').first();
  if (!(await pt.count())) { await p.locator('[data-testid=map-cluster]').first().click(); await p.waitForTimeout(900); }
  await p.locator('[data-testid=map-point]').first().click();
  await p.waitForSelector('.leaflet-popup-content [data-testid=map-popup]');
  const pop = await p.textContent('.leaflet-popup-content');
  assert(pop.includes('Prioridad') && pop.includes('Abrir ficha'), 'resumen del punto');
  assert((await p.getAttribute('.leaflet-popup-content a.btn', 'href')).startsWith('/admin/accounts/'), 'abre su ficha');

  // Colorear por comercial de la zona (admin y gerentes).
  await Promise.all([p.waitForURL(/color=comercial/), p.selectOption('[data-testid=map-color]', 'comercial')]);
  await ready(p);
  assert((await p.textContent('[data-testid=map-legend]')).includes('Zona sin asignar'), 'leyenda por comercial');
  if (OUT) await p.screenshot({ path: `${OUT}/map-reps.png` });

  // La dirección antigua sigue llevando al mapa.
  await p.goto(`${BASE}/admin/map`);
  assert(p.url().includes('/admin/accounts/mapa'), 'la dirección antigua redirige');

  // El comercial: su mapa, sin situar ciudades ni colorear por comercial.
  const r = await login('rep@enjoy.test');
  await r.goto(`${BASE}/admin/accounts/mapa`);
  await ready(r);
  assert(!(await r.isVisible('[data-testid=map-locate]')) && !(await r.isVisible('[data-testid=map-color]')), 'el comercial no ve lo de admin');
  if (OUT) await r.screenshot({ path: `${OUT}/map-rep.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
