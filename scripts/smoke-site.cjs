/**
 * Smoke de «Su web» (docs/PERSONALIZE.md §Su web) y del módulo site-verify (SciScreen): en el editor se captura su web
 * (en demo, una web de ejemplo) y en la propuesta el cursor pulsa el sello y se abre el registro.
 *   npm run build && npm run start:demo ; node scripts/smoke-site.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const port = new URL(BASE).port || '4321';
const S = `http://sciscreen.localhost:${port}`;
const DOSSIER = '00000000-0000-4000-8000-0000005c0d51';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));

  // La propuesta: el sello sobre su web; el cursor lo pulsa y se abre el registro.
  await p.goto(`${S}/d/demo-sciscreen-Vv7p#3`);
  await p.waitForSelector('[data-module=site-verify] .sv-shot');
  assert((await p.textContent('.sv-bar em')).includes('valleverde.example'), 'su web, con su dirección en la barra');
  await p.waitForFunction(() => document.querySelector('.sv-record')?.getAttribute('data-open') === '1', null, { timeout: 8000 });
  assert(true, 'el cursor pulsa el sello y se abre el registro');
  const rec = await p.textContent('.sv-record');
  assert(/Vigente/.test(rec) && /Nivel de evidencia/i.test(rec) && /Respaldada/.test(rec) && /Valle Verde Naturales/.test(rec), 'el registro: estado, nivel de evidencia y afirmaciones');
  const h = await p.$eval('.sv-seal img', (i) => i.getBoundingClientRect().height);
  assert(h >= 72, `el sello, entero y de 72 px de alto o más (${Math.round(h)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/site-verify.png` });
  await p.click('[data-sv-close]');
  assert((await p.getAttribute('.sv-record', 'data-open')) === '0', 'se cierra');
  await p.click('.sv-seal');
  assert((await p.getAttribute('.sv-record', 'data-open')) === '1', 'y se abre pulsando el sello');

  // El editor: «Su web» con la dirección de la ficha; una web que no se deja, el motivo; otra, la captura nueva.
  await p.goto(`${S}/admin/login`);
  await p.click('[data-testid="demo-super@cofundo.test"]');
  await p.waitForLoadState('load');
  await p.goto(`${S}/admin/dossiers/${DOSSIER}`);
  await p.waitForSelector('[data-testid=media-site]');
  assert(await p.isVisible('[data-testid=media-site] .site-thumb img'), 'el editor enseña la captura de su web');
  assert(!(await p.isVisible('[data-testid=media-logo]')), 'sin fotos ni vídeo: este espacio no los usa');
  await p.fill('[data-testid=media-site-input]', 'noexiste.com');
  await p.click('[data-testid=media-site-shoot]');
  await p.waitForSelector('[data-testid=media-site-error]');
  assert(/sube la captura a mano/i.test(await p.textContent('[data-testid=media-site-error]')), 'una web que no se deja: el motivo y subirla a mano');
  await p.fill('[data-testid=media-site-input]', 'www.otramarca.example/tienda');
  await p.click('[data-testid=media-site-shoot]');
  await p.waitForFunction(() => document.querySelector('[data-testid=media-site-url]')?.textContent?.includes('otramarca'), null, { timeout: 20000 });
  assert(true, 'captura nueva, con su dirección');

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
