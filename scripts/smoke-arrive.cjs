/**
 * Smoke «empieza al llegar»: ninguna animación corre en segundo plano. La pantalla en vivo (después de una portada)
 * está quieta hasta que se llega a ella; al llegar empieza desde el principio, a los ~3 s el móvil escanea y sube una
 * FOTO (lo que más importa); su vídeo se reproduce desde el segundo 0 cuando toca y se pausa al irse.
 *   npm run build && DEMO_MODE=1 node dist/server/entry.mjs ; node scripts/smoke-arrive.cjs
 */
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const FIX = path.join(__dirname, 'fixtures');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1200 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Fiestas Neón');
  await p.fill('[data-testid=create-form] [name=title]', 'Empieza al llegar');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.waitForSelector('[data-testid=personalize]');
  await p.click('[data-testid=add-hero-bodas]'); await settle();
  await p.click('[data-testid=add-pantalla-en-vivo]'); await settle();
  await p.setInputFiles('[data-testid=media-video-input]', path.join(FIX, 'visual.webm'));
  await p.waitForSelector('[data-testid=media-video] video');
  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();

  const pub = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.goto(url, { waitUntil: 'networkidle' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  const labels = await pub.$$eval('[data-scene-btn]', (els) => els.map((e) => (e.querySelector('b') ?? e).textContent.trim()));
  assert(labels[1] === 'Foto', `después del reclamo, la foto (${labels.join(', ')})`);
  const st = () => pub.evaluate(() => {
    const r = document.querySelector('[data-module=live-screen]');
    const v = r.querySelector('.es-stage video');
    return {
      sel: [...r.querySelectorAll('[data-scene-btn]')].findIndex((x) => x.getAttribute('aria-selected') === 'true'),
      phone: r.querySelector('[data-phone]').classList.contains('is-in'),
      paused: v ? v.paused : true, t: v ? v.currentTime : 0,
    };
  });

  // En la portada: la pantalla (diapositiva 2) está quieta.
  await pub.waitForTimeout(4000);
  const before = await st();
  assert(before.sel === 0 && !before.phone && before.paused && before.t === 0, `antes de llegar, quieta (${JSON.stringify(before)})`);

  // Al llegar: desde el principio y, a los ~3 s, el móvil sube una foto.
  await pub.click('[data-next]');
  await pub.waitForTimeout(1500);
  const at1 = await st();
  assert(at1.sel === 0 && !at1.phone, 'al llegar, empieza por el principio');
  await pub.waitForFunction(() => document.querySelector('[data-module=live-screen] [data-phone]')?.classList.contains('is-in'), null, { timeout: 4500 });
  const at2 = await st();
  assert(at2.sel === 1, 'a los pocos segundos, el móvil escanea el QR y sube una foto');

  // Su vídeo: desde el segundo 0 cuando toca; al irse, en pausa; al volver, todo desde el principio.
  await pub.click(`[data-scene-btn="${labels.indexOf('Encima de tus visuales')}"]`);
  await pub.waitForFunction(() => { const v = document.querySelector('[data-module=live-screen] .es-stage video'); return v && !v.paused; }, null, { timeout: 6000 });
  assert((await st()).t < 1.5, 'su vídeo se reproduce desde el principio');
  await pub.click('[data-dot="0"]');
  await pub.waitForTimeout(1200);
  assert((await st()).paused, 'al irse, el vídeo en pausa');
  await pub.click('[data-dot="1"]');
  await pub.waitForTimeout(700);
  const back = await st();
  assert(back.sel === 0 && back.t < 0.5, `al volver, desde el principio (${JSON.stringify(back)})`);

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
