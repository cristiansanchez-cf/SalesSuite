/**
 * Smoke de Aprende (docs/PLAYBOOK.md §Aprender): en orden, con fotos, progreso en positivo y un «sigue por aquí».
 * Recorrido del producto → «Entendido» → sector con foto, cliente ideal (ES/EN), «Imagínatelo» con la propuesta real.
 *   npm run build && npm run start:demo ; node scripts/smoke-learn.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

async function login(b, email, viewport = { width: 1440, height: 1000 }) {
  const ctx = await b.newContext({ viewport, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${email}"]`);
  await p.waitForURL(/\/admin/);
  return p;
}

(async () => {
  const b = await chromium.launch();
  // Una persona sin nada repasado: el admin de demo (cada smoke arranca con el servidor limpio).
  const p = await login(b, 'admin@enjoy.test');
  await p.goto(`${BASE}/admin/learn`);
  const prog = await p.textContent('[data-testid=progress]');
  assert(!/\b0\s*\/\s*\d/.test(prog) && !/0 de/.test(prog), `sin «0/N»: ${prog.trim().replace(/\s+/g, ' ')}`);
  assert(await p.isVisible('[data-testid=topic-about]'), 'paso 0: por qué existimos, antes que nada');
  assert(await p.isVisible('[data-testid=tour-card]'), 'paso 1: el recorrido del producto');
  const done0 = Number(await p.getAttribute('[data-testid=progress]', 'data-done'));
  // En CI el servidor se comparte entre smokes: solo exigimos «empieza por el paso 0» si aún no está hecho.
  if (done0 === 0) assert((await p.getAttribute('[data-testid=learn-next]', 'href')) === '/admin/learn/empresa', '«Empieza aquí» lleva a «Por qué existimos»');
  await p.goto(`${BASE}/admin/learn/empresa`);
  assert((await p.textContent('h1')).includes('Por qué existimos'), 'el paso 0 abre su ficha');
  assert((await p.textContent('main')).includes('La visión'), 'con sus piezas');
  await p.goto(`${BASE}/admin/learn/general`);
  assert(!(await p.textContent('main')).includes('La visión'), '«Cómo se vende» no repite el paso 0');
  await p.goto(`${BASE}/admin/learn`);
  assert((await p.locator('[data-testid=segment] img').count()) === 4, 'cada sector con su foto de fondo');
  if (OUT) await p.screenshot({ path: `${OUT}/learn-index.png`, fullPage: true });

  // ---- recorrido
  await p.click('[data-testid=tour-card]');
  await p.waitForURL(/\/admin\/learn\/tour/);
  const steps = await p.locator('[data-testid=tour-step]').count();
  assert(steps >= 4, `recorrido con ${steps} pasos`);
  // Cada paso con la UI de verdad: el móvil, la pantalla en marcha y el informe de quien contrata.
  const uis = await p.$$eval('[data-testid=tour-ui]', (els) => els.map((e) => e.dataset.ui));
  assert(uis.includes('phone') && uis.includes('screen') && uis.includes('report'), `recorrido con UI de Enjoy (${uis.join(', ')})`);
  await p.locator('[data-testid=tour-ui][data-ui=screen]').first().scrollIntoViewIfNeeded();
  await p.waitForSelector('[data-testid=tour-ui][data-ui=screen] .es-stage', { timeout: 10000 });
  assert(true, 'la pantalla del recorrido arranca');
  if (OUT) await p.screenshot({ path: `${OUT}/learn-tour.png`, fullPage: true });
  await p.click('[data-testid=tour-got]');
  await p.waitForURL(/ok=tour/);
  const done1 = Number(await p.getAttribute('[data-testid=progress]', 'data-done'));
  assert(done1 >= 1 && (await p.textContent('[data-testid=progress]')).includes(`Ya has completado ${done1} de`), 'progreso en positivo tras el recorrido');
  assert((await p.getAttribute('[data-testid=learn-next]', 'href')) !== '/admin/learn/tour', '«sigue por aquí» avanza al siguiente');

  // ---- sector
  await p.locator('[data-testid=segment]', { hasText: 'Bodas' }).click();
  await p.waitForURL(/\/admin\/learn\/sector\/bodas/);
  assert(await p.isVisible('[data-testid=sector-hero] img'), 'ficha del sector con foto');
  const icp = await p.textContent('[data-testid=sector-icp]');
  assert(icp.includes('Cliente ideal') && icp.includes('Ideal Customer Profile'), 'cliente ideal en español e inglés');
  assert(await p.isVisible('[data-testid=sector-imagine]'), '«Imagínatelo»');
  const frame = p.frameLocator('[data-testid=imagine-preview] iframe >> nth=0');
  assert(await frame.locator('[data-block-type]').first().isVisible(), 'Imagínatelo: la propuesta real, dentro');
  if (OUT) await p.screenshot({ path: `${OUT}/learn-sector.png`, fullPage: true });
  if (await p.isVisible('[data-testid=sector-got]')) {
    await p.click('[data-testid=sector-got]');
    await p.waitForURL(/ok=sector/);
    assert(Number(await p.getAttribute('[data-testid=progress]', 'data-done')) === done1 + 1, 'sector repasado cuenta');
  } else await p.goto(`${BASE}/admin/learn`);
  assert((await p.locator('[data-testid=segment]', { hasText: 'Bodas' }).textContent()).includes('Repasado'), 'la tarjeta del sector dice «Repasado»');

  // ---- móvil: sin desbordes
  const m = await login(b, 'admin@enjoy.test', { width: 390, height: 844 });
  for (const path of ['/admin/learn', '/admin/learn/tour', '/admin/learn/sector/bodas']) {
    await m.goto(`${BASE}${path}`);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 1, `móvil ${path}: sin scroll horizontal (${over}px)`);
  }
  if (OUT) { await m.goto(`${BASE}/admin/learn`); await m.screenshot({ path: `${OUT}/learn-mobile.png`, fullPage: true }); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
