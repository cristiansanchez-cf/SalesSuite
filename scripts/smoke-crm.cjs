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
  assert(!(await rep.url()).includes('estado='), 'la URL solo lleva lo aplicado');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-list.png`, fullPage: true });

  // ---- lugar: País → Provincia, sin pasar por la comunidad (§23)
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  assert(await rep.isHidden('[data-testid=filter-place-province]'), 'sin país, no hay provincia que elegir');
  await place(rep, '[data-testid=filter-place-country]', 'España');
  const provs = await rep.$$eval('[data-testid=filter-place-province] option', (xs) => xs.map((x) => x.textContent.trim()));
  assert(['Valencia', 'Castellón', 'Barcelona', 'Madrid'].every((x) => provs.includes(x)) && !provs.includes('Comunidad Valenciana'), `provincias de España, directamente (${provs})`);
  await place(rep, '[data-testid=filter-place-province]', 'Valencia');
  const inVlc = await rep.$$eval('[data-testid=account]', (els) => els.map((e) => e.getAttribute('data-name')));
  assert(inVlc.length > 0 && inVlc.every((n) => ['Club Sol', 'Sala Marina'].includes(n)), `ciudad Valencia: solo las de Valencia (${inVlc})`);
  assert((await rep.textContent('[data-testid=acc-active]')).includes('Valencia'), 'Valencia, a la vista como chip');
  // Entrar en una y volver con «← Empresas» (o desde el menú): la búsqueda sigue ahí (§23).
  await Promise.all([rep.waitForURL(/\/admin\/accounts\/[^/?#]+$/), rep.click('[data-testid=account] a.co-row__main >> nth=0')]);
  await Promise.all([rep.waitForURL(/\/admin\/accounts$/), rep.click('[data-testid=page-header] a:has-text("Empresas")')]);
  assert((await rep.$eval('[data-testid=filter-place-province]', (x) => x.selectedOptions[0]?.textContent.trim())) === 'Valencia', 'al volver, sigue filtrado por Valencia');
  await rep.goto(`${BASE}/admin/accounts?ver=all&q=Valencia`);
  await Promise.all([rep.waitForURL((u) => !u.searchParams.has('zona')), rep.click('[data-testid=active-filter]:has-text("Valencia")')]);
  assert((await rep.$$('[data-testid=account]')).length > inVlc.length, 'quitar la ciudad con un clic');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-list-city.png` });

  // ---- un comercial no define campos
  await rep.goto(`${BASE}/admin/team/fields`);
  assert((await rep.textContent('main')).length > 0 && !(await rep.isVisible('[data-testid=field-add]')), 'el comercial no entra en Campos del CRM');
  // Sí / No / No se sabe en los campos de sí o no (una casilla sola no distingue «no» de «no lo sé»).
  await rep.goto(`${BASE}/admin/accounts/00000000-0000-4000-8000-0000000ac001`);
  const tri = (v) => rep.isChecked(`[data-testid=field-tiene-pantalla-${v}]`);
  assert(await tri('yes'), 'campo de sí o no: «Sí» marcado');
  for (const v of ['no', 'unknown']) {
    await rep.locator(`label:has([data-testid=field-tiene-pantalla-${v}])`).click();
    await Promise.all([rep.waitForURL(/ok=/), rep.click('[data-testid=sheet-save]')]);
    assert(await tri(v), `campo de sí o no: se guarda «${v}»`);
  }
  // «Trabaja con»: enlazar una promotora nueva desde la ficha; se ve desde los dos lados y se quita.
  await rep.goto(`${BASE}/admin/accounts/00000000-0000-4000-8000-0000000ac001`);
  await rep.fill('[data-testid=work-name]', 'Fiestas Ucranianas VLC');
  await rep.selectOption('[data-testid=work-kind]', 'promotora');
  await rep.fill('[data-testid=work-note]', 'los jueves en la terraza');
  await Promise.all([rep.waitForURL(/ok=workNew/), rep.click('[data-testid=work-add]')]);
  assert((await rep.textContent('[data-testid=work-link][data-name="Fiestas Ucranianas VLC"]')).includes('Promotora · los jueves en la terraza'), 'promotora nueva, creada y enlazada');
  await Promise.all([rep.waitForURL(/\/admin\/accounts\/[^/?#]+$/), rep.click('[data-testid=work-link][data-name="Fiestas Ucranianas VLC"] a')]);
  assert(await rep.isVisible('[data-testid=work-link][data-name="Club Sol"]'), 'desde la promotora se ve el local');
  // Ficha de promotora (§24): sus preguntas, sin Google ni campos de local; días y frecuencia en «Dónde hace fiestas».
  assert((await rep.getAttribute('[data-testid=qualification]', 'data-profile')) === 'promoter', 'cualificación de promotora');
  assert(!(await rep.isVisible('[data-testid=google-box]')) && !(await rep.isVisible('[data-testid=account-sheet]')) && !(await rep.isVisible('[data-testid=qual-format-club]')), 'sin Google, sin formato ni campos de local');
  await rep.click('[data-testid=work-link][data-name="Club Sol"] [data-testid=work-when] summary');
  await rep.check('[data-testid=work-link][data-name="Club Sol"] [data-testid=work-day-fri]', { force: true });
  await rep.selectOption('[data-testid=work-link][data-name="Club Sol"] [data-testid=work-freq]', 'regular');
  await Promise.all([rep.waitForURL(/ok=work/), rep.click('[data-testid=work-link][data-name="Club Sol"] [data-testid=work-when-save]')]);
  assert((await rep.textContent('[data-testid=work-line]')).includes('Viernes en Club Sol'), 'arriba: «Viernes en Club Sol»');
  await Promise.all([rep.waitForResponse((r) => r.request().method() === 'POST'), rep.click('[data-testid=qual-pstyle-international]')]);
  await rep.waitForSelector('[data-testid=qual-pstyle-international][aria-pressed=true]');
  await Promise.all([rep.waitForResponse((r) => r.request().method() === 'POST'), rep.click('[data-testid=qual-pdyn-yes]')]);
  await rep.waitForSelector('[data-testid=qual-pdyn-yes][aria-pressed=true]');
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '55', 'nota de promotora: dinámicas 35 + estilo 20');
  const fit = await rep.textContent('[data-testid=summary-fit]');
  assert(fit.includes('Peticiones de canciones') && fit.includes('Pantalla y dinámicas') && !fit.includes('Fidelización'), `le encaja (sin fidelización): ${fit.trim()}`);
  await Promise.all([rep.waitForURL(/ok=workRemoved/), rep.click('[data-testid=work-link][data-name="Club Sol"] [data-testid=work-remove]')]);
  assert(!(await rep.isVisible('[data-testid=work-link]')), 'enlace quitado');
  await rep.goto(`${BASE}/admin/accounts?ver=all&tipo=promotora`);
  assert((await rep.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.dataset.name))).includes('Fiestas Ucranianas VLC'), 'en la pestaña Promotoras');
  await b.close();
})();
