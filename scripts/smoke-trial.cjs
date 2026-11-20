/**
 * Smoke de «En prueba» (docs/CLIENTS.md §En prueba): el comercial pone una empresa en prueba 2 meses desde «Cierre» →
 * sale bien visible en la ficha (cabecera y tarjeta), en la lista (etiqueta y filtro), en el tablero (columna propia)
 * y en Clientes (sección «En prueba»), con el aviso de fin en los próximos pasos; cambia las fechas a una pasada y sale
 * en rojo; «No sigue» con descartar la saca de todo y la descarta.
 *   npm run build && npm run start:demo ; node scripts/smoke-trial.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const SOL = '00000000-0000-4000-8000-0000000ac001';
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts/${SOL}`);
  const name = (await p.textContent('h1')).trim();
  assert(!(await p.isVisible('[data-testid=trial]')), 'sin prueba: nada arriba');
  await p.click('label:has([data-testid=closing-trial])');
  assert(await p.isVisible('[data-testid=trial-form]') && !(await p.isVisible('[data-testid=charge]')), 'Cierre → pestaña «En prueba»');
  assert(!(await p.isVisible('[data-testid=trial-ends]')), '«Hasta» solo con «Otra fecha»');
  await p.click('label:has([data-testid=trial-preset-2m])');
  await p.fill('[data-testid=trial-note-input]', '2 meses gratis por el trato con su grupo; luego 249 €/mes.');
  await Promise.all([p.waitForURL(/ok=trialStart/), p.click('[data-testid=trial-start]')]);
  assert(await p.isVisible('[data-testid=trial]'), 'ficha: tarjeta «En prueba» arriba');
  const head = await p.textContent('[data-testid=trial-head]');
  assert(/En prueba · quedan (5[89]|6[0-2]) días/.test(head), `cabecera: ${head.trim()}`);
  assert((await p.getAttribute('[data-testid=trial]', 'data-tone')) === 'running', 'en marcha (sin rojo)');
  assert((await p.textContent('[data-testid=trial-note]')).includes('249'), 'lo acordado para la prueba');
  assert((await p.textContent('[data-testid=account-summary]')).includes('Acaba la prueba'), 'próximo paso: «Acaba la prueba: ¿se queda?»');
  assert(!(await p.isVisible('[data-testid=trial-stays]')), 'aún no es cliente: «Se queda» = cerrarla abajo');
  assert(!(await p.locator('[data-testid=closing-trial]').count()), 'ya en prueba: sin la pestaña de empezarla');

  await p.goto(`${BASE}/admin/accounts?ver=mine&cual=prueba`);
  const rows = await p.locator('[data-testid=trial-tag]').count();
  assert(rows === 1 && (await p.textContent('[data-testid=trial-tag]')).includes('En prueba'), `lista: filtro «En prueba» (${rows})`);

  await p.goto(`${BASE}/admin/accounts/tablero`);
  assert((await p.locator('[data-testid=board-col][data-stage=trial] [data-testid=board-card]').count()) === 1, 'tablero: columna «En prueba»');
  assert((await p.locator('[data-testid=board-col][data-stage=trial] [data-testid=board-trial]').count()) === 1, 'tablero: con los días que quedan');

  await p.goto(`${BASE}/admin/clientes`);
  assert((await p.locator(`[data-testid=trial-row][data-name="${name}"]`).count()) === 1, 'Clientes: sección «En prueba»');

  // Fechas pasadas: en rojo, «¿Se queda?».
  await p.goto(`${BASE}/admin/accounts/${SOL}`);
  await p.click('[data-testid=trial-change]');
  await p.fill('[data-testid=trial-change-ends]', day(-2));
  await p.fill('input[name=startsOn] >> nth=0', day(-20));
  await Promise.all([p.waitForURL(/ok=trialStart/), p.click('[data-testid=trial-change-save]')]);
  assert((await p.getAttribute('[data-testid=trial]', 'data-tone')) === 'over', 'pasada: en rojo');
  assert((await p.textContent('[data-testid=trial-badge]')).includes('acabada hace 2 días'), 'pasada: «acabada hace 2 días»');

  // No sigue → descartada, fuera de la prueba.
  await p.click('[data-testid=trial-leaves-open]');
  await Promise.all([p.waitForURL(/ok=trialLeaves/), p.click('[data-testid=trial-leaves]')]);
  assert(!(await p.isVisible('[data-testid=trial]')) && !(await p.isVisible('[data-testid=trial-head]')), 'acabada: ya no sale');
  assert(await p.isVisible('[data-testid=discarded-banner]'), 'y descartada (que nadie le vuelva a vender)');
  // «Apuntar con IA»: «en prueba 2 meses» → se ve para revisar y, al guardar, queda en prueba.
  await p.goto(`${BASE}/admin/accounts/apuntar`);
  await p.fill('[data-testid=notes-text]', 'Sala Nueva Prueba: hablé con el dueño, se van a pasar en prueba 2 meses por un trato');
  await Promise.all([p.waitForSelector('[data-testid=notes-review]'), p.click('[data-testid=notes-run]')]);
  assert(await p.isVisible('[data-testid=notes-trial]'), 'Apuntar: enseña la prueba para revisar');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=notes-save]')]);
  await p.goto(`${BASE}/admin/clientes`);
  assert((await p.locator('[data-testid=trial-row][data-name="Sala Nueva Prueba"]').count()) === 1, 'Apuntar: queda en prueba (sale en Clientes)');
  await b.close();
})();
