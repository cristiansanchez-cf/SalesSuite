/**
 * Smoke de tipos de cliente por espacio (modo DEMO, docs/CRM_DINAMICO.md §21): el admin renombra el principal,
 * añade un tipo, da de alta una empresa de ese tipo, y al quitarlo la empresa pasa al principal.
 *   npm run build && npm run start:demo ; node scripts/smoke-kinds.cjs
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
  const admin = await login('admin@enjoy.test');
  await admin.goto(`${BASE}/admin/team/fields?de=tipos`);
  const keys = () => admin.$$eval('[data-testid=kind-row]', (xs) => xs.map((x) => x.dataset.key));
  assert((await keys()).join() === 'company,dj,', `Enjoy empieza con Empresa y DJ (${await keys()})`);

  // Renombrar el principal y añadir «Hotel».
  const rows = admin.locator('[data-testid=kind-row]');
  await rows.nth(0).locator('[data-testid=kind-label]').fill('Local');
  await rows.nth(0).locator('[data-testid=kind-plural]').fill('Locales');
  await rows.nth(2).locator('[data-testid=kind-label]').fill('Hotel');
  await rows.nth(2).locator('[data-testid=kind-plural]').fill('Hoteles');
  await rows.nth(2).locator('[name=kIcon]').selectOption('hotel');
  await admin.click('[data-testid=kinds-save]');
  await admin.waitForURL(/ok=kinds/);
  assert((await keys()).join() === 'company,dj,hotel,', `tipo nuevo con clave desde el nombre (${await keys()})`);
  if (OUT) await admin.screenshot({ path: `${OUT}/kinds.png`, fullPage: true });

  // Las pestañas de Empresas usan los tipos del espacio; alta de un hotel.
  await admin.goto(`${BASE}/admin/accounts?ver=all`);
  assert((await admin.textContent('[data-testid=kind-tab-company]')).includes('Locales') && (await admin.isVisible('[data-testid=kind-tab-hotel]')), 'pestañas con los tipos del espacio');
  await admin.click('[data-testid=add-open]'); await admin.click('[data-testid=new-account]');
  await admin.fill('[data-testid=new-account-form] [name=name]', `Hotel Smoke ${RUN}`);
  await admin.selectOption('[data-testid=new-account-kind]', 'hotel');
  await admin.click('[data-testid=new-account-form] button[type=submit]');
  await admin.waitForLoadState();
  await admin.goto(`${BASE}/admin/accounts?ver=all&tipo=hotel`);
  const hotels = await admin.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.dataset.name));
  assert(hotels.length === 1 && hotels[0] === `Hotel Smoke ${RUN}`, `alta con tipo «Hotel» (${hotels})`);

  // Quitar «Hotel»: su empresa pasa al principal.
  await admin.goto(`${BASE}/admin/team/fields?de=tipos`);
  await admin.check('[data-testid=kind-row][data-key=hotel] [data-testid=kind-remove]');
  await admin.click('[data-testid=kinds-save]');
  await admin.waitForURL(/ok=kinds/);
  assert(!(await keys()).includes('hotel'), 'tipo quitado');
  await admin.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(`Hotel Smoke ${RUN}`)}`);
  assert((await admin.$$eval('[data-testid=account]', (xs) => xs.length)) === 1 && !(await admin.isVisible('[data-testid=kind-tab-hotel]')), 'su empresa sigue, ahora en el principal');

  // Un comercial no edita los tipos.
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin/team/fields?de=tipos`);
  assert(!(await rep.isVisible('[data-testid=kinds-save]')), 'un comercial no cambia los tipos');
  await b.close();
})();
