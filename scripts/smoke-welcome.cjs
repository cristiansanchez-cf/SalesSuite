/**
 * Smoke de la bienvenida paso a paso (/admin/welcome): Inicio la recuerda, se recorre pantalla a pantalla, termina
 * creando la primera propuesta y deja de recordarse. Los admins tienen además el paso «Prepara a tu equipo».
 *   npm run build && npm run start:demo ; node scripts/smoke-welcome.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

async function login(b, email, mobile = false) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' } : { viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${email}"]`);
  await p.waitForURL(/\/admin/);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const p = await login(b, 'rep@enjoy.test', true);
  await p.goto(`${BASE}/admin/inicio`);
  assert(await p.isVisible('[data-testid=welcome-resume]'), 'Inicio recuerda terminar la bienvenida');
  await p.click('[data-testid=welcome-resume]');
  await p.waitForURL(/\/admin\/welcome/);

  const seen = [];
  for (let i = 0; i < 10; i++) {
    const step = await p.getAttribute('[data-testid=welcome]', 'data-step');
    seen.push(step);
    if (OUT && ['hello', 'how', 'first'].includes(step)) await p.screenshot({ path: `${OUT}/welcome-${step}.png`, fullPage: true });
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) assert(false, `paso ${step} cabe en el móvil (mide ${w})`);
    if (step === 'first') break;
    await p.click('[data-testid=welcome-next]');
    await p.waitForLoadState();
  }
  assert(seen.join(',') === 'hello,sell,who,how,terms,first', `comercial: 6 pasos en orden (${seen.join(',')})`);
  assert((await p.textContent('[data-testid=welcome-progress]')).includes('Paso 6 de 6'), 'progreso visible');

  await p.click('[data-testid=welcome-back]');
  await p.waitForLoadState();
  assert(await p.isVisible('[data-testid=welcome-terms-pending]'), 'condiciones sin acordar: mensaje humilde');

  // «A quién»: cada sector abre su ficha y se vuelve a la bienvenida.
  await p.goto(`${BASE}/admin/welcome?step=3`);
  await p.click('[data-testid=welcome-sector] >> nth=0');
  await p.waitForURL(/\/admin\/learn\/sector\/[^?]+\?from=welcome/);
  assert(await p.isVisible('[data-testid=sector-hero]') && (await p.locator('[data-testid=persona]').count()) > 0, 'ficha del sector: cabecera y quién está en la sala');
  if (OUT) await p.screenshot({ path: `${OUT}/welcome-sector.png`, fullPage: true });
  await p.click('[data-testid=sector-back]');
  await p.waitForURL(/\/admin\/welcome\?step=3/);
  await p.goto(`${BASE}/admin/welcome?step=6`);

  // Termina haciendo algo: la primera propuesta.
  await p.fill('[data-testid=welcome-create] [name=company]', 'Sala Luna');
  await p.click('[data-testid=welcome-create] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  assert((await p.textContent('body')).includes('Propuesta para Sala Luna'), 'crea la propuesta y abre el editor');
  await p.goto(`${BASE}/admin/inicio`);
  assert(!(await p.isVisible('[data-testid=welcome-resume]')), 'terminada: Inicio ya no la recuerda');
  await p.goto(`${BASE}/admin/start`);
  assert(await p.isVisible('[data-testid=welcome-again]'), '«Empieza aquí» permite volver a verla');

  // Admin: la misma bienvenida (el CEO también vende); preparar el espacio va aparte, en Inicio. Saltarla cuenta como vista.
  const a = await login(b, 'admin@enjoy.test');
  await a.goto(`${BASE}/admin/welcome?step=6`);
  assert((await a.getAttribute('[data-testid=welcome]', 'data-step')) === 'first', 'admin: los mismos 6 pasos, sin mezclar la preparación del espacio');
  await a.click('[data-testid=welcome-skip]');
  await a.waitForURL(/\/admin\/inicio/);
  assert(!(await a.isVisible('[data-testid=welcome-resume]')), 'saltar la bienvenida la da por vista');
  await b.close();
})();
