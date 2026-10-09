/**
 * Smoke de la ruta del día (docs/CRM_DINAMICO.md §12): elegir empresas en Cuentas → «Ruta con estas», orden por
 * cercanía, horario de hoy, las que no tienen ubicación aparte, «Desde donde estoy» y el acceso desde «Hoy».
 *   npm run build && npm run start:demo ; node scripts/smoke-route.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  // En Castellón, al lado de Terraza Azahar.
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES', permissions: ['geolocation'], geolocation: { latitude: 39.98, longitude: -0.05 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // ---- sin visitas para hoy: vacío con qué hacer
  await p.goto(`${BASE}/admin/route`);
  assert(await p.isVisible('[data-testid=empty]'), 'sin visitas: estado vacío con la salida');

  // ---- elegir en la lista → «Ruta con estas»
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  for (const n of ['Club Sol', 'Sala Marina', 'Terraza Azahar', 'Discoteca Faro']) await p.check(`[data-testid=account][data-name="${n}"] [data-bulk]`);
  await Promise.all([p.waitForURL(/\/admin\/route\?/), p.click('[data-testid=bulk-route]')]);
  const names = await p.$$eval('[data-testid=route-stop]', (xs) => xs.map((x) => x.getAttribute('data-name')));
  assert(names.length === 3, 'tres paradas con ubicación');
  assert(names.indexOf('Terraza Azahar') === 0 || names.indexOf('Terraza Azahar') === 2, 'Castellón queda en un extremo (orden por cercanía)');
  assert(Math.abs(names.indexOf('Club Sol') - names.indexOf('Sala Marina')) === 1, 'las dos de Valencia, seguidas');
  assert((await p.textContent('[data-testid=route-missing]')).includes('Discoteca Faro'), 'la que no tiene ubicación, aparte para buscarla');
  assert(await p.isVisible('[data-testid=route-stop][data-name="Club Sol"] [data-testid=route-hours]'), 'horario de hoy en cada parada');
  const maps = await p.getAttribute('[data-testid=route-maps]', 'href');
  assert(maps.startsWith('https://www.google.com/maps/dir/?api=1') && maps.includes('waypoints='), 'la ruta entera para abrir en Google Maps');
  assert((await p.textContent('[data-testid=route-total]')).includes('3 paradas'), 'resumen: paradas, tiempo y km');
  if (OUT) await p.screenshot({ path: `${OUT}/route-list.png`, fullPage: true });

  // ---- desde donde estoy (Castellón): la primera, Terraza Azahar
  await Promise.all([p.waitForURL(/desde=/), p.click('[data-testid=route-from-here]')]);
  assert((await p.getAttribute('[data-testid=route-stop] >> nth=0', 'data-name')) === 'Terraza Azahar', 'desde donde estoy: la más cercana primero');
  assert((await p.getAttribute('[data-testid=route-maps]', 'href')).includes('origin=39.98'), 'y Google Maps sale desde ahí');
  assert((await p.$$('[data-testid=route-stop]')).length === 3, 'sin perder la selección');
  if (OUT) await p.screenshot({ path: `${OUT}/route-from-here.png`, fullPage: true });

  // ---- «Hoy»: una visita para hoy → botón «Ruta del día»
  await p.goto(`${BASE}/admin/accounts?ver=all&q=Club%20Sol`);
  await p.click('[data-testid=account][data-name="Club Sol"] a.co-row__main');
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  await p.click('[data-testid=contact-form] details summary');
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await p.fill('[data-testid=contact-form] [name=nextAt]', today);
  await p.selectOption('[data-testid=contact-form] [name=nextChannel]', 'visit');
  await p.fill('[data-testid=contact-form] [name=note]', 'Mejor pasar en persona');
  await Promise.all([p.waitForURL(/ok=(contact|noted)/), p.click('[data-testid=log-save]')]);
  await p.goto(`${BASE}/admin/inicio`);
  await p.waitForSelector('[data-testid=today-route]');
  assert((await p.textContent('[data-testid=today-route]')).includes('Ruta del día'), '«Hoy»: botón «Ruta del día»');
  await Promise.all([p.waitForURL(/\/admin\/route$/), p.click('[data-testid=today-route]')]);
  assert((await p.getAttribute('[data-testid=route-stop] >> nth=0', 'data-name')) === 'Club Sol', 'la ruta con la visita de hoy');
  if (OUT) await p.screenshot({ path: `${OUT}/route-today.png`, fullPage: true });

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
