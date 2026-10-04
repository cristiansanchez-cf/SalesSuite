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

  // Inicio: una sola cosa destacada («Lo siguiente») y el día en tres números.
  await p.goto(`${BASE}/admin/inicio`);
  assert(await p.isVisible('[data-testid=home-focus]'), 'Inicio: «Lo siguiente» destacado');
  await p.goto(`${BASE}/admin`);
  assert((await p.locator('[data-testid=dossier-list] [data-group]').count()) >= 1, 'Dossiers: agrupados por lo que piden');
  assert(!(await p.isVisible('[data-testid=create-form]')), 'el formulario no ocupa la pantalla hasta pedirlo');
  await p.goto(`${BASE}/admin/inicio`);
  await p.click('[data-testid=home-new]');
  await p.waitForURL(/\/admin#nuevo/);
  await p.waitForSelector('[data-testid=create-form]', { state: 'visible' });
  assert(await p.isVisible('[data-testid=create-form]'), '«Nueva propuesta» desde Inicio abre el formulario');
  await p.goto(`${BASE}/admin`);

  // 3. Crear dossier "Sala X"
  await p.click('[data-testid=new-dossier]');
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
  await p.evaluate(() => document.querySelector('[data-testid=items]').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(500);
  const items = await p.$$('[data-testid=item]');
  const src = await items[2].boundingBox();
  const dst = await items[0].boundingBox();
  await p.mouse.move(src.x + 20, src.y + 20);
  await p.mouse.down();
  for (let i = 1; i <= 15; i++) { await p.mouse.move(src.x + 20, src.y + 20 - ((src.y - dst.y + 10) * i) / 15); await p.waitForTimeout(40); }
  for (let i = 0; i < 4; i++) { await p.mouse.move(src.x + 24 + i * 4, dst.y + 6); await p.waitForTimeout(80); }  // se queda un momento antes de soltar
  await p.mouse.up();
  await p.waitForTimeout(400);
  await settle();
  assert(JSON.stringify(await order()) === JSON.stringify(['tabs-locales', 'hero-bodas', 'tabs-experiencias', 'pricing']), `drag & drop: #3 arriba (${await order()})`);

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
  // El precio está a mano pero plegado: no es lo primero.
  assert((await p.getAttribute('[data-testid=price-panel]', 'open')) === null, 'precio plegado mientras no hay precio');
  await p.click('[data-testid=price-panel] summary');
  assert(!(await p.$('[data-testid=item-price-input]')) && !(await p.$('[data-testid=price-mode-total]')), 'el comercial no escribe precios: elige tarifa');
  // Precio en dos pasos: el tipo marca su tarifa típica.
  await p.locator('[data-testid=price-kind]', { hasText: 'Boda' }).click(); await settle();
  assert((await p.textContent('[data-testid=total]')).replace(/\s/g, ' ') === '700 €', 'tipo «Boda» → su tarifa típica, 700 €');
  const pay = new URL((await p.textContent('[data-testid=payment-url]')).trim());
  assert(pay.hostname === 'buy.stripe.com' && pay.searchParams.get('client_reference_id') === `dossier_${p.url().split('/').pop()}`, 'enlace de pago con la propuesta (el vendedor)');

  // 4. Publicar + enlace
  await p.click('[data-testid=publish]'); await settle(); await settle();
  assert((await p.textContent('[data-testid=status]')) === 'Publicado', 'publicado');
  assert(/\/d\/[A-Za-z0-9_-]{32}$/.test((await p.textContent('[data-testid=share-url]')).trim()), 'publicar crea el enlace en el mismo paso');
  assert((await p.getAttribute('[data-testid=view-mode-test]', 'aria-checked')) === 'true', 'una propuesta nueva empieza en modo prueba');
  await p.click('[data-testid=view-mode-live]'); await settle();
  assert((await p.getAttribute('[data-testid=view-mode-live]', 'aria-checked')) === 'true', 'pasa a real');
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
  assert((await v.textContent('body')).replace(/\s/g, ' ').includes('700 €'), 'precio de la tarifa en el enlace público');
  const payHref = await v.getAttribute('[data-testid=pricing-pay]', 'href');
  assert(payHref?.startsWith('https://buy.stripe.com/test_boda') && /client_reference_id=dossier_[0-9a-f-]{36}/.test(payHref), `«Pagar» lleva la tarifa y la propuesta (→ comisión de quien vende): ${payHref}`);
  assert((await v.$eval('.ds-root', (e) => getComputedStyle(e).getPropertyValue('--color-primary').trim())) === '255 39 187', 'tema Enjoy');
  if (OUT) await v.screenshot({ path: `${OUT}/public-tablet.png`, fullPage: true });

  // edición en vivo: cambio de precio se ve en el enlace sin republicar
  await p.click('[data-testid=price-kinds-more]').catch(() => {});
  await p.locator('[data-testid=price-kind]', { hasText: 'Evento suelto' }).click(); await settle();
  await v.reload();
  assert((await v.textContent('body')).replace(/\s/g, ' ').includes('150 €'), 'cambio de tarifa reflejado en vivo en el enlace');
  assert(!(await v.$('[data-testid=pricing-pay]')), 'tarifa sin enlace de pago: sin botón «Pagar»');
  // A medida: se ve con su aviso y no cambia el precio.
  await p.locator('[data-testid=price-kind]', { hasText: 'Festival' }).click(); await settle();
  assert((await p.textContent('[data-testid=price-quote-only]')).includes('prueba de carga'), 'tarifa a medida: se ve con su aviso');
  await v.reload();
  assert((await v.textContent('body')).replace(/\s/g, ' ').includes('150 €'), 'y no se elige: el precio sigue igual');

  // 6. Negativos: revocar → 404; despublicar → 404
  await p.click('text=Revocar'); await p.click('[data-testid=confirm-modal-ok]'); await settle();
  assert((await v.goto(url)).status() === 404, 'enlace revocado → 404');
  await p.click('[data-testid=create-link]'); await settle();
  const url2 = (await p.$$eval('[data-state=active] [data-testid=link-url]', (els) => els.map((e) => e.textContent.trim())))[0];
  assert((await v.goto(url2)).status() === 200, 'nuevo enlace 200');
  await p.click('text=Despublicar'); await p.click('[data-testid=confirm-modal-ok]'); await settle();
  assert((await v.goto(url2)).status() === 404, 'despublicado → 404');

  // Arrastrar un módulo desde «Añadir» a una propuesta nueva (ventana alta: catálogo y lista a la vista).
  {
    const g = await (await b.newContext({ viewport: { width: 1440, height: 1800 } })).newPage();
    await g.goto(`${BASE}/admin/login`);
    await g.click('[data-testid="demo-rep@enjoy.test"]');
    await g.waitForURL(/\/admin/);
    await g.goto(`${BASE}/admin`);
    await g.click('[data-testid=new-dossier]');
    await g.fill('[data-testid=create-form] [name=title]', 'Arrastre · E2E');
    await g.click('[data-testid=create-form] button[type=submit]');
    await g.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
    await g.waitForTimeout(1000);  // el editor (isla) tiene que estar hidratado para arrastrar
    assert(await g.isVisible('[data-testid=quick-start]'), 'propuesta vacía: «Empieza rápido»');
    const from = await g.locator('[data-testid=catalog] li').first().boundingBox();
    const to = await g.locator('[data-testid=items]').boundingBox();
    await g.mouse.move(from.x + 30, from.y + 15);
    await g.mouse.down();
    for (let i = 1; i <= 20; i++) { await g.mouse.move(from.x + 30 + ((to.x + 40 - from.x - 30) * i) / 20, from.y + 15 + ((to.y + 20 - from.y - 15) * i) / 20); await g.waitForTimeout(30); }
    // Como una persona: se queda un momento sobre la zona antes de soltar.
    for (let i = 0; i < 5; i++) { await g.mouse.move(to.x + 60 + i * 10, to.y + 30); await g.waitForTimeout(80); }
    await g.mouse.up();
    await g.waitForTimeout(1500);
    assert((await g.locator('[data-testid=item]').count()) === 1, 'arrastrar desde «Añadir» lo mete en la propuesta');
    if (OUT) await g.screenshot({ path: `${OUT}/builder-drag.png`, fullPage: true });
    await g.close();
  }

  // montar la propuesta con la receta del sector (docs/PROPOSAL_PRESETS.md)
  {
    const g = await (await b.newContext({ viewport: { width: 1440, height: 1800 } })).newPage();
    await g.goto(`${BASE}/admin/login`);
    await g.click('[data-testid="demo-rep@enjoy.test"]');
    await g.waitForURL(/\/admin/);
    await g.goto(`${BASE}/admin`);
    await g.click('[data-testid=new-dossier]');
    await g.fill('[data-testid=create-form] [name=title]', 'Preset · E2E');
    await g.click('[data-testid=create-form] button[type=submit]');
    await g.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
    await g.waitForTimeout(1000);
    assert(!(await g.isVisible('[data-testid=preset]')), 'sin sector, no hay receta que montar');
    await g.click('[data-testid=quick-start] .co-chip:has-text("ocio")').catch(async () => g.click('[data-testid=quick-start] .co-chip >> nth=1'));
    await g.waitForSelector('[data-testid=preset]');
    assert(await g.isVisible('[data-testid=preset-mode-visual]'), 'dos modos: va sola / apoyo visual');
    await g.check('[data-testid=preset-q-dj]');
    await g.click('[data-testid=preset-apply]');
    await g.waitForTimeout(1500);
    const keys = await g.$$eval('[data-testid=item]', (els) => els.map((e) => e.dataset.itemKey));
    assert(JSON.stringify(keys) === JSON.stringify(['pantalla-en-vivo', 'movil-invitado', 'tabs-experiencias']), `propuesta montada con la pregunta del DJ: ${keys.join(' → ')}`);
    assert((await g.textContent('[data-testid=preset-apply]')).includes('Volver'), 'se puede volver a montar');
    await g.fill('[data-testid=preset-save-name]', 'José María');
    await g.click('[data-testid=preset-save] button[type=submit]');
    await g.waitForSelector('[data-testid=preset-tpl]');
    assert((await g.textContent('[data-testid=preset-saved]')).includes('José María'), 'combinación guardada con nombre, lista para aplicar de golpe');
    if (OUT) await g.screenshot({ path: `${OUT}/builder-preset.png`, fullPage: true });
    await g.close();
  }

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
