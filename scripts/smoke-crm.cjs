/**
 * Smoke del CRM dinámico, fase 1 (docs/CRM_DINAMICO.md): el admin crea un campo desde «Equipo → Campos del CRM», el
 * comercial rellena la ficha de su cuenta, la lista enseña la columna y filtra por el campo.
 *   npm run build && npm run start:demo ; node scripts/smoke-crm.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
// Elegir en el filtro de lugar (cada cambio aplica y recarga la página).
const place = async (pg, sel, label) => { const at = pg.url(); await Promise.all([pg.waitForURL((u) => u.toString() !== at), pg.selectOption(sel, { label })]); await pg.waitForLoadState('load'); };

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };

  // ---- el admin define un campo de selección múltiple
  const adm = await login('admin@enjoy.test');
  await adm.goto(`${BASE}/admin/import`);  // Configurar → Datos del CRM
  await adm.click('[data-testid=tab-fields]');
  await adm.waitForURL(/\/admin\/team\/fields/);
  assert((await adm.locator('[data-testid=field]').count()) >= 2, 'campos de ejemplo del espacio');
  await adm.click('[data-testid=field-add]');
  await adm.fill('[data-testid=field-dialog] [name=label]', 'Noches que abre');
  await adm.click('[data-testid=field-dialog] [data-testid=field-type-multi_select]');
  await adm.fill('[data-testid=field-dialog] [name=options]', 'Jueves\nViernes\nSábado');
  await adm.check('[data-testid=field-dialog] [name=filterable]');
  await adm.click('[data-testid=field-create]');
  await adm.waitForURL(/ok=saved/);
  assert(await adm.isVisible('[data-testid=field][data-key=noches-que-abre]'), 'campo creado con su clave');
  if (OUT) await adm.screenshot({ path: `${OUT}/crm-fields.png`, fullPage: true });

  // ---- el comercial rellena la ficha de su cuenta
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  await rep.click('[data-testid=account][data-name="Club Sol"] a');
  await rep.waitForURL(/\/admin\/accounts\/[^/?]+$/);
  assert(await rep.isVisible('[data-testid=account-sheet] [data-field=noches-que-abre]'), 'la ficha enseña el campo nuevo');
  await rep.check('[data-field=noches-que-abre] input[value=viernes]', { force: true });
  await rep.check('[data-field=noches-que-abre] input[value=sabado]', { force: true });
  await rep.fill('[data-field=aforo] input[name="f:aforo"]', '520');
  await rep.click('[data-testid=sheet-save]');
  await rep.waitForURL(/ok=fields/);
  assert((await rep.inputValue('[data-field=aforo] input[name="f:aforo"]')) === '520', 'aforo guardado');
  assert(await rep.isChecked('[data-field=noches-que-abre] input[value=sabado]'), 'noches guardadas');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-sheet.png`, fullPage: true });

  // ---- valor no válido: se rechaza con el motivo
  await rep.evaluate(() => { const i = document.querySelector('[data-field=aforo] input[name="f:aforo"]'); i.type = 'text'; i.value = 'muchos'; });
  await Promise.all([rep.waitForNavigation(), rep.click('[data-testid=sheet-save]')]);
  assert((await rep.textContent('main')).includes('Aforo: tiene que ser un número'), 'error claro con el nombre del campo');

  // ---- la lista enseña la columna y filtra por el campo
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  assert((await rep.textContent('[data-testid=account][data-name="Club Sol"]')).includes('Aforo: 520'), 'columna «Aforo» en la lista');
  // Sin botón «Filtrar»: «Filtros» abre el panel y elegir una opción aplica al momento.
  await rep.click('[data-testid=filters-toggle]');
  await Promise.all([rep.waitForURL(/c\.noches-que-abre=viernes/), rep.selectOption('[data-testid=crm-filters] [data-field=noches-que-abre]', 'viernes')]);
  const names = await rep.$$eval('[data-testid=account]', (els) => els.map((e) => e.getAttribute('data-name')));
  assert(names.length === 1 && names[0] === 'Club Sol', 'filtro por campo: solo las que abren el viernes');
  assert((await rep.textContent('[data-testid=acc-active]')).includes('Noches que abre: Viernes'), 'el filtro aplicado, a la vista como chip');
  assert(!(await rep.url()).includes('estado=') && !(await rep.url()).includes('zona='), 'la URL solo lleva lo aplicado');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-list.png`, fullPage: true });

  // ---- lugar: País → Comunidad → Provincia (cada uno con lo de dentro)
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  assert(await rep.isHidden('[data-testid=filter-place-region]'), 'sin país, no hay comunidad que elegir');
  await place(rep, '[data-testid=filter-place-country]', 'España');
  await place(rep, '[data-testid=filter-place-region]', 'Comunidad Valenciana');
  const provs = await rep.$$eval('[data-testid=filter-place-province] option', (xs) => xs.map((x) => x.textContent.trim()));
  assert(provs.includes('Valencia') && provs.includes('Castellón') && !provs.includes('Barcelona'), `provincias de su comunidad (${provs})`);
  await place(rep, '[data-testid=filter-place-province]', 'Valencia');
  const inVlc = await rep.$$eval('[data-testid=account]', (els) => els.map((e) => e.getAttribute('data-name')));
  assert(inVlc.length > 0 && inVlc.every((n) => ['Club Sol', 'Sala Marina'].includes(n)), `ciudad Valencia: solo las de Valencia (${inVlc})`);
  assert((await rep.textContent('[data-testid=acc-active]')).includes('Valencia'), 'Valencia, a la vista como chip');
  await Promise.all([rep.waitForURL((u) => !u.searchParams.has('zona')), rep.click('[data-testid=active-filter]:has-text("Valencia")')]);
  assert((await rep.$$('[data-testid=account]')).length > inVlc.length, 'quitar la ciudad con un clic');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-list-city.png` });

  // ---- un comercial no define campos
  await rep.goto(`${BASE}/admin/team/fields`);
  assert((await rep.textContent('main')).length > 0 && !(await rep.isVisible('[data-testid=field-add]')), 'el comercial no entra en Campos del CRM');
  await b.close();
})();
