/**
 * Smoke de la analítica de dossiers (docs/ANALYTICS.md): un cliente abre el enlace público, lee y se va;
 * el comercial lo ve en Analítica, en la propuesta, en la lista y en la campana.
 *   npm run build && npm run start:demo ; node scripts/smoke-analytics.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const MAR_AZUL = '00000000-0000-4000-8000-000000d05512';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();

  // 1. Antes: «Hotel Mar Azul» está en «Nadie la ha abierto».
  const rep = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  await rep.goto(`${BASE}/admin/login`);
  await rep.click('[data-testid="demo-rep@enjoy.test"]');
  await rep.waitForURL(/\/admin/);
  await rep.click('[data-testid=nav-analytics]');
  await rep.waitForURL(/\/admin\/analytics/);
  assert((await rep.textContent('[data-testid=list-never]')).includes('Hotel Mar Azul'), 'antes: Mar Azul sin abrir');
  assert((await rep.textContent('[data-testid=list-follow-up]')).includes('Club Sol'), 'Club Sol: abierta y sin próximo paso → escríbele hoy');
  if (OUT) await rep.screenshot({ path: `${OUT}/analytics-overview.png`, fullPage: true });

  // 2. El cliente abre el enlace en el móvil, baja hasta el final y cierra.
  const client = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const tracked = client.waitForRequest((r) => r.url().endsWith('/api/track') && r.method() === 'POST');
  await client.goto(`${BASE}/d/demo-mar-azul-9Lw2`);
  await tracked;
  await client.waitForTimeout(1500);
  await client.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await client.waitForTimeout(1500);
  const last = client.waitForRequest((r) => r.url().endsWith('/api/track'));
  await client.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await last;
  await client.close();
  await new Promise((r) => setTimeout(r, 500));

  // 3. El comercial lo ve: analítica de la propuesta, lista, editor y campana.
  await rep.goto(`${BASE}/admin/dossiers/${MAR_AZUL}/analytics`);
  assert((await rep.textContent('[data-testid=kpi-opens]')).trim() === '1', 'una apertura');
  assert((await rep.textContent('[data-testid=kpi-reach]')).includes('100'), 'leyó hasta el final');
  assert((await rep.locator('[data-testid=visit-row]').count()) === 1 && (await rep.textContent('[data-testid=visit-row]')).includes('Móvil'), 'visita desde el móvil');
  assert((await rep.locator('[data-testid=section-row]').count()) >= 3, 'tiempo por sección');
  if (OUT) await rep.screenshot({ path: `${OUT}/analytics-dossier.png`, fullPage: true });

  // El comercial abre su propio enlace en su navegador (con sesión de la consola): no cuenta como el cliente.
  const own = await rep.context().newPage();
  const ownTracked = own.waitForRequest((r) => r.url().endsWith('/api/track') && r.method() === 'POST');
  await own.goto(`${BASE}/d/demo-mar-azul-9Lw2`);
  await ownTracked;
  await own.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await own.waitForTimeout(500);
  await own.close();
  await rep.goto(`${BASE}/admin/dossiers/${MAR_AZUL}/analytics`);
  assert((await rep.textContent('[data-testid=kpi-opens]')).trim() === '1', 'abrirlo tú no cuenta como apertura del cliente');
  assert((await rep.textContent('[data-testid=internal-visits]')).includes('1'), 'se ve aparte: 1 visita interna');

  await rep.goto(`${BASE}/admin/analytics`);
  assert(!(await rep.textContent('[data-testid=list-never]')).includes('Hotel Mar Azul'), 'después: ya no está en «sin abrir»');
  await rep.goto(`${BASE}/admin?mine=1`);
  assert((await rep.locator('[data-testid=opens-badge]').allTextContents()).some((t) => t.includes('apertura')), 'aperturas en la lista de propuestas');
  await rep.goto(`${BASE}/admin/dossiers/${MAR_AZUL}`);
  assert((await rep.textContent('[data-testid=dossier-analytics-link]')).includes('1 apertura'), 'aperturas en el editor');
  await rep.goto(`${BASE}/admin/notifications?ver=todo`);
  assert((await rep.textContent('main')).includes('Hotel Mar Azul ha abierto tu propuesta'), 'aviso en la campana');

  // 4. Un/a admin ve el equipo entero.
  const admin = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  await admin.goto(`${BASE}/admin/login`);
  await admin.click('[data-testid="demo-admin@enjoy.test"]');
  await admin.waitForURL(/\/admin/);
  await admin.goto(`${BASE}/admin/analytics`);
  assert((await admin.locator('[data-testid=analytics-row]').count()) >= 3, 'admin: todas las propuestas publicadas');
  await b.close();
})();
