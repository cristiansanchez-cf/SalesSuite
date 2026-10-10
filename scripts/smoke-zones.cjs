/**
 * Smoke de «Ordenar ciudades» (docs/CRM_DINAMICO.md §14), con la clasificación fija de pruebas (AI_RESEARCH_FIXTURE=1):
 * ciudades desordenadas → analizar → vista previa (desmarcar una) → aplicar → deshacer → aplicar → borrar vacías.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-zones.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // ---- ciudades como las dejó el Notion
  for (const name of ['Requena (Valencia)', 'Barcelona creo que no es correcto, que están en Valencia', 'Account Executive', '28039']) {
    await p.goto(`${BASE}/admin/territory`);
    await p.fill('[data-testid=zone-form] [name=name]', name);
    await p.click('[data-testid=zone-form] button[type=submit]');
    await p.waitForSelector(`[data-testid=zone][data-name="${name}"]`);
  }
  const moveTo = async (account, zone) => {
    await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(account)}`);
    await p.click(`[data-testid=account][data-name="${account}"] a.co-row__main`);
    await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);
    await p.selectOption('form:has(input[name=action][value=save]) select[name=zoneId]', { label: zone });
    await Promise.all([p.waitForURL(/ok=saved/), p.click('form:has(input[name=action][value=save]) button[type=submit]')]);
  };
  await moveTo('Sala Marina', 'Requena (Valencia)');
  await moveTo('Discoteca Faro', 'Barcelona creo que no es correcto, que están en Valencia');
  await moveTo('Terraza Azahar', 'Account Executive');

  // ---- Importar → «Ordenar ciudades»
  await p.goto(`${BASE}/admin/import`);
  await Promise.all([p.waitForURL(/\/admin\/import\/ciudades/), p.click('[data-testid=zones-card]')]);
  const analyze = async () => {
    await p.click('[data-testid=zones-analyze]');
    await p.waitForSelector('[data-testid=zones-preview]', { timeout: 60000 });
  };
  await analyze();
  const labels = await p.$$eval('[data-testid=zones-group]', (xs) => xs.map((x) => x.getAttribute('data-label')));
  assert(labels.includes('España › Comunidad Valenciana › Valencia › Requena'), `Comunidad › Provincia › Pueblo (${labels})`);
  const vlc = p.locator('[data-testid=zones-group][data-label="España › Comunidad Valenciana › Valencia"]');
  assert((await vlc.textContent()).includes('Barcelona creo que') && (await vlc.locator('[data-testid=zones-review]').count()) === 1, 'la dudosa va donde dice la nota, marcada «revisar»');
  assert((await p.textContent('[data-testid=zones-junk]')).includes('Account Executive'), 'lo que no es un sitio, aparte');
  // Desmarcar Madrid: se queda como está.
  const mad = p.locator('[data-testid=zones-group]:has-text("«Madrid»") [data-testid=zones-keep]');
  if (await mad.count()) await mad.first().uncheck();
  if (OUT) await p.screenshot({ path: `${OUT}/zones-preview.png`, fullPage: true });
  await Promise.all([p.waitForURL(/ok=applied/), p.click('[data-testid=zones-apply]')]);
  assert((await p.textContent('main')).includes('empresas ordenadas'), 'aplicado, con el resumen');
  assert(await p.isVisible('[data-testid=zones-see-review]'), 'enlace a las de revisar');

  // La empresa, en su sitio y con la nota del Notion.
  await p.goto(`${BASE}/admin/accounts?ver=all&q=Sala%20Marina`);
  assert((await p.textContent('[data-testid=account][data-name="Sala Marina"]')).includes('Valencia › Requena'), 'Sala Marina en Valencia › Requena');
  await p.goto(`${BASE}/admin/accounts?ver=all&lista=revisar-ciudad`);
  const review = await p.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.getAttribute('data-name')));
  assert(review.includes('Discoteca Faro') && review.includes('Terraza Azahar'), `lista «revisar-ciudad» (${review})`);

  // ---- deshacer
  await p.goto(`${BASE}/admin/import/ciudades`);
  await Promise.all([p.waitForURL(/ok=undone/), p.click('[data-testid=zones-undo]')]);
  await p.goto(`${BASE}/admin/accounts?ver=all&q=Sala%20Marina`);
  assert((await p.textContent('[data-testid=account][data-name="Sala Marina"]')).includes('Requena (Valencia)'), 'deshacer: vuelve a como estaba');

  // ---- otra vez, y borrar las vacías
  await p.goto(`${BASE}/admin/import/ciudades`);
  await analyze();
  const mad2 = p.locator('[data-testid=zones-group]:has-text("«Madrid»") [data-testid=zones-keep]');
  if (await mad2.count()) await mad2.first().uncheck();
  await Promise.all([p.waitForURL(/ok=applied/), p.click('[data-testid=zones-apply]')]);
  await p.click('[data-testid=zones-cleanup]');
  await Promise.all([p.waitForURL(/ok=cleaned/), p.click('[data-testid=zones-cleanup-dialog-confirm]')]);
  assert(/\d+ ciudades vacías borradas/.test(await p.textContent('main')), 'vacías borradas');
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  const opts = await p.$$eval('[data-testid=filter-zone] option', (xs) => xs.map((x) => x.textContent.trim()));
  assert(!opts.some((o) => /28039|Account Executive|creo que/.test(o)), 'el desplegable de ciudad, limpio');
  assert(opts.some((o) => o.endsWith('Valencia › Requena')), 'con la nueva');
  if (OUT) await p.screenshot({ path: `${OUT}/zones-after.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
