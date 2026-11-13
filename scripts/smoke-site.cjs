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

  // La propuesta: «Simulación» sobre su web, el sello real a su tamaño; el cursor lo pulsa y se abre sciscreen.com.
  await p.goto(`${S}/d/demo-sciscreen-Vv7p#3`);
  await p.waitForSelector('[data-module=site-verify] .sv-shot');
  assert((await p.textContent('.sv-bar .sv-url-site')).includes('valleverde.example'), 'su web, con su dirección en la barra');
  assert(await p.isVisible('.sv-tag') && (await p.textContent('.sv-tag')).trim() === 'Simulación', '«Simulación» sobre su web');
  assert(/Verificado a día \d{1,2} \w{3} \d{4}/.test(await p.textContent('.sv-seal')), `el sello real, «Verificado a día» y la fecha (${(await p.textContent('.sv-seal')).trim()})`);
  await p.waitForFunction(() => document.querySelector('.sv-ss')?.getAttribute('data-open') === '1', null, { timeout: 9000 });
  assert(true, 'el cursor pulsa el sello y se abre la página del sello');
  assert(/^sciscreen\.com\/es\/sello\/[a-z0-9]{16}$/.test((await p.textContent('.sv-bar .sv-url-seal')).trim()) && await p.isVisible('.sv-bar .sv-url-seal'), 'la barra pasa a sciscreen.com/es/sello/…');
  const ss = await p.textContent('.sv-ss');
  assert(/Valle Verde Naturales/.test(ss) && /Vigente/.test(ss) && /URL verificada/.test(ss) && /Vigente hasta/.test(ss) && /Reglamento \(UE\) 432\/2012/.test(ss), 'la página del sello: marca, estado, URL verificada, fechas y la evidencia de cada afirmación');
  assert(!(await p.$('.sv-meter')) && !/Nivel de evidencia/i.test(ss), 'sin indicador global de nivel de evidencia');
  assert(await p.isVisible('.sv-tag'), '«Simulación» también con la página del sello abierta');
  if (OUT) await p.screenshot({ path: `${OUT}/site-verify.png` });
  await p.click('.sv-bar [data-sv-back]');
  assert((await p.getAttribute('.sv-ss', 'data-open')) === '0' && (await p.textContent('.sv-bar .sv-url-site')).includes('valleverde'), '«←» vuelve a su web');
  await p.click('.sv-seal');
  assert((await p.getAttribute('.sv-ss', 'data-open')) === '1', 'y se abre pulsando el sello');

  // El módulo en-sus-tiendas (ya fuera del catálogo: el sello va solo en la web de la marca) sigue funcionando para las propuestas que lo usan:
  // y foco para verse en una web cargada que no controla.
  await p.goto(`${S}/d/demo-sciscreen-Tn4q#3`);
  await p.waitForSelector('[data-module=site-verify] .sv-shot');
  assert((await p.textContent('.sv-bar .sv-url-site')).includes('laboticaverde.example'), 'fabricante: la ficha de su producto en una tienda');
  await p.waitForFunction(() => ['seal', 'move', 'press'].includes(document.querySelector('.sv-stage')?.getAttribute('data-step') ?? ''), null, { timeout: 5000 });
  assert(true, 'fabricante: el sello entra y el foco lo señala');
  await p.waitForTimeout(1000); // que aterrice: la caída empieza más grande
  const k = await p.$eval('.sv-seal .ss', (e) => { const r = e.getBoundingClientRect(); const pg = document.querySelector('.sv-page').getBoundingClientRect(); return Math.round(r.width / pg.width * 1440); });
  assert(k >= 270 && k <= 300, `fabricante: el sello más grande (placa ×1,5 ≈ 284 px de 1440: ${k})`);
  assert(await p.$eval('.sv-pop', (e) => getComputedStyle(e).animationName.includes('sv-drop')), 'fabricante: el sello entra con animación');
  assert(await p.$eval('.sv-dim', (e) => getComputedStyle(e).backgroundImage.includes('radial-gradient')), 'fabricante: foco sobre el sello');
  await p.waitForFunction(() => document.querySelectorAll('.sv-ss[data-open="1"]').length === 1, null, { timeout: 9000 });
  assert(/El magnesio contribuye/.test(await p.textContent('.sv-ss')), 'fabricante: se abre la página del sello con sus afirmaciones');

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

  // Combinaciones de serie de SciScreen: un clic monta la propuesta del laboratorio, con el sello en su web (docs/PROPOSAL_PRESETS.md).
  await p.goto(`${S}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=title]', 'SciScreen · fabricante E2E');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.waitForTimeout(800);
  await p.click('[data-testid=quick-start] .co-chip:has-text("Complementos")');
  await p.waitForSelector('[data-testid=preset-ready] [data-testid=preset-tpl]');
  const tpls = await p.textContent('[data-testid=preset-ready]');
  assert(['Marca con tienda online', 'Marca, presentación completa', 'Laboratorio con marca propia', 'Laboratorio, presentación completa', 'Laboratorio, primera reunión', 'Lo cuentas tú en la reunión'].every((n) => tpls.includes(n)), 'las seis combinaciones de serie de SciScreen');
  await p.click('[data-testid=preset-ready] [data-testid=preset-tpl]:has-text("Laboratorio con marca propia")');
  await p.waitForSelector('[data-testid=item][data-item-key=lo-que-te-pasa-fabricante]', { timeout: 8000 });
  const fab = await p.$$eval('[data-testid=item]', (els) => els.map((e) => e.dataset.itemKey));
  assert(JSON.stringify(fab) === JSON.stringify(['portada', 'lo-que-te-pasa-fabricante', 'su-web', 'el-informe', 'el-sello', 'pricing']), `laboratorio, de un clic: ${fab.join(' → ')}`);
  if (OUT) await p.screenshot({ path: `${OUT}/sciscreen-preset.png`, fullPage: true });

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
