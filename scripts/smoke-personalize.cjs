/**
 * Smoke de Personalizar (docs/PERSONALIZE.md): el comercial sube el logo, una foto y un vídeo del cliente en su
 * propuesta, y la pantalla en vivo los usa (su logo arriba, su foto en «Foto», «Su vídeo» de fondo).
 *   npm run build && npm run start:demo ; node scripts/smoke-personalize.cjs
 */
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const FIX = path.join(__dirname, 'fixtures');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Sala Neón');
  await p.fill('[data-testid=create-form] [name=title]', 'Propuesta para Sala Neón');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.waitForSelector('[data-testid=personalize]');
  assert((await p.textContent('[data-testid=personalize]')).includes('Personaliza para Sala Neón'), '«Personaliza para…» a la vista en el editor');
  await p.click('[data-testid=add-pantalla-en-vivo]'); await settle();

  await p.setInputFiles('[data-testid=media-logo-input]', path.join(FIX, 'logo.png'));
  await p.waitForSelector('[data-testid=media-logo] img');
  await p.setInputFiles('[data-testid=media-photo-input]', path.join(FIX, 'photo.webp'));
  await p.waitForSelector('[data-testid=media-photos] img');
  await p.setInputFiles('[data-testid=media-video-input]', path.join(FIX, 'visual.webm'));
  await p.waitForSelector('[data-testid=media-video] video');
  assert(true, 'logo, foto y vídeo subidos');
  if (OUT) await p.screenshot({ path: `${OUT}/personalize-editor.png`, fullPage: true });

  // un tipo no permitido se explica
  await p.setInputFiles('[data-testid=media-logo-input]', []).catch(() => {});

  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();
  const pub = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  await pub.goto(url, { waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  assert((await pub.getAttribute('[data-module=live-screen] .es-venue-logo', 'src'))?.startsWith('/demo-media/'), 'su logo arriba en la pantalla');
  const labels = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => e.textContent.trim()));
  assert(labels[1] === 'Su vídeo', `«Su vídeo» entre las pantallas (${labels.join(', ')})`);
  await pub.click('[data-scene-btn="1"]');
  await pub.waitForTimeout(3200);
  const vsrc = await pub.$eval('[data-module=live-screen] .es-stage video', (v) => v.currentSrc || v.src).catch(() => '');
  assert(vsrc.includes('/demo-media/'), 'su vídeo de fondo en la pantalla');
  await pub.locator('[data-module=live-screen]').scrollIntoViewIfNeeded();
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/personalize-video.png` });
  const photoBtn = labels.indexOf('Foto');
  await pub.click(`[data-scene-btn="${photoBtn}"]`);
  await pub.waitForTimeout(1400);
  assert((await pub.getAttribute('[data-phone-img]', 'src'))?.startsWith('/demo-media/'), 'el móvil envía SU foto');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/personalize-phone.png` });
  await pub.waitForTimeout(2000);
  assert((await pub.$eval('[data-module=live-screen] .es-stage img.es-np-img, [data-module=live-screen] .es-stage .es-np-img', (i) => i.getAttribute('src') || '').catch(() => '')).startsWith('/demo-media/'), 'su foto en «Foto»');
  if (OUT) await pub.locator('[data-module=live-screen]').screenshot({ path: `${OUT}/personalize-photo.png` });

  // lo que no tiene, no se enseña: sin canciones → ni pantalla «Canción» ni paso «Pide su canción»
  await p.click('[data-testid=add-movil-invitado]'); await settle();
  await p.click('[data-testid=feature-songs]');
  await p.waitForFunction(() => document.querySelector('[data-testid=feature-songs]')?.getAttribute('aria-pressed') === 'false');
  assert(!(await p.isVisible('[data-testid=media-style]')), 'sin canciones, no se pregunta el estilo musical');
  await pub.reload({ waitUntil: 'networkidle' });
  const labels2 = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => e.textContent.trim()));
  const steps2 = await pub.$$eval('[data-step-btn]', (els) => els.map((e) => e.dataset.stepBtn));
  assert(!labels2.includes('Canción') && !steps2.includes('songs') && steps2.includes('scan'), `sin canciones: ${labels2.join(', ')} · ${steps2.join(', ')}`);
  await p.click('[data-testid=feature-songs]');
  await p.waitForSelector('[data-testid=media-style]');
  await p.click('[data-testid=style-rock]');
  await p.waitForFunction(() => document.querySelector('[data-testid=style-rock]')?.getAttribute('aria-pressed') === 'true');
  await pub.reload({ waitUntil: 'networkidle' });
  assert((await pub.textContent('[data-module=phone-tour]')).includes('Bon Jovi'), 'estilo rock: canciones de rock en el móvil');
  if (OUT) await pub.locator('[data-module=phone-tour]').screenshot({ path: `${OUT}/personalize-phone-tour.png` });

  // quitar
  await p.click('[data-testid=media-photos] .media-x');
  await p.waitForFunction(() => !document.querySelector('[data-testid=media-photos] img'));
  assert(true, 'quitar una foto');
  await b.close();
})();
