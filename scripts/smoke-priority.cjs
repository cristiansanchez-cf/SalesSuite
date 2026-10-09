/**
 * Smoke de la prioridad (docs/CRM_DINAMICO.md §11): cualificar con un clic, puntuación con su desglose, eliminatorio
 * visible, ranking por prioridad, filtro «Sin cualificar» y pesos del admin.
 *   npm run build && npm run start:demo ; node scripts/smoke-priority.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  await rep.click('[data-testid=account][data-name="Sala Marina"] a.co-row__main');
  await rep.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  const click = async (tid) => { await Promise.all([rep.waitForURL(/ok=qualified/), rep.click(`[data-testid="${tid}"]`)]); };
  assert(await rep.isVisible('[data-testid=qualification]'), 'bloque «Cualificación» a la vista, sin formularios que abrir');
  assert((await rep.getAttribute('[data-testid=qual-kind-venue]', 'aria-pressed')) === 'true', 'el sector dice que es un local');
  await click('qual-nights-4+');
  await click('qual-decider-onsite');
  await click('qual-screens-yes');
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '75', 'puntuación de lo que se sabe: 30 + 25 + 20');
  assert((await rep.textContent('[data-testid=qual-max]')).includes('hasta 100'), 'y el máximo si se cualifica');
  assert((await rep.textContent('[data-testid=qual-points-recurrence]')).includes('30 / 30'), 'de dónde sale cada punto');
  assert((await rep.textContent('[data-testid=qual-points-scale]')).includes('No se sabe'), 'lo que falta: «No se sabe», no 0');
  if (OUT) await rep.screenshot({ path: `${OUT}/priority-account.png`, fullPage: true });
  await click('qual-screens-yes');  // desmarcar
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '55', 'pulsar lo marcado lo desmarca');
  await click('qual-screens-yes');

  // ---- la lista: ranking y filtros
  await rep.goto(`${BASE}/admin/accounts?ver=all&orden=prioridad`);
  const first = await rep.getAttribute('[data-testid=account] >> nth=0', 'data-name');
  assert(first === 'Sala Marina', 'por prioridad: la cualificada arriba');
  await rep.goto(`${BASE}/admin/accounts?ver=all&cual=sin`);
  assert(await rep.isVisible('[data-testid=account][data-name="Sala Marina"]'), '«Sin cualificar»: le faltan criterios');
  if (OUT) await rep.screenshot({ path: `${OUT}/priority-list.png`, fullPage: true });

  // ---- eliminatorio
  await rep.goto(`${BASE}/admin/accounts?ver=all&q=Sala%20Marina`);
  await rep.click('[data-testid=account][data-name="Sala Marina"] a.co-row__main');
  await rep.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  await click('qual-kill-debt');
  assert((await rep.textContent('[data-testid=qual-out]')).includes('Deudas o cierre'), 'fuera, con el motivo a la vista');
  await rep.goto(`${BASE}/admin/accounts?ver=all&cual=fuera`);
  assert((await rep.textContent('[data-testid=account][data-name="Sala Marina"]')).includes('Fuera: Deudas o cierre'), 'en la lista, la etiqueta del motivo');

  // ---- pesos (admin)
  const adm = await login('admin@enjoy.test');
  await adm.goto(`${BASE}/admin/team/fields?de=prioridad`);
  await adm.fill('[data-testid=weights-form] [name=recurrence]', '40');
  await adm.fill('[data-testid=weights-form] [name=screens]', '10');
  await Promise.all([adm.waitForURL(/ok=weights/), adm.click('[data-testid=weights-save]')]);
  assert((await adm.inputValue('[data-testid=weights-form] [name=recurrence]')) === '40', 'pesos guardados');
  await b.close();
})();
