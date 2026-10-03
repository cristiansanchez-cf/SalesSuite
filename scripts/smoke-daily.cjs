/**
 * Smoke del resumen diario (docs/NOTIFICATIONS.md): preferencia y zona horaria en Mi cuenta, envío forzado por el cron,
 * contenido del email y enlace «Preparar mensaje» que abre el mensaje ya preparado.
 *   npm run build && npm run start:demo ; node scripts/smoke-daily.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // 1. Mi cuenta: activado por defecto, zona horaria que se guarda.
  await p.goto(`${BASE}/admin/account`);
  assert(await p.isChecked('[data-testid=daily-pref]'), 'resumen diario activado por defecto');
  assert((await p.inputValue('[data-testid=timezone]')) === 'Europe/Madrid', 'zona horaria por defecto: Madrid');
  await p.selectOption('[data-testid=timezone]', 'Asia/Seoul');
  await p.click('[data-testid=notify-pref] button[type=submit]');
  await p.waitForLoadState();
  assert((await p.inputValue('[data-testid=timezone]')) === 'Asia/Seoul', 'zona horaria guardada (Seúl)');
  await p.selectOption('[data-testid=timezone]', 'Europe/Madrid');
  await p.click('[data-testid=notify-pref] button[type=submit]');
  await p.waitForLoadState();

  // 2. Cron forzado: sale el resumen del comercial.
  const res = await p.request.get(`${BASE}/api/cron/notifications?daily=force&digest=skip`);
  const body = await res.json();
  assert(res.ok() && body.daily >= 1, `el cron envía resúmenes diarios (${body.daily})`);
  const again = await (await p.request.get(`${BASE}/api/cron/notifications?daily=force&digest=skip`)).json();
  assert(again.daily === 0, 'repetirlo el mismo día no duplica');

  // 3. El email: lo que toca mover, con el mensaje preparado.
  const text = await (await p.request.get(`${BASE}/api/dev/outbox?tag=daily&to=rep@enjoy.test&format=text`)).text();
  assert(/^Enjoy the Club: \d+ cosas? para hoy/.test(text), 'asunto: cuántas cosas para hoy');
  assert(text.includes('Club Sol') && text.includes('TE HAN ABIERTO LA PROPUESTA'), 'Club Sol: la han abierto');
  assert(text.includes('Hotel Mar Azul') && text.includes('SIN PRÓXIMO PASO'), 'Mar Azul: sin próximo paso');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/api/dev/outbox?tag=daily&to=rep@enjoy.test`);
  if (OUT) await page.screenshot({ path: `${OUT}/daily-email.png`, fullPage: true });
  const href = await page.getAttribute('a:has-text("Preparar mensaje")', 'href');
  assert(/\/admin\/compose\?dossier=[0-9a-f-]+&type=(seguimiento|tras_reunion)&go=1$/.test(href ?? ''), 'enlace a Preparar mensaje con la propuesta');

  // 4. Ese enlace abre el mensaje ya preparado, sin rellenar nada.
  await p.goto(href.replace(/^https?:\/\/[^/]+/, BASE));
  assert(await p.isVisible('[data-testid=brief]'), 'Preparar mensaje: contexto listo al abrir');

  // 5. Desactivarlo: el cron ya no se lo manda (al día siguiente). Volver a activarlo para otros smokes.
  await p.goto(`${BASE}/admin/account`);
  await p.uncheck('[data-testid=daily-pref]');
  await p.click('[data-testid=notify-pref] button[type=submit]');
  await p.waitForLoadState();
  assert(!(await p.isChecked('[data-testid=daily-pref]')), 'se puede desactivar');
  await p.check('[data-testid=daily-pref]');
  await p.click('[data-testid=notify-pref] button[type=submit]');
  await b.close();
})();
