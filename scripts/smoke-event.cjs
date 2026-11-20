/**
 * Smoke de promotoras y festivales (docs/PAQUETES.md §Promotoras y festivales): una promotora no se cierra con paquetes
 * al mes. «Cierre» → «Acuerdo» (lo típico: llevan Enjoy a sus salas; solo lo acordado) o «Pago por evento» (atajos de
 * las tarifas por evento: promotora 100 €, festival 500 €). Al cerrar por evento sale «… €/evento».
 *   npm run build && npm run start:demo ; node scripts/smoke-event.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  const create = async (name) => {
    await p.goto(`${BASE}/admin/accounts?ver=all`);
    await p.click('[data-testid=add-open]'); await p.click('[data-testid=new-account]');
    await p.fill('[data-testid=new-account-form] [name=name]', name);
    await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
    return p.url().split('?')[0];
  };

  // Una promotora: «Acuerdo» (lo de siempre, sin paquetes al mes).
  const promo = await create('Promo Acuerdo Smoke');
  await p.click('[data-testid=kind-change]');
  await Promise.all([p.waitForURL(/ok=kind/), p.click('[data-testid=kind-switch-promotora]')]);
  assert(await p.isVisible('[data-testid=closing-deal]') || await p.isVisible('label:has([data-testid=closing-deal])'), 'promotora: «Acuerdo» y «Pago por evento»');
  assert(!(await p.isVisible('[data-testid=agreement-pkgs]')), 'sin paquetes al mes');
  await p.fill('[data-testid=agreement-terms]', 'Lleva Enjoy a sus 3 salas; 20 % para ellos de lo que entre.');
  await Promise.all([p.waitForURL(/ok=agClosed/), p.click('[data-testid=agreement-save]')]);
  assert((await p.textContent('[data-testid=agreement-active]')).includes('3 salas'), 'cerrada con acuerdo');

  // Otra: pago por evento con el atajo de promotora.
  await create('Promo Evento Smoke');
  await p.click('[data-testid=kind-change]');
  await Promise.all([p.waitForURL(/ok=kind/), p.click('[data-testid=kind-switch-promotora]')]);
  await p.click('label:has([data-testid=closing-event])');
  assert(await p.isVisible('[data-testid=agreement-event]'), '«Pago por evento»');
  const hints = await p.locator('[data-testid=event-hint]').allTextContents();
  assert(hints.some((h) => h.includes('Promotora') && h.includes('100')) && hints.some((h) => h.includes('Festival') && h.includes('500')), `atajos: ${hints.join(' | ')}`);
  await p.locator('[data-testid=event-hint]', { hasText: 'Promotora' }).click();
  assert((await p.inputValue('[data-testid=event-price]')) === '100', 'el atajo rellena 100');
  await p.fill('[data-testid=event-price]', '120');
  await p.click('label:has([data-testid=event-pkg-album])');
  await Promise.all([p.waitForURL(/ok=agClosed/), p.click('[data-testid=event-save]')]);
  assert((await p.textContent('[data-testid=agreement-price]')).includes('/evento'), `precio por evento: ${(await p.textContent('[data-testid=agreement-price]')).trim()}`);
  assert((await p.textContent('[data-testid=agreement-packages]')).includes('Álbum'), 'con lo que incluye');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
