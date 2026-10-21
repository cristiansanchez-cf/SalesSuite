/**
 * Smoke de «Pantallas» de la pantalla en vivo (docs/PERSONALIZE.md §Pantallas): el comercial monta, sin JSON, la
 * propuesta simplificada de una promotora: sus visuales con el QR pequeño y la foto a pantalla completa; un anuncio
 * con texto y otro con su cartel; «Encontrar el amor» (QR en grande, fotos en grande) y un carrusel de fotos.
 *   npm run build && npm run start:demo ; node scripts/smoke-live-scenes.cjs
 */
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const FIX = path.join(__dirname, 'fixtures');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const AD = 'Molan los 2000 ya tiene nueva fecha!!';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Promotora Escenas');
  await p.fill('[data-testid=create-form] [name=title]', 'Propuesta para Promotora Escenas');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.click('[data-testid=add-pantalla-en-vivo]'); await settle();
  // Dos fotos (una hace de cartel) y su vídeo.
  await p.setInputFiles('[data-testid=media-photo-input]', path.join(FIX, 'photo.webp'));
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=media-photos] img').length === 1);
  await p.setInputFiles('[data-testid=media-photo-input]', path.join(FIX, 'logo.png'));
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=media-photos] img').length === 2);
  await p.setInputFiles('[data-testid=media-video-input]', path.join(FIX, 'visual.webm'));
  await p.waitForSelector('[data-testid=media-video] video');

  // ---- Pantallas, sin JSON: se vacía la lista y se monta la nueva.
  const ed = p.locator('[data-item-key=pantalla-en-vivo] [data-testid=scenes-editor]');
  await ed.locator('[data-testid=scenes-open]').click();
  while (await ed.locator('[data-testid=scene-remove]').count()) await ed.locator('[data-testid=scene-remove]').first().click();
  const add = async (kind) => { await ed.locator('[data-testid=scene-add]').selectOption(kind); return ed.locator('[data-testid=scene-row]').last(); };
  await (await add('tp.idle')).locator('[data-testid=scene-label]').fill('Sus visuales');
  await (await add('tp.full')).locator('[data-testid=scene-label]').fill('Su foto, en grande');
  let r = await add('club.promo');
  await r.locator('[data-testid=scene-label]').fill('Anuncio');
  await r.locator('[data-testid=scene-text]').fill(AD);
  r = await add('club.promo');
  await r.locator('[data-testid=scene-label]').fill('Anuncio con foto');
  await r.locator('[data-testid=scene-text]').fill('Nueva fecha');
  await r.locator('[data-testid=scene-photo]').last().click();
  await ed.locator('[data-testid=scene-add-love]').click();
  r = await add('club.carousel');
  await r.locator('[data-testid=scene-label]').fill('Carrusel');
  assert((await r.locator('[data-testid=scene-photo][aria-pressed=true]').count()) === 2, 'el carrusel coge sus fotos');
  if (OUT) await p.screenshot({ path: `${OUT}/scenes-editor.png`, fullPage: true });
  await ed.locator('[data-testid=scenes-save]').click(); await settle();
  await p.waitForFunction(() => !document.querySelector('[data-item-key=pantalla-en-vivo] [data-testid=scene-row]'));
  assert((await ed.textContent()).includes('Pantallas hechas para esta propuesta · 9'), 'guardadas: 9 pantallas, hechas para esta propuesta');
  assert(!(await p.isVisible('[data-item-key=pantalla-en-vivo] .co-alert--rejection')), 'sin errores en el módulo');

  // ---- La propuesta, como la ve el cliente.
  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();
  const pub = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await pub.goto(`${url}?ver=scroll`, { waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  const labels = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => (e.querySelector('b') ?? e).textContent.trim()));
  assert(labels.join('|') === 'Sus visuales|Su foto, en grande|Anuncio|Anuncio con foto|¿Quién busca el amor?|El elegido|¿Te interesa?|«1!»|Carrusel', `en orden: ${labels.join(', ')}`);
  const stage = '[data-module=live-screen] .es-stage';
  const open = async (label, wait = 2600) => { await pub.click(`[data-scene-btn="${labels.indexOf(label)}"]`); await pub.waitForTimeout(wait); };
  await pub.locator('[data-module=live-screen]').scrollIntoViewIfNeeded();
  // Sus visuales y su vídeo, en una: su vídeo de fondo y el QR en pequeño.
  await open('Sus visuales', 3200);
  const vsrc = await pub.$eval(`${stage} video`, (v) => v.currentSrc || v.src).catch(() => '');
  assert(vsrc.includes('/demo-media/') && (await pub.isVisible(`${stage} .es-qr-card`)), 'sus visuales: su vídeo de fondo y el QR pequeño');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-visuals.png` });
  await open('Anuncio');
  assert((await pub.textContent(stage)).includes(AD), 'anuncio con su texto');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-ad.png` });
  await open('Anuncio con foto');
  assert((await pub.getAttribute(`${stage} img.es-np-img`, 'src'))?.startsWith('/demo-media/') && (await pub.textContent(stage)).includes('Nueva fecha'), 'anuncio con su cartel a pantalla completa');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-ad-photo.png` });
  await open('¿Quién busca el amor?', 600);
  assert((await pub.textContent(`${stage} .es-cta-title`)).includes('encontrar el amor') && (await pub.isVisible(`${stage} .es-qr-box`)), '«Encontrar el amor»: QR en grande con la pregunta');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-love.png` });
  await open('El elegido', 3200);
  assert((await pub.textContent(stage)).includes('Busca el amor'), 'el elegido, en grande');
  await open('Carrusel', 1200);
  assert((await pub.$$(`${stage} .es-car-img`)).length === 2, 'carrusel con sus 2 fotos');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-carousel.png` });

  // ---- Sin pantalla de sus visuales: el reclamo se convierte en ella (su vídeo de fondo + QR pequeño), sin «Su vídeo».
  await ed.locator('[data-testid=scenes-open]').click();
  while (await ed.locator('[data-testid=scene-remove]').count()) await ed.locator('[data-testid=scene-remove]').first().click();
  await (await add('club.idle')).locator('[data-testid=scene-label]').fill('Reclamo');
  await (await add('club.photo')).locator('[data-testid=scene-label]').fill('Foto');
  await ed.locator('[data-testid=scenes-save]').click(); await settle();
  await p.waitForFunction(() => !document.querySelector('[data-item-key=pantalla-en-vivo] [data-testid=scene-row]'));
  await pub.reload({ waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  const two = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => (e.querySelector('b') ?? e).textContent.trim()));
  assert(two.join('|') === 'Reclamo|Foto', `reclamo + su vídeo, en una (${two.join(', ')})`);
  assert((await pub.textContent('[data-scene-btn="0"]')).includes('QR en pequeño'), 'el reclamo cuenta: sus visuales de fondo y el QR en pequeño');
  await pub.click('[data-scene-btn="0"]'); await pub.waitForTimeout(3200);
  assert(((await pub.$eval(`${stage} video`, (v) => v.currentSrc || v.src).catch(() => '')).includes('/demo-media/')) && (await pub.isVisible(`${stage} .es-qr-card`)), 'el reclamo enseña su vídeo y el QR pequeño');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/scenes-reclamo-video.png` });

  // ---- Volver a las del catálogo.
  await ed.locator('[data-testid=scenes-open]').click();
  await ed.locator('[data-testid=scenes-reset]').click(); await settle();
  await p.waitForFunction(() => !document.querySelector('[data-item-key=pantalla-en-vivo] [data-testid=scenes-editor]')?.textContent?.includes('hechas para esta'));
  assert(true, 'vuelve a las del catálogo');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
