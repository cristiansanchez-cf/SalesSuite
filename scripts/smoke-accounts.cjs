/**
 * Smoke de zonas y cuentas (modo DEMO, docs/ACCOUNTS.md): mi zona, quedarse una cuenta, registrar contacto,
 * propuesta desde la cuenta, compañeros de zona con teléfono, territorio, importación y bloqueo.
 *   npm run build && npm run start:demo ; node scripts/smoke-accounts.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const names = (p) => p.$$eval('[data-testid=account]', (els) => els.map((e) => e.dataset.name));

  // ---- admin: territorio, teléfono y bloqueo
  const admin = await login('admin@enjoy.test');
  await admin.goto(`${BASE}/admin/territory`);
  await admin.fill('[data-testid=zone-form] [name=name]', `Alicante ${RUN}`);
  await admin.selectOption('[data-testid=zone-form] [name=parentId]', { label: '   Comunidad Valenciana' });
  await admin.click('[data-testid=zone-form] button[type=submit]');
  await admin.waitForLoadState();
  assert(await admin.isVisible(`[data-testid=zone][data-name="Alicante ${RUN}"]`), 'zona nueva dentro de la Comunidad');
  const assign = admin.locator('[data-testid=assign][data-user="admin@enjoy.test"]');
  await assign.locator('label.co-chip', { hasText: /^Valencia$/ }).click();
  await assign.locator('button[type=submit]').click();
  await admin.waitForLoadState();
  await admin.fill('[data-testid=import] [name=csv]', `nombre;ciudad;referencia\nBar Importado ${RUN};Valencia;ref-${RUN}\nSala Lejana ${RUN};Murcia;`);
  await admin.click('[data-testid=import] button[type=submit]');
  await admin.waitForSelector('[data-testid=import-result]');
  const imp = await admin.textContent('[data-testid=import-result]');
  assert(imp.includes('Importadas 2 cuentas') && imp.includes('Murcia'), 'importación CSV con zonas desconocidas señaladas');
  if (OUT) await admin.screenshot({ path: `${OUT}/territory.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/account`);
  await admin.fill('[data-testid=phone]', '+34 600 111 222');
  await admin.click('form:has([data-testid=phone]) button[type=submit]');
  await admin.waitForLoadState();
  await admin.goto(`${BASE}/admin/accounts?ver=all&q=Terraza`);
  await admin.click('[data-testid=account] a');
  await admin.click('[data-testid=block-open]');
  await admin.fill('[data-testid=block-dialog] [name=reason]', 'El dueño no quiere más comerciales');
  await admin.click('[data-testid=block-dialog-confirm]');
  await admin.waitForURL(/ok=blocked/);
  assert((await admin.getAttribute('[data-testid=account-status]', 'data-state')) === 'blocked', 'cuenta bloqueada con motivo');

  // ---- comercial: su zona, compañeros, quedarse una cuenta
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin/accounts`);
  const zone = await names(rep);
  assert(zone.includes('Club Sol') && zone.includes('Sala Marina') && !zone.includes('Discoteca Faro'), 'mi zona: Valencia y Castellón, no Barcelona');
  assert(zone[0] === 'Club Sol', 'lo mío primero');
  assert((await rep.textContent('[data-testid=my-zone]')).includes('Comunidad Valenciana'), 'muestra mi zona');
  assert(await rep.isVisible('[data-testid=colleagues] a[href^="https://wa.me/34600111222"]'), 'compañero de zona con WhatsApp');
  const terraza = rep.locator('[data-testid=account][data-name="Terraza Azahar"] [data-testid=account-state]');
  assert((await terraza.getAttribute('data-state')) === 'blocked', 've la cuenta bloqueada');
  if (OUT) await rep.screenshot({ path: `${OUT}/accounts.png`, fullPage: true });
  await rep.locator('[data-testid=account][data-name="Sala Marina"] [data-testid=claim]').click();
  await rep.waitForURL(/ok=claimed/);
  assert((await rep.getAttribute('[data-testid=account-status]', 'data-state')) === 'mine', 'me la quedo: reservada para mí');
  await rep.fill('[data-testid=contact-form] [name=note]', 'Visita: el dueño quiere verlo un viernes');
  await rep.click('[data-testid=contact-form] button[type=submit]');
  await rep.waitForURL(/ok=contact/);
  assert((await rep.textContent('[data-testid=history]')).includes('el dueño quiere verlo un viernes'), 'contacto en el historial');
  await rep.click('[data-testid=account-dossier]');
  await rep.waitForURL(/\/admin\/dossiers\//);
  assert((await rep.textContent('[data-testid=crm-account]')).includes('Sala Marina'), 'propuesta vinculada a la cuenta');

  // ---- otro miembro ve que es de otra persona
  await admin.goto(`${BASE}/admin/accounts?ver=all&q=Sala Marina`);
  assert((await admin.getAttribute('[data-testid=account] [data-testid=account-state]', 'data-state')) === 'taken', 'para los demás: la trabaja otra persona');
  await admin.click('[data-testid=account] a');
  assert((await admin.textContent('[data-testid=account-status]')).includes('no generará comisión'), 'avisa de que venderla no genera comisión');
  assert(!(await admin.isVisible('[data-testid=account-dossier]')), 'sin botón de propuesta en cuenta ajena');
  if (OUT) await admin.screenshot({ path: `${OUT}/account-taken.png`, fullPage: true });

  // ---- el colaborador no ve el CRM
  const dj = await login('dj@enjoy.test');
  const res = await dj.goto(`${BASE}/admin/accounts`);
  assert((await dj.textContent('main')).includes('equipo interno') || res.status() === 403 || (await dj.textContent('main')).toLowerCase().includes('acceso'), 'colaborador sin acceso a cuentas');
  await b.close();
})();
