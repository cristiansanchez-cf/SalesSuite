/**
 * Smoke de «Google bien hecho» en la ficha de la empresa (docs/CRM_DINAMICO.md §15), con el Google de pruebas
 * (AI_RESEARCH_FIXTURE=1, sin clave): buscar → resultados con su ficha, web y valoración → «Es este» → se guarda,
 * se pone la ciudad y se apuntan las redes y el email de su web. La lista ya no tiene «Completar con Google».
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-google.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  await p.goto(`${BASE}/admin/accounts?ver=all`);
  assert(!(await p.isVisible('[data-testid=google-fill]')), 'la lista ya no tiene «Completar con Google»');

  // Una empresa nueva, sin ciudad.
  await p.click('[data-testid=new-account]');
  await p.fill('[data-testid=new-account-form] [name=name]', 'Sala Brisa');
  await p.selectOption('[data-testid=new-account-form] [name=zoneId]', '');
  await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);

  // Google vs. IA, explicado.
  assert((await p.textContent('[data-testid=google-box]')).includes('Instagram, Facebook, LinkedIn y email'), 'qué hace «Buscar en Google»');
  assert((await p.textContent('[data-testid=ai-research]')).includes('«Buscar en Google», en cambio'), 'y en qué se diferencia de la IA');
  assert((await p.inputValue('#google-q')) === 'Sala Brisa', 'busca por su nombre (y se puede cambiar)');

  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=google-search]')]);
  await p.waitForSelector('[data-testid=google-result]');
  const first = p.locator('[data-testid=google-result]').first();
  assert((await p.locator('[data-testid=google-result]').count()) === 2, 'resultados de Google');
  assert((await first.locator('a[target=_blank]').first().getAttribute('href')).startsWith('https://maps.google.com/'), 'el nombre abre su ficha de Google');
  assert((await first.locator('a[href^="https://salabrisa.test"]').count()) === 1, 'su web, clicable');
  assert((await first.textContent()).includes('★ 4,4') && (await first.textContent()).includes('312 reseñas'), 'valoración y reseñas');
  if (OUT) await p.screenshot({ path: `${OUT}/google-results.png`, fullPage: true });

  await Promise.all([p.waitForURL(/ok=google/), first.locator('[data-testid=google-apply]').click()]);
  const flash = await p.textContent('main');
  assert(/Guardado de Google: .*teléfono.*Instagram.*Facebook/.test(flash) && flash.includes('ciudad: Valencia'), 'dice qué ha rellenado y la ciudad');
  const links = await p.$$eval('[data-testid=contact-links] a', (xs) => xs.map((x) => x.getAttribute('href')));
  assert(links.includes('https://www.instagram.com/salabrisa/') && links.includes('https://www.facebook.com/salabrisa') && links.includes('mailto:hola@salabrisa.test'), 'redes y email de su web');
  assert((await p.textContent('[data-testid=google-profile]')).includes('★ 4,4'), 'su valoración en la ficha');
  if (OUT) await p.screenshot({ path: `${OUT}/google-applied.png`, fullPage: true });

  await p.goto(`${BASE}/admin/accounts?ver=all&q=Sala%20Brisa`);
  assert((await p.textContent('[data-testid=account][data-name="Sala Brisa"]')).includes('Valencia'), 'en la lista, ya con su ciudad');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
