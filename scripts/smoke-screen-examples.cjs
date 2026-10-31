/**
 * Smoke de Catálogo → Mensajes de la pantalla: el admin cambia los ejemplos (mensajes, pies de foto, dedicatorias) y
 * salen en la pantalla en vivo de las propuestas sin texto propio; «Volver a los de ejemplo» los deja como el kit.
 *   npm run build && npm run start:demo ; node scripts/smoke-screen-examples.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const MSG = '¡Feliz cumple, Marta! Hoy invitas tú';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // ---- Desde el Catálogo: los de ejemplo, para cambiarlos.
  await p.goto(`${BASE}/admin/catalog`);
  await Promise.all([p.waitForURL(/\/admin\/catalog\/pantalla/), p.click('[data-testid=screen-examples-link]')]);
  assert((await p.textContent('[data-testid=examples-source]')).includes('de ejemplo'), 'de entrada, los de ejemplo del kit');
  assert((await p.inputValue('[name=messages-text-1]')).includes('Pídele el sí'), 'se ven para cambiarlos');
  await p.fill('[name=messages-by-0]', 'Javi');
  await p.fill('[name=messages-text-0]', MSG);
  await p.fill('[name=messages-by-1]', '');
  await p.fill('[name=messages-text-1]', '');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=examples-save]')]);
  assert((await p.textContent('[data-testid=examples-source]')).includes('vuestros'), 'guardados: salen los vuestros');
  assert((await p.inputValue('[name=photos-text-0]')).length > 0, 'los grupos sin tocar siguen con los de ejemplo');

  // ---- En una propuesta: la dedicatoria (sin texto propio) sale con su mensaje.
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Sala Ejemplos');
  await p.fill('[data-testid=create-form] [name=title]', 'Propuesta para Sala Ejemplos');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  if (!(await p.$('[data-item-key=pantalla-en-vivo]'))) { await p.click('[data-testid=add-pantalla-en-vivo]'); await settle(); }
  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();
  const pub = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await pub.goto(`${url}?ver=scroll`, { waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  const labels = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => (e.querySelector('b') ?? e).textContent.trim()));
  const i = labels.findIndex((l) => /dedicatoria/i.test(l));
  assert(i >= 0, `hay pantalla de dedicatoria (${labels.join(', ')})`);
  await pub.locator('[data-module=live-screen]').scrollIntoViewIfNeeded();
  await pub.click(`[data-scene-btn="${i}"]`);
  await pub.waitForTimeout(3600);
  const stage = await pub.textContent('[data-module=live-screen] .es-stage');
  assert(stage.includes(MSG) && stage.includes('Javi'), 'la pantalla enseña su mensaje, firmado');

  // ---- Volver a los de ejemplo.
  await p.goto(`${BASE}/admin/catalog/pantalla`);
  await Promise.all([p.waitForURL(/ok=reset/), p.click('[data-testid=examples-reset]')]);
  assert((await p.textContent('[data-testid=examples-source]')).includes('de ejemplo'), 'vuelven los de ejemplo');
  await pub.reload({ waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  await pub.locator('[data-module=live-screen]').scrollIntoViewIfNeeded();
  await pub.click(`[data-scene-btn="${i}"]`);
  await pub.waitForTimeout(3600);
  assert(!(await pub.textContent('[data-module=live-screen] .es-stage')).includes(MSG), 'y la propuesta deja de enseñar el suyo');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
