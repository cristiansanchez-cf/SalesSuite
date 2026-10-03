/**
 * Smoke E2E de la gestión del tenant (modo DEMO): catálogo, equipo y marca.
 *   DEMO_MODE=1 DEV_TENANT_SLUG=enjoy PORT=4321 npm start
 *   node scripts/smoke-tenant-admin.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
// Sufijo por ejecución: el script se puede repetir contra el mismo servidor.
const RUN = Date.now().toString(36);
const KEY = `hero-locales-${RUN}`;
const INVITE = `nueva.${RUN}@enjoy.test`;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (email) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(`${BASE}/admin`);
    return p;
  };
  const errors = [];

  // rep: sin acceso a gestión
  const rep = await login('rep@enjoy.test');
  assert(!(await rep.isVisible('a[href="/admin/catalog"]')), 'rep no ve Catálogo en el menú');
  assert((await rep.goto(`${BASE}/admin/catalog`)).status() === 403, 'rep → /admin/catalog 403');

  const p = await login('admin@enjoy.test');
  p.on('pageerror', (e) => errors.push(e.message));

  // ---- catálogo: crear módulo, JSON inválido, válido, publicar
  await p.click('a[href="/admin/catalog"]');
  await p.fill('[data-testid=create-module] [name=name]', `Hero · Locales ${RUN}`);
  await p.fill('[data-testid=create-module] [name=key]', KEY);
  await p.click('[data-testid=create-module] button[type=submit]');
  await p.waitForURL(/\/admin\/catalog\/[0-9a-f-]{36}\?ok=created/);
  await p.fill('[data-testid=props]', '{"title": ""}');
  await p.click('button[value=save]');
  assert((await p.textContent('[data-testid=error]')).includes('title'), 'JSON inválido para el bloque → error con el campo');
  await p.fill('[data-testid=props]', JSON.stringify({ eyebrow: 'Para {company}', title: 'Tu local, lleno cada', rotatingWords: ['viernes', 'sábado'] }));
  await p.fill('[name=defaultPrice]', '199');
  await p.click('[data-testid=publish-version]');
  await p.waitForURL(`${BASE}/admin/catalog?ok=published`);
  const row = await p.textContent(`[data-module-key=${KEY}]`);
  assert(row.includes('Publicada') && row.includes('199'), 'módulo publicado con precio');

  // aparece en el builder
  await p.goto(`${BASE}/admin`);
  await p.fill('[data-testid=create-form] [name=title]', 'Prueba catálogo');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\//);
  assert(await p.isVisible(`[data-testid=add-${KEY}]`), 'nuevo módulo disponible en el builder');

  // ---- equipo: invitar
  await p.goto(`${BASE}/admin/team`);
  await p.fill('[data-testid=invite-form] [name=email]', INVITE);
  await p.click('[data-testid=invite-form] button');
  await p.waitForURL(`${BASE}/admin/team?ok=invited`);
  assert((await p.textContent('[data-testid=members]')).includes(INVITE), 'invitada aparece en el equipo');
  // no se puede quitar el último admin
  const adminRow = p.locator('[data-testid=members] li', { hasText: 'admin@enjoy.test' });
  await adminRow.locator('button', { hasText: 'Quitar' }).click();
  assert((await p.textContent('[role=alert]')).includes('al menos un admin'), 'no se quita al último admin');
  // la invitada puede entrar (demo) como comercial
  const nueva = await login(INVITE);
  assert((await nueva.textContent('[data-testid=role]')).includes('Comercial'), 'invitada entra como comercial');

  // ---- marca: color + WhatsApp + logo → visible en enlace público
  await p.goto(`${BASE}/admin/brand`);
  await p.fill('[name=color_primary]', '#7c3aed');
  await p.fill('[name=whatsapp]', '+34 600 111 222');
  await p.fill('[name=ogImageUrl]', '/demo/enjoy-logo-placeholder.svg');
  await p.click('[data-testid=brand-form] button[type=submit]');
  await p.waitForURL(`${BASE}/admin/brand?ok=saved`);
  if (OUT) await p.screenshot({ path: `${OUT}/brand-admin.png`, fullPage: false });
  await p.fill('[name=color_primary]', 'rojo');
  await p.evaluate(() => document.querySelector('[data-testid=brand-form]').noValidate = true);
  await p.click('[data-testid=brand-form] button[type=submit]');
  assert((await p.textContent('[data-testid=error]')).includes('colors.primary'), 'color inválido → error');

  const v = await (await b.newContext()).newPage();
  await v.goto(`${BASE}/d/demo-sala-x-7Qm2`);
  assert((await v.$eval('.ds-root', (e) => getComputedStyle(e).getPropertyValue('--color-primary').trim())) === '124 58 237', 'nuevo color en el enlace público');
  assert((await v.getAttribute('[data-testid=brand-bar] a', 'href')).startsWith('https://wa.me/34600111222'), 'CTA de WhatsApp en cabecera');
  assert((await v.getAttribute('meta[property="og:image"]', 'content')) === `${BASE}/demo/enjoy-logo-placeholder.svg`, 'og:image absoluta');
  if (OUT) await v.screenshot({ path: `${OUT}/public-branded.png` });

  assert(errors.length === 0, `sin errores JS ${errors}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
