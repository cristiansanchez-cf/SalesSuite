/**
 * Smoke de «Apuntar con IA» (docs/CRM_DINAMICO.md §20), con la IA de pruebas (AI_RESEARCH_FIXTURE=1, sin clave):
 * Empresas → Apuntar → texto con dos sitios → revisar (uno ya está en el CRM, otro nuevo) → guardar → en la ficha, la
 * visita con su nota, la cualificación y el próximo paso.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-notes.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })).newPage();   // en el móvil
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  await Promise.all([p.waitForURL(/\/admin\/accounts\/apuntar/), p.click('[data-testid=notes-fab]')]);
  await p.fill('[data-testid=notes-text]', 'CLUB SOOL - dos pantallas grandes en la barra, mirar sus redes\nBar Nuevo Setenta: sin pantalla, buena música y gente joven');
  await Promise.all([p.waitForSelector('[data-testid=notes-review]'), p.click('[data-testid=notes-run]')]);
  const items = await p.$$eval('[data-testid=notes-item]', (xs) => xs.map((x) => ({ venue: x.getAttribute('data-venue'), goes: x.querySelector('select').selectedOptions[0].textContent })));
  assert(items.length === 2, `dos sitios (${items.map((x) => x.venue)})`);
  assert(items[0].goes.startsWith('Club Sol'), `«CLUB SOOL» va a Club Sol (${items[0].goes})`);
  assert(items[1].goes.includes('Crear empresa nueva'), 'el que no está: empresa nueva');
  const quals = await p.$$eval('[data-testid=notes-qual]', (xs) => xs.map((x) => x.value));
  assert(quals.filter((q) => q.startsWith('screens:')).join() === 'screens:yes', `pantallas: sí en el que las tiene; «sin pantalla» no se marca como «no quiere» (${quals})`);
  assert((await p.inputValue('[data-testid=notes-key-facts] >> nth=0')).includes('★ dos pantallas grandes en la barra'), 'lo importante, aparte y editable');
  if (OUT) await p.screenshot({ path: `${OUT}/notes-review.png`, fullPage: true });
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=notes-save]')]);
  assert((await p.textContent('main')).includes('Apuntado en 2 sitios'), 'guardado en los dos');
  const links = await p.$$eval('[data-testid=notes-saved] a', (as) => as.map((a) => a.textContent.trim()));
  assert(links.includes('Club Sol') && links.includes('Bar Nuevo Setenta'), `enlaces a las fichas (${links})`);

  await Promise.all([p.waitForURL(/\/admin\/accounts\/[^/?#]+$/), p.click('[data-testid=notes-saved] a:has-text("Club Sol")')]);
  const main = await p.textContent('main');
  assert(main.includes('dos pantallas grandes en la barra'), 'la nota está en sus interacciones');
  assert(main.includes('Mirar sus redes'), 'el próximo paso');
  assert((await p.textContent('[data-testid=facts-key]')).includes('dos pantallas grandes en la barra'), 'lo importante, en tarjeta arriba');
  // Tamaño del local: su propia fila, sin puntos; «Qué es» con la misma forma que el resto.
  await p.click('[data-testid=qual-size-large]');
  await p.waitForSelector('[data-testid=qual-size-large][aria-pressed=true]');
  assert(true, 'tamaño del local: grande');
  const kindBox = await p.locator('[data-criterion=format] [data-testid=qual-format-club]').boundingBox();
  const qualBox = await p.locator('[data-testid=qualification]').boundingBox();
  assert(kindBox.x - qualBox.x < 60, `«Formato» alineado a la izquierda (${Math.round(kindBox.x - qualBox.x)}px)`);
  // Destacar un dato normal: pasa a las tarjetas.
  const before = await p.locator('[data-testid=facts-key] [data-testid=fact]').count();
  await p.locator('#facts [data-testid=fact]:not([data-key]) [data-testid=fact-star]').first().click({ force: true });
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid=facts-key] [data-testid=fact]').length > n, before);
  assert(true, 'destacar un dato lo sube a las tarjetas');
  if (OUT) await p.screenshot({ path: `${OUT}/notes-ficha.png`, fullPage: true });

  // «¿De qué empresa vas a hablar?»: buscar con el nombre mal escrito, elegir, contar sin decir el nombre.
  await p.goto(`${BASE}/admin/accounts/apuntar`);
  await p.fill('[data-testid=notes-who]', 'club sool');
  await p.waitForSelector('[data-testid=notes-who-option]');
  const opt = await p.textContent('[data-testid=notes-who-option]');
  assert(opt.includes('Club Sol') && opt.includes('Valencia'), `autocompletar con su sitio (${opt.trim()})`);
  await p.click('[data-testid=notes-who-option]');
  assert(await p.isVisible('[data-testid=notes-who-chosen]'), 'empresa elegida');
  await p.fill('[data-testid=notes-text]', 'Hoy he hablado con el encargado, quiere verlo el jueves');
  await Promise.all([p.waitForSelector('[data-testid=notes-review]'), p.click('[data-testid=notes-run]')]);
  const one = await p.$$eval('[data-testid=notes-item]', (xs) => xs.map((x) => x.querySelector('select').selectedOptions[0].textContent));
  assert(one.length === 1 && one[0].startsWith('Club Sol'), `todo va a la elegida (${one})`);

  // Desde la ficha: «Apuntar aquí» abre Apuntar con esa empresa ya elegida (§23); y lo escrito no se pierde al salir.
  await p.goto(`${BASE}/admin/accounts/00000000-0000-4000-8000-0000000ac001`);
  await Promise.all([p.waitForURL(/apuntar\?empresa=/), p.click('[data-testid=summary-note]')]);
  assert((await p.textContent('[data-testid=notes-who-chosen]')).includes('Club Sol') && await p.isVisible('[data-testid=notes-who-chosen]'), 'Apuntar aquí: la empresa ya elegida');
  await p.fill('[data-testid=notes-text]', 'Borrador a medias');
  await p.goto(`${BASE}/admin/accounts`);
  await p.goto(`${BASE}/admin/accounts/apuntar`);
  assert((await p.inputValue('[data-testid=notes-text]')) === 'Borrador a medias', 'el borrador sigue al volver');
  await p.fill('[data-testid=notes-text]', '');
  await p.evaluate(() => localStorage.removeItem('co-apuntar-borrador'));

  // Proponer descartar (§23): por lo que cuentas, la IA pregunta; solo se descarta si dices que sí.
  await p.goto(`${BASE}/admin/accounts/apuntar`);
  await p.fill('[data-testid=notes-text]', 'BAR MALO - el dueño nos echó, mejor no ir');
  await Promise.all([p.waitForSelector('[data-testid=notes-review]'), p.click('[data-testid=notes-run]')]);
  assert(await p.isVisible('[data-testid=notes-discard]'), 'la IA pregunta si descartamos');
  await p.check('[data-testid=notes-discard-yes]');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=notes-save]')]);
  await Promise.all([p.waitForURL(/\/admin\/accounts\/[^/?#]+$/), p.click('[data-testid=notes-saved] a:has-text("BAR MALO")')]);
  assert((await p.textContent('[data-testid=discarded-banner]')).includes('Mejor no ir'), 'descartada con su motivo');
  // En el mapa sale en gris, con su motivo (para que nadie vaya sin saberlo).
  await p.goto(`${BASE}/admin/accounts/mapa?ver=all`);
  assert(await p.locator('[data-testid=map-off]').count() === 1, 'el mapa deja ocultar las descartadas');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
