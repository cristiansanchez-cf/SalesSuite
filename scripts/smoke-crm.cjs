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
  // Se guarda solo (§31): cada cambio, sin botón; «Guardado» al lado.
  const saved = async (fn) => { const n = Number(await rep.evaluate(() => document.documentElement.dataset.asyncDone || 0)); await fn(); await rep.waitForFunction((k) => Number(document.documentElement.dataset.asyncDone || 0) > k, n); };
  assert(!(await rep.isVisible('[data-testid=sheet-save]')), 'la ficha no tiene botón de guardar');
  await saved(() => rep.check('[data-field=noches-que-abre] input[value=viernes]', { force: true }));
  await saved(() => rep.check('[data-field=noches-que-abre] input[value=sabado]', { force: true }));
  await saved(async () => { await rep.fill('[data-field=aforo] input[name="f:aforo"]', '520'); await rep.press('[data-field=aforo] input[name="f:aforo"]', 'Tab'); });
  assert((await rep.textContent('[data-testid=sheet-form]')).includes('Guardado'), '«Guardado» al lado');
  await rep.reload();
  assert((await rep.inputValue('[data-field=aforo] input[name="f:aforo"]')) === '520', 'aforo guardado');
  assert(await rep.isChecked('[data-field=noches-que-abre] input[value=sabado]'), 'noches guardadas');
  if (OUT) await rep.screenshot({ path: `${OUT}/crm-sheet.png`, fullPage: true });

  // ---- valor no válido: se rechaza con el motivo
  await saved(() => rep.evaluate(() => { const i = document.querySelector('[data-field=aforo] input[name="f:aforo"]'); i.type = 'text'; i.value = 'muchos'; i.dispatchEvent(new Event('change', { bubbles: true })); }));
  assert((await rep.textContent('[data-testid=toasts]')).includes('Aforo: tiene que ser un número'), 'error claro con el nombre del campo');

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
  // Cada fila dice su ciudad: todas de Valencia (otros smokes del mismo servidor pueden haber creado más allí).
  const inVlc = await rep.$$eval('[data-testid=account]', (els) => els.map((e) => [e.getAttribute('data-name'), e.querySelector('.co-meta')?.textContent ?? '']));
  assert(inVlc.some(([n]) => n === 'Club Sol') && inVlc.every(([, m]) => m.includes('Valencia')), `ciudad Valencia: solo las de Valencia (${inVlc.map(([n]) => n)})`);
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
    await saved(() => rep.locator(`label:has([data-testid=field-tiene-pantalla-${v}])`).click());
    await rep.reload();
    assert(await tri(v), `campo de sí o no: se guarda «${v}»`);
  }
  // Tamaño en tramos (§30): cambian si hace festivales; «Promotora» ya no es un formato.
  assert(!(await rep.isVisible('[data-testid=qual-format-promoter]')) && await rep.isVisible('[data-testid=qual-format-festival]'), 'formatos: Festival sí, Promotora no');
  assert((await rep.textContent('[data-testid=qual-size-range-small]')).includes('150'), 'local: pequeño hasta 150');
  await saved(() => rep.click('[data-testid=qual-format-festival]'));
  { const sm = await rep.textContent('[data-testid=qual-size-range-small]'); const hg = await rep.textContent('[data-testid=qual-size-huge]'); assert(/5\.?000/.test(sm) && hg.includes('Masivo'), `festival: pequeño hasta 5.000; y «Masivo» (${sm} / ${hg})`); }
  await saved(() => rep.click('[data-testid=qual-format-festival]'));
  // «Trabaja con» (§29): un bloque para Promotoras y otro para DJs; cada uno busca solo lo suyo y, si no está,
  // «Añadir «X» a Promotoras» (se crea en su pestaña y se enlaza).
  await rep.goto(`${BASE}/admin/accounts/00000000-0000-4000-8000-0000000ac001`);
  const promos = '[data-testid=work-section][data-kind=promotora]';
  const djs = '[data-testid=work-section][data-kind=dj]';
  assert(await rep.isVisible(promos) && await rep.isVisible(djs), 'Trabaja con: un bloque de Promotoras y otro de DJs');
  await rep.fill(`${promos} [data-testid=work-name]`, 'Fiestas Ucranianas VLC');
  await rep.waitForSelector(`${promos} [data-testid=work-create]`);
  assert((await rep.textContent(`${promos} [data-testid=work-create]`)).includes('Añadir «Fiestas Ucranianas VLC» a Promotoras'), 'si no está: «Añadir «X» a Promotoras»');
  await rep.click(`${promos} [data-testid=work-create]`);
  await rep.fill(`${promos} [data-testid=work-note]`, 'los jueves en la terraza');
  await Promise.all([rep.waitForURL(/ok=workNew/), rep.click(`${promos} [data-testid=work-add]`)]);
  assert((await rep.textContent(`${promos} [data-testid=work-link][data-name="Fiestas Ucranianas VLC"]`)).includes('los jueves en la terraza'), 'promotora nueva, creada y enlazada en su bloque');
  // En DJs se busca solo entre DJs: un local no sale; y un DJ nuevo se añade a DJs (residente).
  await rep.fill(`${djs} [data-testid=work-name]`, 'club so');
  await rep.waitForSelector(`${djs} [data-testid=work-create]`);
  assert((await rep.locator(`${djs} [data-testid=work-option]`).count()) === 0, 'en DJs no salen locales ni promotoras');
  await rep.fill(`${djs} [data-testid=work-name]`, 'DJ Marf Smoke');
  await rep.waitForSelector(`${djs} [data-testid=work-create]:has-text("DJ Marf Smoke")`);
  await rep.click(`${djs} [data-testid=work-create]`);
  await rep.selectOption(`${djs} select[name=role]`, 'resident');
  await Promise.all([rep.waitForURL(/ok=workNew/), rep.click(`${djs} [data-testid=work-add]`)]);
  assert((await rep.textContent(`${djs} [data-testid=work-link][data-name="DJ Marf Smoke"]`)).includes('Residente'), 'DJ nuevo, residente, en el bloque de DJs');
  // Personas: solo la gente del local, con el papel de una lista.
  await rep.click('[data-testid=account-add-person]');
  assert((await rep.textContent('[data-testid=add-person-staff]')).includes('Trabaja con'), 'Personas: avisa de que DJs y promotoras van en «Trabaja con»');
  assert((await rep.locator('[data-testid=add-person-role] option').count()) >= 8, 'el papel es un desplegable');
  await rep.selectOption('[data-testid=add-person-role]', '__other');
  assert(await rep.isVisible('[data-testid=add-person-role-other]'), '«Otro…» deja escribirlo');
  await rep.keyboard.press('Escape');
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
  // Desde la promotora, buscar una sala que ya tienes (escrita a medias): sale «Ya en tu CRM» y se enlaza esa, sin duplicar.
  await rep.fill('[data-testid=work-name]', 'club so');
  await rep.waitForSelector('[data-testid=work-option]');
  // (desde una promotora, el bloque es el de locales)
  assert((await rep.textContent('[data-testid=work-list]')).includes('Ya en tu CRM'), 'avisa de que ya la tienes');
  await rep.click('[data-testid=work-option]:has-text("Club Sol")');
  assert(await rep.isVisible('[data-testid=work-chosen]') && !(await rep.isVisible('[data-testid=work-kind]')), 'elegida: sin preguntar qué es');
  await Promise.all([rep.waitForURL(/ok=work(#|$)/), rep.click('[data-testid=work-add]')]);
  assert(await rep.isVisible('[data-testid=work-link][data-name="Club Sol"]'), 'enlazada con la que ya tenías');
  await rep.goto(`${BASE}/admin/accounts?ver=all&q=Club%20Sol`);
  assert((await rep.$$('[data-testid=account]')).length === 1, 'sin duplicar Club Sol');
  // Sin elegir de la lista no se envía (así no se crea nada sin querer).
  await rep.goBack();
  await rep.fill('[data-testid=work-name]', 'Algo nuevo');
  const before = rep.url();
  await rep.press('[data-testid=work-name]', 'Enter');
  await rep.waitForTimeout(400);
  assert((await rep.textContent('[data-testid=work-form]')).includes('Elige una de la lista') && rep.url() === before, 'sin elegir, no se envía');
  await rep.goto(`${BASE}/admin/accounts?ver=all&tipo=promotora`);
  assert((await rep.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.dataset.name))).includes('Fiestas Ucranianas VLC'), 'en la pestaña Promotoras');
  await rep.goto(`${BASE}/admin/accounts?ver=all&tipo=dj`);
  assert((await rep.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.dataset.name))).includes('DJ Marf Smoke'), 'y el DJ, en la pestaña DJs');
  await b.close();
})();
