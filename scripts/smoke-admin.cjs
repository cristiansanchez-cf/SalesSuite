/**
 * Smoke E2E de la consola (modo DEMO) — plan de verificación §13 pasos 2-7 a través de la UI:
 *   npm run build && DEV_TENANT_SLUG=enjoy PORT=4321 npm start
 *   node scripts/smoke-admin.cjs           (BASE_URL=http://127.0.0.1:4321)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  const order = () => p.$$eval('[data-testid=item]', (els) => els.map((e) => e.dataset.itemKey));
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));

  // 2. Login como rep
  await p.goto(`${BASE}/admin`);
  assert(p.url().includes('/admin/login'), 'sin sesión → login');
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(`${BASE}/admin`);
  assert((await p.textContent('[data-testid=role]')).includes('Comercial'), 'sesión de comercial');

  // 3. Crear dossier "Sala X"
  await p.fill('[data-testid=create-form] [name=title]', 'Sala X · E2E');
  await p.fill('[data-testid=create-form] [name=prospectCompany]', 'Sala X');
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  const dossierUrl = p.url();

  for (const k of ['hero-bodas', 'tabs-experiencias', 'tabs-locales', 'pricing']) {
    await p.click(`[data-testid=add-${k}]`);
    await settle();
  }
  assert(JSON.stringify(await order()) === JSON.stringify(['hero-bodas', 'tabs-experiencias', 'tabs-locales', 'pricing']), '4 módulos añadidos');

  // arrastrar el #3 arriba del todo (ratón real sobre svelte-dnd-action)
  const items = await p.$$('[data-testid=item]');
  const src = await items[2].boundingBox();
  const dst = await items[0].boundingBox();
  await p.mouse.move(src.x + 20, src.y + 20);
  await p.mouse.down();
  for (let i = 1; i <= 15; i++) await p.mouse.move(src.x + 20, src.y + 20 - ((src.y - dst.y + 10) * i) / 15);
  await p.waitForTimeout(200);
  await p.mouse.up();
  await p.waitForTimeout(400);
  await settle();
  assert(JSON.stringify(await order()) === JSON.stringify(['tabs-locales', 'hero-bodas', 'tabs-experiencias', 'pricing']), 'drag & drop: #3 arriba');

  // persistido en servidor (recarga)
  await p.reload();
  assert(JSON.stringify(await order()) === JSON.stringify(['tabs-locales', 'hero-bodas', 'tabs-experiencias', 'pricing']), 'orden persistido tras recargar');

  // botones ↓ (accesible / tablet): bajar hero bajo tabs-experiencias y volver a subirlo
  await p.click('[aria-label="Bajar Portada para bodas"]'); await settle();
  assert((await order())[2] === 'hero-bodas', 'botón bajar');
  await p.click('[aria-label="Subir Portada para bodas"]'); await settle();

  // ocultar uno (hero)
  await p.click('[aria-label="Ocultar Portada para bodas"]'); await settle();

  // per_module + override
  await p.click('[data-testid=price-mode-per_module]'); await settle();
  const priceInput = (await p.$$('[data-testid=item-price-input]'))[0];
  await priceInput.fill('250');
  await priceInput.press('Tab'); await settle();
  assert((await p.textContent('[data-testid=total]')).replace(/\s/g, ' ') === '700 €', 'total per_module 250 + 450 = 700 €');

  // 4. Publicar + enlace
  await p.click('[data-testid=publish]'); await settle();
  assert((await p.textContent('[data-testid=status]')) === 'Publicado', 'publicado');
  await p.click('[data-testid=create-link]'); await settle();
  const url = (await p.textContent('[data-testid=link-url]')).trim();
  assert(/\/d\/[A-Za-z0-9_-]{32}$/.test(url), `enlace generado ${url}`);
  if (OUT) await p.screenshot({ path: `${OUT}/builder.png`, fullPage: true });

  // 5. Abrir el enlace sin sesión
  const anon = await b.newContext({ viewport: { width: 820, height: 1180 } });
  const v = await anon.newPage();
  const r = await v.goto(url, { waitUntil: 'networkidle' });
  assert(r.status() === 200, 'enlace público 200 sin login');
  const types = await v.$$eval('[data-block-type]', (els) => els.map((e) => e.dataset.blockType));
  assert(JSON.stringify(types) === JSON.stringify(['tabs-showcase', 'tabs-showcase', 'pricing-card']), `orden público + oculto ausente ${types}`);
  const prices = await v.$$eval('[data-testid=item-price] strong', (els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
  assert(JSON.stringify(prices) === JSON.stringify(['250 €', '450 €']), `precios públicos ${prices}`);
  assert((await v.$eval('.ds-root', (e) => getComputedStyle(e).getPropertyValue('--color-primary').trim())) === '255 39 187', 'tema Enjoy');
  if (OUT) await v.screenshot({ path: `${OUT}/public-tablet.png`, fullPage: true });

  // edición en vivo: cambio de precio se ve en el enlace sin republicar
  await priceInput.fill('300'); await priceInput.press('Tab'); await settle();
  await v.reload();
  const prices2 = await v.$$eval('[data-testid=item-price] strong', (els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
  assert(prices2[0] === '300 €', 'cambio en vivo reflejado en el enlace');

  // 6. Negativos: revocar → 404; despublicar → 404
  await p.click('text=Revocar'); await p.click('[data-testid=confirm-modal-ok]'); await settle();
  assert((await v.goto(url)).status() === 404, 'enlace revocado → 404');
  await p.click('[data-testid=create-link]'); await settle();
  const url2 = (await p.$$eval('[data-state=active] [data-testid=link-url]', (els) => els.map((e) => e.textContent.trim())))[0];
  assert((await v.goto(url2)).status() === 200, 'nuevo enlace 200');
  await p.click('text=Despublicar'); await p.click('[data-testid=confirm-modal-ok]'); await settle();
  assert((await v.goto(url2)).status() === 404, 'despublicado → 404');

  // otro tenant no ve el dossier
  const other = await b.newContext();
  const o = await other.newPage();
  await o.goto(`${BASE}/admin/login`);
  await o.click('[data-testid="demo-rep@retheme.test"]');
  assert((await o.goto(dossierUrl)).status() === 403, 'usuario de otro tenant → 403 en este host');

  // admin del tenant puede editarlo; otro rep no
  const adm = await b.newContext();
  const a = await adm.newPage();
  await a.goto(`${BASE}/admin/login`);
  await a.click('[data-testid="demo-admin@enjoy.test"]');
  await a.goto(dossierUrl);
  assert(await a.isEnabled('[data-testid=title]'), 'admin puede editar dossier de un rep');

  // móvil: pestañas editar / vista previa
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(dossierUrl);
  assert(await m.isVisible('[data-testid=title]'), 'móvil: editor visible');
  assert(!(await m.isVisible('[data-testid=preview]')), 'móvil: preview oculta hasta pulsar la pestaña');
  await m.click('role=tab[name="Vista previa"]');
  assert(await m.isVisible('[data-testid=preview]'), 'móvil: pestaña vista previa');
  if (OUT) await m.screenshot({ path: `${OUT}/builder-mobile.png` });

  assert(errors.length === 0, `sin errores JS ${errors}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
