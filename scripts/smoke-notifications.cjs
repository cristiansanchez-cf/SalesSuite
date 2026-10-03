/**
 * Smoke de avisos (modo DEMO, docs/NOTIFICATIONS.md): un colaborador propone un truco → campana del admin,
 * abrir, descartar, preferencia de email y cron de envío.
 *   npm run build && npm run start:demo ; node scripts/smoke-notifications.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (email, viewport = { width: 1440, height: 1000 }) => {
    const p = await (await b.newContext({ viewport })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const count = async (p) => Number((await p.textContent('[data-testid=bell-count]').catch(() => '0')) || 0);

  const admin = await login('admin@enjoy.test');
  const before = await count(admin);

  // ---- el colaborador propone un truco
  const dj = await login('dj@enjoy.test');
  await dj.goto(`${BASE}/admin/learn`);
  const topic = await dj.getAttribute('[data-testid=topic] >> nth=0', 'href');
  await dj.goto(`${BASE}${topic}`);
  await dj.fill('[data-testid=tip-form] [name=title]', `Truco de cabina ${RUN}`);
  await dj.fill('[data-testid=tip-form] [name=body]', 'Pide la canción del cumpleañero antes de las doce.');
  await dj.click('[data-testid=tip-form] button[type=submit]');
  await dj.waitForURL(/ok=tip-pending/);
  assert(await count(dj) === 0, 'quien propone no recibe aviso');

  // ---- campana del admin
  await admin.goto(`${BASE}/admin`);
  assert(await count(admin) === before + 1, 'la campana suma el aviso nuevo');
  await admin.click('[data-testid=bell]');
  const panel = admin.locator('[data-testid=bell-panel]');
  assert(await panel.isVisible(), 'la campana abre el panel junto al logo');
  const item = panel.locator('[data-testid=notification]', { hasText: 'propone un truco' }).first();
  assert((await item.textContent()).includes(`Truco de cabina ${RUN}`), 'el aviso dice qué y de quién');
  if (OUT) await admin.screenshot({ path: `${OUT}/bell.png` });
  await item.locator('a').click();
  await admin.waitForURL(/\/admin\/playbook\?tab=inbox/);
  assert((await admin.textContent('main')).includes(`Truco de cabina ${RUN}`), 'abrir el aviso lleva a la bandeja con el aporte');

  // ---- descartar desde la página de avisos
  await admin.goto(`${BASE}/admin/notifications`);
  const n0 = (await admin.$$('[data-testid=notifications] [data-testid=notification]')).length;
  await admin.locator('[data-testid=notifications] [data-testid=notification]').first().locator('button', { hasText: 'Descartar' }).click();
  await admin.waitForURL(/\/admin\/notifications$/);
  assert((await admin.$$('[data-testid=notifications] [data-testid=notification]')).length === n0 - 1, 'descartar lo quita de pendientes');

  // ---- cron de envío (demo: no sale nada) y preferencia
  const res = await admin.request.get(`${BASE}/api/cron/notifications?digest=skip`);
  const body = await res.json();
  assert(res.ok() && body.mode === 'demo' && typeof body.immediate === 'number', 'cron de emails responde (demo)');
  await admin.goto(`${BASE}/admin/account`);
  await admin.uncheck('[data-testid=notify-pref] [name=notifyEmail]');
  await admin.click('[data-testid=notify-pref] button[type=submit]');
  await admin.waitForLoadState();
  assert(!(await admin.isChecked('[data-testid=notify-pref] [name=notifyEmail]')), 'se pueden desactivar los emails');
  await admin.check('[data-testid=notify-pref] [name=notifyEmail]');
  await admin.click('[data-testid=notify-pref] button[type=submit]');

  // ---- móvil: la campana va a la página de avisos
  const m = await login('admin@enjoy.test', { width: 390, height: 844 });
  await m.click('[data-testid=bell-mobile]');
  await m.waitForURL(/\/admin\/notifications/);
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'avisos caben en el móvil');
  await b.close();
})();
