/**
 * Smoke de acceso (modo DEMO): código por email (y código erróneo), mensaje neutro si el email no existe,
 * «usar otra cuenta» y el email recordado, cerrar sesión, `?next=` (interno sí, externo no) e invitación → bienvenida.
 * La contraseña no se prueba: en DEMO el formulario no se pinta y el servidor solo la acepta con Supabase (login.astro).
 *   npm run build && npm run start:demo ; node scripts/smoke-auth.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };
  const path = (p) => { const u = new URL(p.url()); return u.pathname + u.search; };
  const sendCode = async (p, email) => {
    await p.fill('[data-testid=code-send] [name=email]', email);
    await p.click('[data-testid=code-send] button[type=submit]');
    await p.waitForSelector('[data-testid=code-verify]');
  };
  const enterCode = async (p, code) => {
    await p.fill('[data-testid=code-verify] [name=code]', code);
    await Promise.all([p.waitForLoadState(), p.click('[data-testid=code-verify] button[type=submit]')]);
  };
  const codeLogin = async (p, email) => {
    await sendCode(p, email);
    const code = (await p.textContent('[data-testid=demo-code] strong')).trim();
    await enterCode(p, code);
    return code;
  };

  // ---- código: miembro del equipo (smoke-partner ya lo cubre para colaboradores)
  const p = await fresh();
  await p.goto(`${BASE}/admin/login`);
  assert(!(await p.$('[type=password]')), 'demo: sin formulario de contraseña (solo código o usuario demo)');
  await sendCode(p, 'Rep@Enjoy.test');
  const code = (await p.textContent('[data-testid=demo-code] strong')).trim();
  assert(/^\d{6}$/.test(code), 'código de 6 dígitos para un comercial');
  assert((await p.getAttribute('[data-testid=code-verify]', 'data-pending')) === 'rep@enjoy.test', 'email normalizado (minúsculas)');
  await enterCode(p, code === '000000' ? '111111' : '000000');
  assert((await p.textContent('[data-testid=alert-rejection]')).includes('Código incorrecto'), 'código erróneo → rechazado');
  await enterCode(p, 'abc');
  assert(await p.isVisible('[data-testid=code-verify]'), 'código sin formato: sigue en el paso del código');
  await enterCode(p, code);
  await p.waitForURL(`${BASE}/admin`);
  assert((await p.textContent('[data-testid=role]')).trim() === 'Comercial', 'código correcto → entra como comercial');

  // El código es de un solo uso.
  const reuse = await fresh();
  await reuse.goto(`${BASE}/admin/login`);
  await reuse.fill('[data-testid=code-send] [name=email]', 'rep@enjoy.test');
  await reuse.evaluate(() => { const f = document.querySelector('[data-testid=code-send]'); f.querySelector('[name=action]').value = 'code-resume'; });
  await reuse.click('[data-testid=code-send] button[type=submit]');
  await enterCode(reuse, code);
  assert(reuse.url().includes('/admin/login'), 'el código ya usado no vale otra vez');
  await reuse.context().close();

  // ---- cerrar sesión (desde el menú de perfil)
  await p.click('[data-testid=profile]');
  await Promise.all([p.waitForURL(/\/admin\/login/), p.click('form[action="/admin/logout"] button')]);
  assert(await p.isVisible('[data-testid=code-send]'), 'cerrar sesión → vuelve a la pantalla de acceso');
  await p.goto(`${BASE}/admin`);
  assert(/\/admin\/login\?next=%2Fadmin$/.test(p.url()), '/admin sin sesión → login');
  const api = await p.evaluate(() => fetch('/admin/api/dossiers/00000000-0000-4000-8000-000000000000').then((r) => r.status));
  assert(api === 401, 'API sin sesión → 401');

  // ---- mensaje neutro: existe vs no existe
  await p.goto(`${BASE}/admin/login`);
  await sendCode(p, 'admin@enjoy.test');
  const msgYes = (await p.textContent('[data-testid=alert-success]')).trim();
  const formYes = await p.isVisible('[data-testid=code-verify] [name=code]');
  await p.goto(`${BASE}/admin/login`);
  const nobody = `nadie-${RUN}@enjoy.test`;
  await sendCode(p, nobody);
  const msgNo = (await p.textContent('[data-testid=alert-success]')).trim();
  const formNo = await p.isVisible('[data-testid=code-verify] [name=code]');
  assert(msgYes && msgYes === msgNo && formYes && formNo, `email inexistente: mismo mensaje y mismo paso («${msgNo}»)`);
  assert(!(await p.$('[data-testid=alert-rejection]')), 'email inexistente: sin error que lo delate');
  // (En DEMO el código se ve en pantalla solo si la cuenta existe; con Supabase va al correo y no hay diferencia.)
  await enterCode(p, '123456');
  assert((await p.textContent('[data-testid=alert-rejection]')).includes('Código incorrecto'), 'email inexistente + código → el mismo «Código incorrecto»');

  // ---- «usar otra cuenta» y el email recordado
  await p.goto(`${BASE}/admin/login`);
  await sendCode(p, 'admin@enjoy.test');
  await p.goto(`${BASE}/admin/login`);
  const resume = p.locator('[data-testid=code-resume]');
  assert(await resume.isVisible() && (await resume.textContent()).includes('admin@enjoy.test'), 'recuerda el email pendiente («ya tengo un código»)');
  await Promise.all([p.waitForLoadState(), resume.click()]);
  assert((await p.getAttribute('[data-testid=code-verify]', 'data-pending')) === 'admin@enjoy.test' && !(await p.$('[data-testid=demo-code]')), 'vuelve al paso del código sin pedir otro');
  await Promise.all([p.waitForLoadState(), p.click('[data-testid=code-verify] [data-forget]')]);
  assert(await p.isVisible('[data-testid=code-send] [name=email]'), '«usar otra cuenta» → pide otro email');
  await p.reload();
  assert(!(await resume.isVisible()), '«usar otra cuenta» olvida el email recordado');
  // Con la sesión iniciada, la pantalla de acceso sigue permitiendo entrar con otra cuenta.
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(`${BASE}/admin`);
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(`${BASE}/admin`);
  assert((await p.textContent('[data-testid=role]')).trim() === 'Admin', 'con sesión abierta se puede entrar con otra cuenta');

  // ---- ?next=
  const n = await fresh();
  await n.goto(`${BASE}/admin/accounts`);
  assert(path(n) === '/admin/login?next=%2Fadmin%2Faccounts', `sin sesión → login con next (${path(n)})`);
  await codeLogin(n, 'admin@enjoy.test');
  await n.waitForURL(/\/admin\/accounts$/);
  assert(path(n) === '/admin/accounts', 'tras el código, vuelve a /admin/accounts');
  await n.context().close();
  const n2 = await fresh();
  await n2.goto(`${BASE}/admin/team?x=1`);
  await n2.click('[data-testid="demo-admin@enjoy.test"]');
  await n2.waitForURL(/\/admin\/team/);
  assert(path(n2) === '/admin/team?x=1', 'acceso demo también respeta next (con query)');
  for (const evil of ['https://evil.com', '//evil.com', '/admin//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
    await n2.goto(`${BASE}/admin/login?next=${encodeURIComponent(evil)}`);
    await n2.click('[data-testid="demo-rep@enjoy.test"]');
    await n2.waitForLoadState();
    const u = new URL(n2.url());
    assert(u.origin === BASE && u.pathname === '/admin', `next externo (${evil}) → se queda en /admin`);
  }
  await n2.context().close();

  // ---- invitación → bienvenida
  const a = await fresh();
  await a.goto(`${BASE}/admin/login`);
  await a.click('[data-testid="demo-admin@enjoy.test"]');
  await a.waitForURL(/\/admin/);
  await a.goto(`${BASE}/admin/team`);
  const guest = `nuevo-${RUN}@enjoy.test`;
  await a.click('[data-dialog-open=invite]');
  await a.fill('[data-testid=invite-form] [name=email]', guest);
  await a.selectOption('[data-testid=invite-form] [name=role]', 'rep');
  await Promise.all([a.waitForLoadState(), a.click('[data-testid=invite-form] button[type=submit]')]);
  assert((await a.textContent('[data-testid=members]')).includes(guest), 'admin invita: aparece en Equipo');

  const g = await fresh();
  await g.goto(`${BASE}/admin/login`);
  assert(await g.isVisible(`[data-testid="demo-${guest}"]`), 'la persona invitada aparece en el acceso demo');
  await codeLogin(g, guest);
  await g.waitForURL(`${BASE}/admin`);
  assert((await g.textContent('[data-testid=role]')).trim() === 'Comercial', 'la invitada entra con su código, como comercial');
  await g.goto(`${BASE}/admin/inicio`);
  await g.waitForSelector('[data-testid=home-body]');
  assert(await g.isVisible('[data-testid=welcome-resume]'), 'Inicio le propone la bienvenida');
  await Promise.all([g.waitForURL(/\/admin\/welcome/), g.click('[data-testid=welcome-resume]')]);
  assert((await g.getAttribute('[data-testid=welcome]', 'data-step')) === 'hello', 'llega a /admin/welcome, paso 1');
  // Con Supabase el enlace de invitación lleva a Mi cuenta (setup=1) y, al guardar el nombre, a la bienvenida.
  await g.goto(`${BASE}/admin/account?setup=1`);
  const nameInput = g.locator('form:has([name=name]) [name=name]').first();
  await nameInput.fill(`Nueva ${RUN}`);
  await Promise.all([g.waitForNavigation(), nameInput.evaluate((i) => i.form.requestSubmit())]);
  assert(new URL(g.url()).pathname === '/admin/welcome', `Mi cuenta (setup=1) → bienvenida (${path(g)})`);

  assert(errors.length === 0, `sin errores JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
