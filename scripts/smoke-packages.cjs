/**
 * Smoke de Paquetes (docs/PAQUETES.md): el admin ve los 4 paquetes de Enjoy en Tarifas y cambia uno; en la ficha,
 * «Cierre» → paquetes (Canciones gratis + Pantalla + Álbum), el precio normal sale del tamaño y con «Otro precio» se ve el
 * descuento; al cerrar es cliente con sus paquetes (ficha y Clientes). El enlace de Stripe, en un modal.
 *   npm run build && npm run start:demo ; node scripts/smoke-packages.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const SOL = '00000000-0000-4000-8000-0000000ac001';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  await p.goto(`${BASE}/admin/prices`);
  assert((await p.locator('[data-testid=package]').count()) === 4, 'Tarifas: los 4 paquetes de Enjoy');
  const fid = p.locator('[data-testid=package][data-key=fidelizacion]');
  await fid.locator('summary').click();
  await fid.locator('[data-testid=package-medium]').fill('35');
  await Promise.all([p.waitForURL(/ok=pkg/), fid.locator('[data-testid=package-save]').click()]);
  assert((await p.locator('[data-testid=package][data-key=fidelizacion]').textContent()).includes('35'), 'cambiar precio: mediano a 35 €');

  await p.goto(`${BASE}/admin/accounts/${SOL}`);
  assert(await p.isVisible('[data-testid=agreement-pkgs]'), 'Cierre: paquetes a la vista (sin pestañas de pago)');
  assert(!(await p.isVisible('[data-testid=charge]')), 'el enlace de Stripe no se ve de primeras');
  await p.click('[data-testid=closing-link]');
  assert(await p.isVisible('[data-testid=closing-pay-dialog] [data-testid=charge]'), '«Generar enlace de pago» → modal');
  await p.keyboard.press('Escape');
  await p.check('[data-testid=pkg-free-canciones]');
  await p.check('[data-testid=pkg-pantalla]');
  await p.check('[data-testid=pkg-album]');
  assert(await p.isChecked('[data-testid=pkg-canciones]'), '«gratis» marca también el paquete');
  const list = (await p.textContent('[data-list]')).trim();
  assert(/^50/.test(list), `precio normal (sin las canciones gratis): ${list}`);
  await p.click('label:has([data-testid=price-custom])');
  await p.fill('[data-testid=price-input]', '40');
  assert((await p.textContent('[data-discount]')).includes('20'), 'otro precio: −20 %');
  await Promise.all([p.waitForURL(/ok=agClosed/), p.click('[data-testid=agreement-save]')]);
  const chips = await p.textContent('[data-testid=agreement-packages]');
  assert(chips.includes('Canciones (gratis)') && chips.includes('Álbum'), `cliente con sus paquetes: ${chips.replace(/\s+/g, ' ').trim()}`);
  assert((await p.textContent('[data-testid=agreement-price]')).includes('20 %'), 'y su precio con el descuento');
  assert((await p.textContent('[data-testid=agreement-free]')).includes('las propinas son para Enjoy'), 'las condiciones de lo gratis, a la vista');

  await p.goto(`${BASE}/admin/clientes`);
  assert((await p.textContent('[data-testid=client-row][data-name="Club Sol"] [data-testid=client-packages]')).includes('en pantalla'), 'Clientes: lo que tiene contratado');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
