/**
 * Smoke de idioma y menú de perfil (docs/I18N.md): español por defecto aunque el navegador diga inglés o coreano;
 * cambio desde la bienvenida (portugués) que sobrevive a cerrar sesión y volver a entrar; cambio desde el menú de
 * perfil; errores del servidor traducidos (src/lib/i18n/errors.ts) en inglés y portugués; y el menú de perfil se abre
 * entero, por encima de la página (sin que lo recorte la barra lateral) en 1440, 1024 y 390 px, y se cierra al pulsar fuera.
 * Complementa smoke-i18n.cjs (inglés/coreano, Mi cuenta) y smoke-welcome.cjs (inglés en la bienvenida).
 *   npm run build && npm run start:demo ; node scripts/smoke-profile.cjs
 */
const fs = require('node:fs');
const nodePath = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

/** Diccionario de errores: español → [en, pt, ko], leído de src/lib/i18n/errors.ts. */
const ERRORS_TS = fs.readFileSync(nodePath.join(__dirname, '../src/lib/i18n/errors.ts'), 'utf8');
const unq = (s) => s.replace(/\\'/g, "'");
function tr(es, locale) {
  const esc = es.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\\\'");
  const m = new RegExp(`'${esc}':\\s*\\[\\s*'((?:[^'\\\\]|\\\\.)*)',\\s*'((?:[^'\\\\]|\\\\.)*)',\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(ERRORS_TS);
  if (!m) throw new Error(`sin traducción en errors.ts para «${es}»`);
  return unq(m[{ en: 1, pt: 2, ko: 3 }[locale]]);
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const fresh = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES', ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };
  const lang = (p) => p.getAttribute('html', 'lang');
  const demo = async (p, email) => {
    await p.goto(`${BASE}/admin/login`);
    await Promise.all([p.waitForURL(/\/admin(\/|$)/), p.click(`[data-testid="demo-${email}"]`)]);
  };

  // Persona nueva (sin idioma guardado): la invita el admin, así no se toca el idioma de los usuarios demo.
  const guest = `perfil-${RUN}@enjoy.test`;
  const a = await fresh();
  await demo(a, 'admin@enjoy.test');
  await a.goto(`${BASE}/admin/team`);
  await a.click('[data-dialog-open=invite]');
  await a.fill('[data-testid=invite-form] [name=email]', guest);
  await Promise.all([a.waitForLoadState(), a.click('[data-testid=invite-form] button[type=submit]')]);
  await a.context().close();

  // ---- español por defecto con el navegador en inglés y en coreano
  for (const loc of ['en-US', 'ko-KR']) {
    const p = await fresh({ locale: loc, extraHTTPHeaders: { 'Accept-Language': `${loc},${loc.slice(0, 2)};q=0.9` } });
    await p.goto(`${BASE}/admin/login`);
    assert((await lang(p)) === 'es' && (await p.textContent('h1')).length > 0 && (await p.textContent('[data-testid=code-send] button[type=submit]')).includes('código'), `${loc}: la pantalla de acceso sale en español`);
    await demo(p, guest);
    await p.goto(`${BASE}/admin/inicio`);
    assert((await lang(p)) === 'es' && (await p.textContent('nav[aria-label=Secciones]')).includes('Inicio'), `${loc}: la consola sale en español`);
    await p.context().close();
  }

  // ---- portugués desde la bienvenida; sobrevive a cerrar sesión y volver a entrar
  const p = await fresh({ locale: 'en-US' });
  await demo(p, guest);
  await p.goto(`${BASE}/admin/welcome?step=6`);
  await Promise.all([p.waitForURL(/\/admin\/welcome\?step=6/), p.click('[data-testid=welcome-locale-pt]')]);
  assert((await lang(p)) === 'pt' && (await p.getAttribute('[data-testid=welcome-locale-pt]', 'aria-pressed')) === 'true', 'bienvenida → português, mismo paso');
  await p.fill('[data-testid=welcome-create] [name=company]', `Perfil ${RUN}`);
  await Promise.all([p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/), p.click('[data-testid=welcome-create] button[type=submit]')]);
  const dossierId = p.url().split('/').pop();
  await p.click('[data-testid=profile]');
  assert((await p.textContent('.co-sidebar .co-popover__menu')).includes('Sair'), 'menú de perfil en portugués («Sair»)');
  await Promise.all([p.waitForURL(/\/admin\/login/), p.click('.co-sidebar form[action="/admin/logout"] button')]);
  assert((await lang(p)) === 'pt', 'tras cerrar sesión, el acceso sigue en portugués (cookie)');
  await p.context().close();
  const q = await fresh({ locale: 'en-US' });
  await demo(q, guest);
  await q.goto(`${BASE}/admin/notifications`);
  assert((await lang(q)) === 'pt', 'otro navegador (en-US, sin cookie): al entrar, portugués (guardado en la cuenta)');

  // ---- errores del servidor en el idioma elegido
  const call = (id, body) => q.evaluate(([id, body]) => fetch(`/admin/api/dossiers/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, ...(await r.json()) })), [id, body]);
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const CASES = [
    ['Describe el próximo paso (p. ej. «Llamar para cerrar fecha»)', dossierId, { op: 'setNextStep', text: null, at: future }],
    ['La caducidad debe ser futura', dossierId, { op: 'createLink', expiresAt: past }],
    ['Módulo no encontrado en este dossier', dossierId, { op: 'setVisible', itemId: '00000000-0000-4000-8000-0000000000ff', visible: false }],
    ['Dossier no encontrado', '00000000-0000-4000-8000-0000000000fe', { op: 'setVisible', itemId: '00000000-0000-4000-8000-0000000000ff', visible: false }],
  ];
  const check = async (loc) => {
    for (const [es, id, body] of CASES) {
      const r = await call(id, body);
      const want = tr(es, loc);
      assert(r.status >= 400 && r.error === want, `${loc}: error «${es}» → «${r.error}»`);
    }
    // Validación del esquema en la propia ruta (api/dossiers/[id].ts), también traducida.
    const r = await call(dossierId, { op: 'setVisible', itemId: 'no-es-uuid', visible: 1 });
    assert(r.error === tr('Datos no válidos', loc), `${loc}: «Datos no válidos» traducido («${r.error}»)`);
    const bad = await call('no-es-un-uuid', { op: 'setVisible', itemId: 'x', visible: true });
    assert(bad.error === tr('Dossier no encontrado', loc), `${loc}: id mal formado → «${bad.error}»`);
  };
  await check('pt');

  // ---- menú de perfil → 한국어 y English (sigue en la misma pantalla)
  await q.click('[data-testid=profile]');
  await Promise.all([q.waitForLoadState(), q.click('[data-testid=locale-ko]')]);
  assert((await lang(q)) === 'ko' && new URL(q.url()).pathname === '/admin/notifications', 'menú de perfil → 한국어, misma pantalla');
  await q.click('[data-testid=profile]');
  assert((await q.getAttribute('[data-testid=locale-ko]', 'aria-pressed')) === 'true', 'el menú marca el idioma activo');
  await Promise.all([q.waitForLoadState(), q.click('[data-testid=locale-en]')]);
  assert((await lang(q)) === 'en', 'menú de perfil → English');
  await check('en');

  // ---- el menú de perfil se abre entero y por encima (1440, 1024, 390)
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
    await q.setViewportSize({ width: w, height: h });
    await q.goto(`${BASE}/admin/notifications`);
    const mobile = w < 1024;
    const scope = mobile ? '#co-drawer' : '.co-sidebar';
    if (mobile) { await q.click('[data-dialog-open=co-drawer]'); await q.waitForSelector('#co-drawer[open]'); }
    await q.click(`${scope} details.co-popover > summary`);
    const menu = q.locator(`${scope} details.co-popover .co-popover__menu`);
    await menu.waitFor({ state: 'visible' });
    await q.waitForTimeout(50);
    const geo = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      // Esquinas a 8 px: el menú tiene 16 px de radio y en la esquina exacta asoma lo de debajo.
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 8, r.top + 8], [r.right - 8, r.top + 8], [r.left + 8, r.bottom - 8], [r.right - 8, r.bottom - 8]];
      const own = pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); });
      return { r: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }, vw: innerWidth, vh: innerHeight, own };
    });
    const inView = geo.r.l >= 0 && geo.r.t >= 0 && geo.r.r <= geo.vw && geo.r.b <= geo.vh && geo.r.w > 100 && geo.r.h > 100;
    assert(inView, `${w}px: el menú cabe en la pantalla (${JSON.stringify(geo.r)})`);
    assert(geo.own.every(Boolean), `${w}px: el menú queda por encima de todo, centro y esquinas (${geo.own.join(',')})`);
    assert(await q.isVisible(`${scope} form[action="/admin/logout"] button`), `${w}px: «Cerrar sesión» visible en el menú`);
    // Escape: el <details> no lo cierra (no está implementado); en móvil Escape cierra el cajón entero.
    // Clic fuera del menú (en escritorio, sobre el título de la página; en móvil, dentro del cajón pero fuera del menú).
    if (mobile) {
      // Dentro del cajón, a la derecha del menú (el hueco entre el menú y el borde del cajón).
      const d = await q.locator('#co-drawer').boundingBox();
      await q.mouse.click((geo.r.r + d.x + d.width) / 2, (geo.r.t + geo.r.b) / 2);
    } else {
      const out = await q.locator('main h1').boundingBox();
      await q.mouse.click(out.x + 5, out.y + out.height / 2);
    }
    await q.waitForTimeout(50);
    assert(!(await q.locator(`${scope} details.co-popover`).evaluate((d) => d.open)), `${w}px: se cierra al pulsar fuera`);
    if (mobile) { await q.keyboard.press('Escape'); await q.waitForTimeout(50); }
  }
  // Escape con el menú abierto (escritorio).
  await q.setViewportSize({ width: 1440, height: 900 });
  await q.goto(`${BASE}/admin/notifications`);
  await q.click('[data-testid=profile]');
  await q.keyboard.press('Escape');
  const stillOpen = await q.locator('.co-sidebar details.co-popover').evaluate((d) => d.open);
  if (!stillOpen) assert(true, 'Escape cierra el menú de perfil');
  else console.log('nota:', 'Escape no cierra el menú de perfil (no está implementado; no lo exige la documentación)');
  if (stillOpen) await q.mouse.click(1380, 840);

  // De vuelta a español desde el menú de perfil.
  await q.click('[data-testid=profile]');
  await Promise.all([q.waitForLoadState(), q.click('[data-testid=locale-es]')]);
  assert((await lang(q)) === 'es' && (await q.textContent('h1')).includes('Avisos'), 'de vuelta a español');

  assert(errors.length === 0, `sin errores JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
