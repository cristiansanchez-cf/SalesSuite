/**
 * Smoke de Aprende (docs/PLAYBOOK.md §Aprender): en orden, con fotos, progreso en positivo y un «sigue por aquí».
 * Recorrido del producto → «Entendido» → sector con foto, cliente ideal (ES/EN), «Imagínatelo» con la propuesta real.
 * Oquea (demo, oquea.localhost): el recorrido pinta la UI de su app y de su consola (app:/console:), no capturas.
 *   npm run build && npm run start:demo ; node scripts/smoke-learn.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

// Otro espacio = otro host (el tenant se resuelve por dominio); *.localhost apunta a la máquina.
const OQUEA = BASE.replace(/\/\/[^:/]+/, '//oquea.localhost');

async function login(b, email, viewport = { width: 1440, height: 1000 }, base = BASE) {
  const ctx = await b.newContext({ viewport, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${base}/admin/login`);
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
  assert(await p.locator('[data-testid=imagine-ui] > *').first().isVisible(), 'Imagínatelo: la UI del producto, sin marco');
  assert((await p.locator('[data-testid=imagine-ui] iframe').count()) === 0, 'Imagínatelo: sin ventana de navegador');
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

  // ---- Oquea: el recorrido con la UI de su app (móvil) y de su consola, con los colores de su tema
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
    const o = await login(b, 'super@cofundo.test', viewport, OQUEA);
    await o.goto(`${OQUEA}/admin/learn/tour`);
    const kinds = await o.$$eval('[data-testid=tour-step]', (els) => els.map((e) => e.querySelector('[data-testid=tour-ui]')?.getAttribute('data-ui') ?? (e.querySelector('img') ? 'img' : 'nada')));
    const w = viewport.width;
    assert(kinds.length === 5 && kinds.every((k) => k === 'app' || k === 'console'), `Oquea ${w}px: los 5 pasos con UI, sin capturas (${kinds.join(', ')})`);
    assert(kinds.includes('app') && kinds.includes('console'), `Oquea ${w}px: móvil de la app y consola del centro`);
    assert((await o.locator('[data-testid=tour-ui] .as-phone').count()) === 4, `Oquea ${w}px: cuatro móviles con su pantalla`);
    const cm = await o.locator('[data-testid=tour-ui] [data-console-mini] [data-viewport]').evaluate((e) => e.getBoundingClientRect().height);
    assert(cm > 80, `Oquea ${w}px: la consola, escalada a su hueco (${Math.round(cm)}px de alto)`);
    const blue = await o.locator('[data-testid=tour-ui] .tn-ui').first().evaluate((e) => getComputedStyle(e).getPropertyValue('--color-primary').trim());
    assert(blue === '55 87 190', `Oquea ${w}px: la UI con el azul de su tema, no el de la consola (${blue})`);
    const over = await o.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 1, `Oquea ${w}px: sin scroll horizontal (${over}px)`);
    if (OUT) await o.screenshot({ path: `${OUT}/learn-tour-oquea-${w}.png`, fullPage: true });
    await o.context().close();
  }

  // ---- Oquea: Aprende por temas de producto (tenant.tour.topics), no por diapositivas; las jugadas, en un solo sitio
  {
    const o = await login(b, 'super@cofundo.test', { width: 1280, height: 900 }, OQUEA);
    await o.goto(`${OQUEA}/admin/learn`);
    const topics = await o.$$eval('[data-testid=topic]', (els) => els.map((e) => e.getAttribute('data-topic')));
    assert(JSON.stringify(topics) === JSON.stringify(['tarjetas', 'panel']), `Oquea: «Qué ofrecemos» son los temas, no las diapositivas (${topics})`);
    await o.goto(`${OQUEA}/admin/learn/t/panel`);
    assert((await o.locator('[data-testid=topic-ui] [data-console-mini]').count()) === 1, 'tema: primero su UI (la consola)');
    assert((await o.locator('[data-testid=topic-section]').count()) === 2, 'tema: qué es, por partes');
    assert((await o.locator('[data-testid=topic-section] [data-console-mini]').count()) === 1, 'tema: cada parte con su pantalla (sin repetir la de arriba)');
    await o.goto(`${OQUEA}/admin/learn/general?t=panel`);
    assert((await o.getAttribute('[data-testid=topic-filter] [data-topic=panel]', 'aria-pressed')) === 'true', '«Cómo se vende»: filtrado por el tema');
    await o.goto(`${OQUEA}/admin/learn/t/no-existe`);
    assert((await o.title()).includes('404') || (await o.locator('[data-testid=learn-topic]').count()) === 0, 'tema que no existe: 404');
    await o.context().close();
  }

  // ---- Contenido en coreano (docs/I18N.md §Contenido): Oquea traduce su contenido al coreano. Quien lee en coreano lo
  // ve traducido al vender, con la marca «traducción automática»; en Configurar, el original (allí se edita).
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
    await ctx.addCookies([{ name: 'ss_locale', value: 'ko', url: OQUEA }]);
    const k = await ctx.newPage();
    await k.goto(`${OQUEA}/admin/login`);
    await k.click('[data-testid="demo-super@cofundo.test"]');
    await k.waitForURL(/\/admin/);
    await k.goto(`${OQUEA}/admin/learn/tour`);
    const titles = await k.$$eval('[data-testid=tour-step] h2', (els) => els.map((e) => e.textContent.trim()));
    assert(titles[0] === '다이빙 센터가 다이빙을 만듭니다' && titles.length === 5, `coreano: el recorrido, traducido (${titles[0]})`);
    assert(await k.isVisible('[data-testid=auto-translated]'), 'coreano: con la marca de traducción automática');
    await k.goto(`${OQUEA}/admin/learn`);
    assert((await k.textContent('main')).includes('공유 카드'), 'coreano: los temas de Aprende, traducidos');
    await k.goto(`${OQUEA}/admin/learn/t/tarjetas`);
    assert((await k.textContent('main')).includes('모든 다이빙에 센터 이름을'), 'coreano: sus módulos, traducidos');
    await k.goto(`${OQUEA}/admin/catalog`);
    const cat = await k.textContent('main');
    assert(cat.includes('Tu nombre en cada inmersión') && !cat.includes('모든 다이빙에 센터 이름을'), 'coreano: en Configurar, el original (se edita el español)');
    assert(!(await k.isVisible('[data-testid=auto-translated]')), 'coreano: en Configurar, sin marca');
    if (OUT) { await k.goto(`${OQUEA}/admin/learn/tour`); await k.screenshot({ path: `${OUT}/learn-tour-oquea-ko.png`, fullPage: true }); }
    await ctx.close();
    // Propuesta en coreano: los textos de su módulo, traducidos, y los fijos de la propuesta en coreano.
    const pub = await (await b.newContext()).newPage();
    await pub.goto(`${OQUEA}/d/demo-oquea-ko-5Rt8?ver=scroll`);
    const body = await pub.textContent('body');
    assert(body.includes('모든 다이빙에 센터 이름을') && body.includes('서울 다이브 맞춤 제안서'), 'coreano: la propuesta pública, traducida');
    assert(!body.includes('Tu nombre en cada inmersión'), 'coreano: sin el original del módulo');
    // En español, el original y sin marca.
    const e = await login(b, 'super@cofundo.test', undefined, OQUEA);
    await e.goto(`${OQUEA}/admin/learn/tour`);
    assert((await e.textContent('[data-testid=tour-step] h2')).trim() === 'El centro crea la inmersión', 'español: el original');
    assert(!(await e.isVisible('[data-testid=auto-translated]')), 'español: sin marca');
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
