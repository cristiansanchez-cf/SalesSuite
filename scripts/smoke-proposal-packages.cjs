/**
 * Smoke de Paquetes en la propuesta (docs/PAQUETES.md): en el editor, «Paquetes» → Canciones gratis + Álbum + Pantalla
 * (local grande) → la diapositiva «Paquetes» va antes del precio, con lo que incluye cada uno y el total; el comercial no
 * pone otro precio (solo un admin). En el enlace público se ve igual.
 *   npm run build && npm run start:demo ; node scripts/smoke-proposal-packages.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=title]', 'Paquetes · E2E');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Sala Grande');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.click('[data-testid=add-pricing]'); await settle();

  assert(await p.isVisible('[data-testid=builder-packages]'), 'editor: sección «Paquetes»');
  assert(!(await p.isVisible('[data-testid=bpkg-custom]')), 'el comercial no pone otro precio');
  await p.click('[data-testid=builder-packages] button:has-text("Grande")');
  await p.check('[data-testid=bpkg-free-canciones]');
  await p.check('[data-testid=bpkg-album]');
  await p.check('[data-testid=bpkg-pantalla]');
  await p.click('[data-testid=bpkg-apply]'); await settle();
  assert((await p.textContent('[data-testid=bpkg-total]')).includes('100'), 'total: 2 × 50 € (canciones gratis)');
  const order = await p.$$eval('[data-testid=item]', (els) => els.map((e) => e.dataset.itemKey));
  assert(order.indexOf('paquetes') >= 0 && order.indexOf('paquetes') < order.indexOf('pricing'), `la diapositiva va antes del precio (${order})`);

  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();
  const v = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  await v.goto(url, { waitUntil: 'networkidle' });
  const offer = v.locator('[data-block-type=packages-offer]');
  assert((await offer.locator('[data-testid=offer-packages] article').count()) === 3, 'enlace público: los 3 paquetes');
  assert((await offer.locator('[data-testid=offer-free]').count()) === 1, 'Canciones: gratis');
  assert((await offer.locator('[data-testid=offer-total]').textContent()).includes('100'), 'y el total');
  assert((await offer.textContent()).includes('Software de pantallas'), 'con lo que incluye cada uno');
  if (process.env.OUT) await offer.screenshot({ path: `${process.env.OUT}/offer.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
