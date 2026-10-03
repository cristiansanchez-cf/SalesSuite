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
  await p.click('[data-testid=mode-setup]');
  await p.click('.co-sidebar .co-nav a[href="/admin/catalog"]');
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
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=title]', 'Prueba catálogo');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\//);
  assert(await p.isVisible(`[data-testid=add-${KEY}]`), 'nuevo módulo disponible en el builder');

  // ---- equipo: invitar
  await p.goto(`${BASE}/admin/team`);
  await p.click('[data-dialog-open=invite]');
  await p.fill('[data-testid=invite-form] [name=email]', INVITE);
  await p.click('[data-testid=invite-form] button[type=submit]');
  await p.waitForURL(`${BASE}/admin/team?ok=invited`);
  assert((await p.textContent('[data-testid=members]')).includes(INVITE), 'invitada aparece en el equipo');
  // no se puede quitar el último admin
  const adminRow = p.locator('[data-testid=members] li', { hasText: 'admin@enjoy.test' });
  await adminRow.locator('[data-testid=remove-open]').click();
  await adminRow.locator('[data-testid=remove-confirm]').click();
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

  // ---- configuración guiada: punto de partida (solo añade) y situación nueva
  await p.goto(`${BASE}/admin/setup`);
  await p.click('[data-testid=preset-buceo]');
  await p.click('[data-testid=preset-buceo-dialog-confirm]');
  await p.waitForURL(/step=2&ok=preset-3-/);
  assert((await p.textContent('[role=status]')).includes('Lo que ya tenías no se ha tocado'), 'punto de partida aplicado sin tocar lo existente');
  assert((await p.textContent('[data-testid=setup-segments]')).includes('Hoteles y posadas con centro de buceo'), 'sectores del punto de partida');
  await p.goto(`${BASE}/admin/setup?step=3`);
  assert((await p.textContent('main')).includes('puede tumbarla'), 'actores con quién puede tumbar la venta');
  assert((await p.$$('[data-testid=actor-card]')).length >= 4, 'actores en tarjetas');
  await p.click('[data-testid=add-actor-bodas]');
  await p.fill('[data-testid=setup-persona-form]:visible [name=name]', `Wedding planner ${RUN}`);
  await p.locator('[data-testid=setup-persona-form]:visible label.co-option', { hasText: 'Influye' }).first().click();
  await p.fill('[data-testid=setup-persona-form]:visible [name=canBlock]', 'Si no lo propone ella, lo descarta.');
  await p.click('[data-testid=setup-persona-form]:visible button[type=submit]');
  await p.waitForURL(/ok=persona/);
  assert((await p.textContent('[data-testid=setup-actors][data-segment=bodas]')).includes(`Wedding planner ${RUN}`), 'actor añadido desde la tarjeta, ya en su sector');
  await p.goto(`${BASE}/admin/setup?step=4`);
  await p.fill('[data-testid=setup-facet-form] [name=label]', `Temporada ${RUN}`);
  await p.fill('[data-testid=setup-facet-form] [name=options]', 'Alta\nBaja');
  await p.click('[data-testid=setup-facet-form] button[type=submit]');
  await p.waitForURL(/ok=facet/);
  assert((await p.textContent('[data-testid=setup-facets]')).includes(`Temporada ${RUN}`), 'situación nueva creada por el líder');
  await p.goto(`${BASE}/admin/setup?step=5`);
  assert((await p.$$('[data-testid=setup-done] .co-action')).length === 5, 'revisión final con lo que falta');
  if (OUT) await p.screenshot({ path: `${OUT}/setup.png`, fullPage: true });

  assert(errors.length === 0, `sin errores JS ${errors}`);
  // ---- Tarifas y pagos: el admin fija lo que el equipo puede elegir como precio
  await p.goto(`${BASE}/admin/prices`);
  await p.fill('[data-testid=price-option-form] [name=label]', `Local grande ${RUN}`);
  await p.fill('[data-testid=price-option-form] [name=amount]', '499');
  await p.click('[data-testid=price-option-form] label:has-text("Al mes")');
  await p.fill('[data-testid=price-option-form] [name=paymentLink]', 'https://buy.stripe.com/test_grande');
  await p.click('[data-testid=price-option-form] button[type=submit]');
  await p.waitForURL(/ok=created/);
  assert((await p.textContent('[data-testid=price-options]')).includes(`Local grande ${RUN}`), 'tarifa creada con su enlace de pago');
  if (OUT) await p.screenshot({ path: `${OUT}/prices-admin.png`, fullPage: true });

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
