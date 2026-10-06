/**
 * Smoke de la pantalla en vivo (src/modules/live-screen): lo que ve el cliente en la propuesta publicada.
 *  - La barrita de abajo dura lo que se queda la escena (HOLD de client.ts: el motor recibe `seconds`): con el
 *    recorrido solo, su animation-duration coincide con el tiempo real hasta que cambia de pantalla.
 *  - El minimóvil enseña la MISMA canción, foto y mensaje que luego pinta la pantalla.
 *  - Carátulas por canción (config.ts → covers en el orden de las canciones): la que tenga la suya, la suya; el vinilo
 *    de color solo en la que no tenga.
 *   npm run build && npm run start:demo ; node scripts/smoke-live-screen.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const VINYL = 'data:image/svg+xml';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  const company = `Sala Live ${Date.now().toString(36)}`;
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', company);
  await p.fill('[data-testid=create-form] [name=title]', `Propuesta para ${company}`);
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  await p.click('[data-testid=add-pantalla-en-vivo]'); await settle();
  await p.click('[data-testid=publish]'); await settle(); await settle();
  const url = (await p.textContent('[data-testid=share-url]')).trim();

  const pub = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES' })).newPage();
  const errors = [];
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.goto(url, { waitUntil: 'domcontentloaded' });
  await pub.waitForSelector('[data-module=live-screen] .es-stage');
  await pub.locator('[data-module=live-screen]').scrollIntoViewIfNeeded();
  const cfg = JSON.parse(await pub.$eval('[data-module=live-screen] script[data-config]', (s) => s.textContent));
  const kinds = cfg.scenes.map((s) => s.scene);
  assert(cfg.autoplay && kinds.includes('club.song') && kinds.includes('club.photo') && kinds.includes('club.message'), `recorrido solo con canción, foto y mensaje (${kinds.join(', ')})`);

  // 1) Recorrido solo: por cada pantalla con barrita, cuánto dura su animación y cuánto tarda de verdad en cambiar;
  //    y, a la vez, lo que enseña el móvil justo cuando la pantalla pinta la petición.
  const seen = await pub.evaluate((want) => new Promise((resolve) => {
    const root = document.querySelector('[data-module=live-screen]');
    const stage = root.querySelector('.es-stage');
    const btns = [...root.querySelectorAll('[data-scene-btn]')];
    const sel = () => btns.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    const txt = (q) => (root.querySelector(q)?.textContent ?? '').trim();
    const out = []; let cur = null; let lastBar = null;
    const done = () => { mo.disconnect(); mb.disconnect(); clearTimeout(to); resolve(out); };
    const mo = new MutationObserver(() => {
      const bar = stage.querySelector('.es-timebar > span, .es-npc-bar > span');
      if (!bar || bar === lastBar || (cur && cur.idx === sel())) return;
      lastBar = bar;
      const np = stage.querySelector('.es-np');
      cur = {
        idx: sel(), t0: performance.now(), dur: getComputedStyle(bar).animationDuration,
        phone: { img: root.querySelector('[data-req-img]')?.getAttribute('src') ?? '', t: txt('[data-req-t]'), s: txt('[data-req-s]'), msg: txt('[data-phone-compose-text]') },
        stage: {
          img: np?.querySelector('img.es-np-img')?.getAttribute('src') ?? '', song: txt('.es-stage .es-song-name'), artist: txt('.es-stage .es-song-artist'),
          text: txt('.es-stage .es-np-text'), msg: txt('.es-stage .es-msg-text'),
        },
      };
    });
    const mb = new MutationObserver(() => {
      if (!cur || sel() === cur.idx) return;
      cur.wait = performance.now() - cur.t0; out.push(cur); cur = null;
      if (want.every((k) => out.some((o) => o.idx === k))) done();
    });
    mo.observe(stage, { childList: true, subtree: true });
    btns.forEach((x) => mb.observe(x, { attributes: true, attributeFilter: ['aria-selected'] }));
    const to = setTimeout(done, 30000);
  }), ['club.song', 'club.photo', 'club.message'].map((k) => kinds.indexOf(k)));
  const byScene = Object.fromEntries(seen.map((o) => [kinds[o.idx], o]));

  for (const k of ['club.song', 'club.photo', 'club.message']) {
    const o = byScene[k];
    if (!o) { assert(false, `${k}: el recorrido solo llega a enseñarla`); continue; }
    const hold = cfg.scenes[o.idx].video ? 5.5 : k.endsWith('idle') ? 3.2 : 3.8;
    const dur = parseFloat(o.dur);
    assert(Math.abs(dur - hold) < 0.01, `${k}: la barrita dura lo que la escena (${o.dur} = ${hold}s)`);
    assert(Math.abs(o.wait / 1000 - dur) < 0.6, `${k}: la escena cambia cuando acaba la barrita (${(o.wait / 1000).toFixed(2)}s reales vs ${dur}s)`);
  }
  const s = byScene['club.song'];
  if (s) {
    assert(s.phone.t && s.phone.t === s.stage.song && s.phone.s === s.stage.artist, `canción: la misma en el móvil y en la pantalla («${s.phone.t}» · ${s.phone.s})`);
    assert(s.phone.img && s.phone.img === s.stage.img, 'canción: la misma carátula en el móvil y en la pantalla');
  }
  const ph = byScene['club.photo'];
  if (ph) {
    assert(ph.phone.img && ph.phone.img === ph.stage.img, `foto: la misma en el móvil y en la pantalla (${ph.phone.img.split('/').pop()})`);
    assert(ph.phone.t === ph.stage.text, `foto: el mismo pie («${ph.phone.t}»)`);
  }
  const m = byScene['club.message'];
  if (m) assert(m.phone.msg && m.phone.msg === m.stage.msg, `mensaje: el mismo en el móvil y en la pantalla («${m.phone.msg.slice(0, 40)}…»)`);

  // 2) Carátulas por canción: se pide canción tantas veces como canciones hay (cada petición, la siguiente).
  const songBtn = kinds.indexOf('club.song');
  const songs = cfg.songs;
  const expected = songs.map((x, i) => cfg.assets.covers[i] || null);
  const got = new Map();
  for (let i = 0; i < songs.length; i++) {
    await pub.click(`[data-scene-btn="${songBtn}"]`);
    const r = await pub.evaluate(() => ({
      t: document.querySelector('[data-module=live-screen] [data-req-t]').textContent.trim(),
      img: document.querySelector('[data-module=live-screen] [data-req-img]').getAttribute('src') ?? '',
    }));
    got.set(r.t, r.img);
  }
  assert(songs.every((x) => got.has(x.song)), `todas las canciones pasan por el móvil (${[...got.keys()].join(' · ')})`);
  const missing = songs.filter((x, i) => !expected[i]).map((x) => x.song);
  songs.forEach((x, i) => {
    const img = got.get(x.song) ?? '';
    if (expected[i]) assert(img === expected[i], `«${x.song}»: su carátula, no el vinilo`);
    else assert(img.startsWith(VINYL), `«${x.song}» (sin carátula): vinilo de color`);
  });
  const distinct = new Set(songs.map((x) => got.get(x.song)).filter((u) => u && !u.startsWith(VINYL)));
  assert(distinct.size === songs.length - missing.length, `cada carátula, de su canción (${distinct.size} distintas, ${missing.length} sin carátula)`);
  if (missing.length === songs.length) console.log('nota: este espacio no tiene carátulas resueltas (sin musicStyles en el catálogo): todas con vinilo');
  // La última pedida: la pantalla pinta esa misma carátula.
  const last = await pub.$eval('[data-module=live-screen] [data-req-img]', (i) => i.getAttribute('src'));
  await pub.waitForFunction((src) => document.querySelector('[data-module=live-screen] .es-stage img.es-np-img')?.getAttribute('src') === src, last, { timeout: 5000 }).catch(() => {});
  assert((await pub.$eval('[data-module=live-screen] .es-stage', (st) => st.querySelector('img.es-np-img')?.getAttribute('src') ?? '')) === last, 'tocando «Canción»: la pantalla pinta la carátula que enseñó el móvil');
  assert(errors.length === 0, `sin errores JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
