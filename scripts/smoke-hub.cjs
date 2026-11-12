/**
 * Smoke del acceso general (docs/HUB.md): ventas.cofundo.io sin espacio → entrar → «¿Dónde quieres ir hoy?» → entrar en
 * el espacio elegido, ya con sesión. En local, hub.localhost hace de ventas.cofundo.io.
 *   npm run build && npm run start:demo ; node scripts/smoke-hub.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const port = new URL(BASE).port || '4321';
const HUB = `http://hub.localhost:${port}`;
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const page = async (vp = { width: 1280, height: 860 }) => (await b.newContext({ viewport: vp, locale: 'es-ES' })).newPage();
  const errors = [];

  // Sin sesión: la raíz lleva a entrar; lo de dentro de un espacio no se sirve aquí.
  const p = await page();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${HUB}/`);
  assert(p.url().startsWith(`${HUB}/admin/login`), `la raíz lleva a entrar (${p.url()})`);
  assert((await p.textContent('.text-eyebrow')).includes('Cofundo'), 'el login del acceso general no es de ningún espacio');
  assert(!(await p.isVisible('[data-testid=hub-link]')), 'sin enlace a sí mismo');
  await p.goto(`${HUB}/admin/crm`);
  assert(p.url().startsWith(`${HUB}/admin/login`), 'lo de un espacio, a entrar (y luego a elegir)');

  // Superadmin: varias empresas → elige.
  await p.click('[data-testid="demo-super@cofundo.test"]');
  await p.waitForSelector('[data-testid=hub-pick]');
  const cards = await p.$$eval('[data-testid=hub-space]', (xs) => xs.map((x) => x.dataset.space));
  assert(cards.length >= 2 && cards.includes('enjoy'), `una tarjeta por empresa (${cards.join(', ')})`);
  if (OUT) await p.screenshot({ path: `${OUT}/hub-pick.png`, fullPage: true });
  await Promise.all([p.waitForURL(/enjoy\.localhost.*\/admin/), p.click('[data-testid=hub-space][data-space=enjoy]')]);
  await p.waitForLoadState('load');
  assert(/^http:\/\/enjoy\.localhost:\d+\/admin/.test(p.url()) && !p.url().includes('/login'), `dentro de Enjoy, con sesión (${p.url()})`);
  // Volver: la última elegida, primero y marcada.
  await p.goto(`${HUB}/admin/elige`);
  assert((await p.getAttribute('[data-testid=hub-space] >> nth=0', 'data-space')) === 'enjoy' && await p.isVisible('[data-testid=hub-last]'), 'la última vez, primero');
  // Salir del acceso general.
  await Promise.all([p.waitForURL(/\/admin\/login/), p.click('[data-testid=hub-logout]')]);
  await p.goto(`${HUB}/admin/elige`);
  assert(p.url().includes('/admin/login'), 'tras salir, a entrar');

  // Con una sola empresa, directo.
  const r = await page({ width: 390, height: 844 });
  r.on('pageerror', (e) => errors.push(e.message));
  await r.goto(`${HUB}/admin/login`);
  await r.click('[data-testid="demo-rep@enjoy.test"]');
  await r.waitForURL(/enjoy\.localhost.*\/admin/);
  assert(!r.url().includes('/login'), `una sola empresa: directo (${r.url()})`);

  // Desde el login de un espacio, el enlace al acceso general.
  const t = await page();
  await t.goto(`http://enjoy.localhost:${port}/admin/login`);
  assert((await t.getAttribute('[data-testid=hub-link]', 'href')) === `${HUB}/admin/login`, 'el login de un espacio enlaza al acceso general');

  // Móvil: la pantalla de elegir sin desbordarse.
  const mob = await page({ width: 390, height: 844 });
  await mob.goto(`${HUB}/admin/login`);
  await mob.click('[data-testid="demo-super@cofundo.test"]');
  await mob.waitForSelector('[data-testid=hub-pick]');
  assert(!(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'móvil sin scroll lateral');
  if (OUT) await mob.screenshot({ path: `${OUT}/hub-pick-mobile.png`, fullPage: true });

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
