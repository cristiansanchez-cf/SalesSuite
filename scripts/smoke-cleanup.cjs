/**
 * Smoke de «Limpiar empresas» (docs/CRM_DINAMICO.md §17), con la IA de pruebas (AI_RESEARCH_FIXTURE=1, sin clave):
 * revisar con IA → vista previa (DJs, posible alianza) → aplicar → pestañas Empresas · DJs · Descartadas → recuperar y
 * descartar a mano desde la ficha → deshacer la limpieza.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-cleanup.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
// Acciones en segundo plano (data-async): no cambian de página; se espera a que terminen.
const bg = async (pg, click) => { const n = Number(await pg.evaluate(() => document.documentElement.dataset.asyncDone || 0)); await click(); await pg.waitForFunction((k) => Number(document.documentElement.dataset.asyncDone || 0) > k, n, { timeout: 90000 }); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  for (const name of ['DJ Nova', 'Acid Records tienda']) {
    await p.goto(`${BASE}/admin/accounts?ver=all`);
    await p.click('[data-testid=new-account]');
    await p.fill('[data-testid=new-account-form] [name=name]', name);
    await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
  }

  // ---- Limpiar con IA (Configurar → Datos del CRM → Limpiar)
  await p.goto(`${BASE}/admin/import`);
  await Promise.all([p.waitForURL(/\/admin\/limpiar/), p.click('[data-testid=tab-cleanup]')]);
  await p.click('[data-testid=cleanup-run]');
  await p.waitForSelector('[data-testid=cleanup-preview]', { timeout: 120000 });
  const groups = await p.$$eval('[data-testid=cleanup-group]', (xs) => xs.map((x) => [x.getAttribute('data-group'), x.textContent]));
  const g = Object.fromEntries(groups);
  assert(g.dj?.includes('DJ Nova') && g.partner?.includes('Acid Records'), `DJs y posible alianza, con su porqué (${Object.keys(g)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/cleanup-preview.png`, fullPage: true });
  await Promise.all([p.waitForURL(/ok=applied/), p.click('[data-testid=cleanup-apply]')]);
  assert((await p.textContent('main')).includes('descartadas'), 'aplicado, con el resumen');

  // ---- Pestañas en Empresas
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  const list = async () => p.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.getAttribute('data-name')));
  assert(!(await list()).includes('DJ Nova') && !(await list()).includes('Acid Records tienda'), 'en Empresas, solo empresas de verdad');
  await Promise.all([p.waitForURL(/tipo=dj/), p.click('[data-testid=kind-tab-dj]')]);
  assert((await list()).includes('DJ Nova'), 'el DJ, en DJs');
  await Promise.all([p.waitForURL(/tipo=descartadas/), p.click('[data-testid=kind-tab-descartadas]')]);
  assert((await list()).includes('Acid Records tienda') && (await p.textContent('[data-testid=discard-tag]')).includes('Posible alianza'), 'en Descartadas, con su motivo');
  if (OUT) await p.screenshot({ path: `${OUT}/cleanup-tabs.png` });

  // ---- En la ficha: recuperar y volver a descartar a mano
  await p.click('[data-testid=account][data-name="Acid Records tienda"] a.co-row__main');
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  assert((await p.textContent('[data-testid=discarded-banner]')).includes('Posible alianza'), 'la ficha dice que está descartada y por qué');
  await bg(p, () => p.click('[data-testid=restore]'));
  assert(!(await p.isVisible('[data-testid=discarded-banner]')), 'recuperada, sin recargar');
  await p.click('[data-testid=discard-open]');
  await p.check('[data-testid=discard-reason-not_sector]');
  await p.fill('[data-testid=discard-note]', 'Tienda online');
  await Promise.all([p.waitForURL(/ok=discarded/), p.click('[data-testid=discard-dialog-confirm]')]);
  assert((await p.textContent('[data-testid=discarded-banner]')).includes('No es del sector'), 'descartada a mano, con motivo y nota');

  // ---- Deshacer la limpieza
  await p.goto(`${BASE}/admin/limpiar`);
  await Promise.all([p.waitForURL(/ok=undone/), p.click('[data-testid=cleanup-undo]')]);
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  assert((await list()).includes('DJ Nova'), 'deshacer: el DJ vuelve a Empresas');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
