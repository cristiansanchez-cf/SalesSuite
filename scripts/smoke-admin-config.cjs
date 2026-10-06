/**
 * Smoke de la configuración del admin (docs/ORG.md, COMMISSIONS.md, SETUP_WIZARD.md, GUIA_UX_ADMIN.md):
 * equipo (cambiar rol y quitar; el quitado ya no entra), territorio (zona, cobertura, reglas), comisiones
 * (plan propio asignado, conector de la API, cupón desactivado), tarifas (desactivar/activar), marca (color de acento
 * + vista previa) y configuración guiada (los cinco pasos, añadiendo un sector).
 * Usa una persona invitada con nombre único (no depende del rol de rep@enjoy.test) y deja la marca y las reglas como estaban.
 *   npm run build && npm run start:demo ; node scripts/smoke-admin-config.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const NEW = `cfg.${RUN}@enjoy.test`;
const ZONE = `Zona ${RUN}`;
const PLAN = `Plan ${RUN}`;
const CONNECTOR = `smoke-${RUN}`;
const COUPON = `CFG${RUN}`.toUpperCase().slice(0, 30);
const PRICE = `Tarifa ${RUN}`;
const SECTOR = `Sector ${RUN}`;
const ACCENT = '#0f766e';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const login = async (email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
    p.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const p = await login('admin@enjoy.test');

  // ---- Equipo: invitar (lo imprescindible) y cambiar rol
  await p.goto(`${BASE}/admin/team`);
  await p.click('[data-dialog-open=invite]');
  await p.fill('[data-testid=invite-form] [name=email]', NEW);
  await p.click('[data-testid=invite-form] button[type=submit]');
  await p.waitForURL(/ok=invited/);
  const row = () => p.locator('[data-testid=members] li', { hasText: NEW });
  const userId = (await row().locator('[data-dialog-open^="role-"]').getAttribute('data-dialog-open')).slice(5);
  const person = await login(NEW);
  assert((await person.textContent('[data-testid=role]')).includes('Comercial'), 'invitada: entra como comercial');
  assert((await person.goto(`${BASE}/admin/setup`)).status() === 403, 'comercial: sin configuración guiada (403)');

  await row().locator(`[data-dialog-open="role-${userId}"]`).click();
  await p.selectOption(`dialog#role-${userId} [name=role]`, 'lead');
  await p.click(`dialog#role-${userId} button[type=submit]`);
  await p.waitForURL(/ok=role/);
  assert((await row().textContent()).includes('Gerente'), 'cambiar rol: ahora gerente en el equipo');
  await person.goto(`${BASE}/admin`);
  assert((await person.textContent('[data-testid=role]')).includes('Gerente'), 'la persona ve su nuevo rol al navegar');
  assert((await person.goto(`${BASE}/admin/setup`)).status() === 200, 'gerente: entra en la configuración guiada');
  assert((await person.goto(`${BASE}/admin/brand`)).status() === 403 && (await person.goto(`${BASE}/admin/prices`)).status() === 403, 'gerente: sin marca ni tarifas (403)');

  // ---- Territorio: zona nueva, cobertura para la nueva persona, reglas
  await p.goto(`${BASE}/admin/territory`);
  await p.fill('[data-testid=zone-form] [name=name]', ZONE);
  await p.selectOption('[data-testid=zone-form] [name=kind]', 'region');
  await Promise.all([p.waitForNavigation(), p.click('[data-testid=zone-form] button[type=submit]')]);
  const zone = () => p.locator(`[data-testid=zone][data-name="${ZONE}"]`);
  assert(await zone().isVisible(), 'territorio: zona nueva en el árbol');
  const assign = p.locator(`[data-testid=assign][data-user="${NEW}"]`);
  await assign.locator('label.co-chip', { hasText: ZONE }).click();
  await Promise.all([p.waitForNavigation(), assign.locator('button[type=submit]').click()]);
  assert((await zone().textContent()).includes(NEW) && await p.locator(`[data-testid=assign][data-user="${NEW}"] label.co-chip:has-text("${ZONE}") input`).isChecked(), 'territorio: la zona cubierta por la nueva persona');
  const days = await p.inputValue('[data-testid=rules] [name=claimDays]');
  await p.fill('[data-testid=rules] [name=claimDays]', '45');
  await Promise.all([p.waitForNavigation(), p.click('[data-testid=rules] button[type=submit]')]);
  assert((await p.inputValue('[data-testid=rules] [name=claimDays]')) === '45', 'territorio: reglas guardadas (45 días de reserva)');
  await p.fill('[data-testid=rules] [name=claimDays]', days);
  await Promise.all([p.waitForNavigation(), p.click('[data-testid=rules] button[type=submit]')]);
  assert((await p.inputValue('[data-testid=rules] [name=claimDays]')) === days, `territorio: reglas restauradas (${days} días)`);
  if (OUT) await p.screenshot({ path: `${OUT}/config-territory.png`, fullPage: true });

  // ---- Comisiones: plan propio asignado, conector de la API, cupón desactivado
  await p.goto(`${BASE}/admin/commissions/team?tab=plan`);
  const plans = p.locator('[data-testid=plans]');
  await plans.locator('form:has(input[value=plan-new]) [name=name]').fill(PLAN);
  await plans.locator('form:has(input[value=plan-new]) [name=pct]').fill('15');
  await Promise.all([p.waitForNavigation(), plans.locator('form:has(input[value=plan-new]) button[type=submit]').click()]);
  assert((await plans.textContent()).includes(PLAN), 'plan: creado con su porcentaje');
  const sel = plans.locator(`form:has(input[name=userId][value="${userId}"]) select[name=planId]`);
  await Promise.all([p.waitForNavigation(), sel.selectOption({ label: PLAN })]);
  assert((await plans.locator(`form:has(input[name=userId][value="${userId}"]) select[name=planId] option:checked`).textContent()) === PLAN, 'plan: asignado a la nueva persona');
  await Promise.all([p.waitForNavigation(), plans.locator(`form:has(input[value=plan-delete]):has-text("${PLAN}") button[type=submit]`).click()]);
  assert(!(await plans.textContent()).includes(PLAN), 'plan: borrado');

  await p.goto(`${BASE}/admin/commissions/team?tab=api`);
  const conn = p.locator('[data-testid=connectors]');
  await conn.locator('form:has(input[value=connector]) [name=key]').fill(CONNECTOR);
  await conn.locator('form:has(input[value=connector]) [name=name]').fill(`Conector ${RUN}`);
  await Promise.all([p.waitForNavigation(), conn.locator('form:has(input[value=connector]) button[type=submit]').click()]);
  assert((await conn.textContent()).includes(`/api/v1/ingest/${CONNECTOR}`), 'API: conector guardado con su URL');
  await Promise.all([p.waitForNavigation(), conn.locator(`form:has(input[value=connector-delete]):has-text("${CONNECTOR}") button[type=submit]`).click()]);
  assert(!(await conn.textContent()).includes(`/api/v1/ingest/${CONNECTOR}`), 'API: conector borrado');

  await p.goto(`${BASE}/admin/commissions/team?tab=cupones`);
  await p.fill('[data-testid=coupon-form] [name=label]', `5 € de bienvenida ${RUN}`);
  await p.fill('[data-testid=coupon-form] [name=code]', COUPON);
  await p.click('[data-testid=coupon-form] label.co-option:has(input[value=fixed])');
  await p.fill('[data-testid=coupon-form] [name=value]', '5');
  await Promise.all([p.waitForNavigation(), p.click('[data-testid=coupon-form] button[type=submit]')]);
  const coupon = () => p.locator(`[data-testid=coupon][data-code="${COUPON}"]`);
  assert((await coupon().locator('.co-badge').textContent()).trim() === 'Activo', 'cupón fijo creado y activo');
  await Promise.all([p.waitForNavigation(), coupon().locator('button[type=submit]').click()]);
  assert((await coupon().getAttribute('class')).includes('opacity-60') && (await coupon().locator('.co-badge').textContent()).trim() === 'Desactivado', 'cupón desactivado');

  // ---- Tarifas: crear y desactivar/activar
  await p.goto(`${BASE}/admin/prices`);
  await p.fill('[data-testid=price-option-form] [name=label]', PRICE);
  await p.fill('[data-testid=price-option-form] [name=amount]', '99');
  await p.selectOption('[data-testid=price-option-form] [name=currency]', 'USD');
  await p.click('[data-testid=price-option-form] button[type=submit]');
  await p.waitForURL(/ok=created/);
  const price = () => p.locator(`[data-testid=price-option][data-label="${PRICE}"]`);
  assert((await price().textContent()).includes('99'), 'tarifa creada en dólares');
  await price().locator('button[type=submit]').click();
  await p.waitForURL(/ok=off/);
  assert((await price().getAttribute('class')).includes('opacity-60'), 'tarifa desactivada');
  await price().locator('button[type=submit]').click();
  await p.waitForURL(/ok=on/);
  assert(!(await price().getAttribute('class')).includes('opacity-60'), 'tarifa activada de nuevo');

  // ---- Marca: color de acento válido y vista previa; se deja como estaba
  await p.goto(`${BASE}/admin/brand`);
  const prevAccent = await p.inputValue('[name=color_accent]');
  await p.fill('[name=color_accent]', ACCENT);
  await p.click('[data-testid=brand-form] button[type=submit]');
  await p.waitForURL(/ok=saved/);
  assert((await p.inputValue('[name=color_accent]')) === ACCENT, 'marca: color de acento guardado');
  const frame = p.frameLocator('[data-testid=brand-preview]');
  await frame.locator('.ds-root').first().waitFor();
  const accent = await frame.locator('.ds-root').first().evaluate((e) => getComputedStyle(e).getPropertyValue('--color-accent').trim());
  assert(accent === '15 118 110', `marca: la vista previa usa el nuevo acento (${accent})`);
  if (OUT) await p.screenshot({ path: `${OUT}/config-brand.png`, fullPage: false });
  await p.fill('[name=color_accent]', prevAccent);
  await p.click('[data-testid=brand-form] button[type=submit]');
  await p.waitForURL(/ok=saved/);
  assert((await p.inputValue('[name=color_accent]')) === prevAccent, 'marca: acento restaurado');

  // ---- Configuración guiada: los cinco pasos, avanzando con «Siguiente»
  await p.goto(`${BASE}/admin/setup`);
  assert(await p.isVisible('[data-testid=setup-presets]'), 'paso 1: puntos de partida');
  await p.click('a[href="/admin/setup?step=2"].co-card');
  await p.waitForURL(/step=2$/);
  await p.fill('[data-testid=setup-segment-form] [name=name]', SECTOR);
  await p.click('[data-testid=setup-segment-form] button[type=submit]');
  await p.waitForURL(/step=2&ok=segment/);
  assert((await p.textContent('[data-testid=setup-segments]')).includes(SECTOR), 'paso 2: sector añadido');
  for (const n of [3, 4, 5]) {
    await p.click(`main a.co-btn--primary[href="/admin/setup?step=${n}"]`);
    await p.waitForURL(new RegExp(`step=${n}$`));
    assert((await p.getAttribute('.co-steps li[aria-current=step] a', 'href')) === `/admin/setup?step=${n}`, `paso ${n}: carga y queda marcado`);
  }
  assert(await p.isVisible('[data-testid=setup-done]'), 'paso 5: revisión final');
  await p.goto(`${BASE}/admin/setup?step=3`);
  assert(await p.isVisible(`[data-testid=setup-actors]:has-text("${SECTOR}")`), 'paso 3: el sector nuevo pide sus actores');
  if (OUT) await p.screenshot({ path: `${OUT}/config-setup.png`, fullPage: true });
  // Se archiva el sector de prueba para no ensuciar «Aprende» ni el mercado de otros smokes.
  await p.goto(`${BASE}/admin/setup?step=2`);
  await p.click(`[data-testid=setup-segments] a:has-text("${SECTOR}")`);
  await p.waitForURL(/\/admin\/playbook\/segment\//);
  await p.selectOption('[data-testid=segment-form] [name=status]', 'archived');
  await p.click('[data-testid=segment-form] button[type=submit]');
  await p.waitForURL(/ok=saved/);
  assert((await p.inputValue('[data-testid=segment-form] [name=status]')) === 'archived', 'sector de prueba archivado');
  await p.goto(`${BASE}/admin/learn`);
  assert(!(await p.textContent('main')).includes(SECTOR), 'archivado: ya no sale en «Aprende»');

  // ---- Equipo: quitar; la persona quitada ya no entra
  await p.goto(`${BASE}/admin/team`);
  await row().locator('[data-testid=remove-open]').click();
  await row().locator('[data-testid=remove-confirm]').click();
  await p.waitForURL(/ok=removed/);
  assert(!(await p.textContent('[data-testid=members]')).includes(NEW), 'quitar: ya no está en el equipo');
  assert((await person.goto(`${BASE}/admin`)).status() === 403, 'la persona quitada: su sesión abierta ya no entra (403)');
  const again = await login(NEW);
  assert((await again.goto(`${BASE}/admin/accounts`)).status() === 403, 'la persona quitada: al volver a entrar, 403');

  assert(errors.length === 0, `sin errores JS ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
