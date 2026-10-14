/**
 * Smoke del buscador de ciudad (docs/CRM_DINAMICO.md §44): un comercial da de alta una empresa en Bilbao (del catálogo
 * de España, sin que el admin la haya configurado) y otra en Busan (Google, con la de pruebas: Corea del Sur); las dos
 * zonas se crean solas. En Datos se cambia la ciudad con el mismo buscador.
 *   npm run build && npm run start:demo ; node scripts/smoke-zone-pick.cjs   (con AI_RESEARCH_FIXTURE=1)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  const open = async (name) => {
    await p.goto(`${BASE}/admin/accounts?ver=all`);
    await p.click('[data-testid=add-open]'); await p.click('[data-testid=new-account]');
    await p.fill('[data-testid=new-account-form] [name=name]', name);
    if (await p.isVisible('[data-testid=new-zone] [data-zp-change]')) await p.click('[data-testid=new-zone] [data-zp-change]');
  };

  // ---- Bilbao: no es una zona todavía; sale al escribir «bilb» (sin mayúsculas) y se crea al guardar.
  await open('Sala Ría Pick');
  await p.fill('[data-testid=new-zone-q]', 'bilb');
  const first = p.locator('[data-testid=new-zone-list] button').first();
  await first.waitFor();
  assert((await first.textContent()).includes('Bilbao') && (await first.textContent()).includes('Vizcaya'), `«bilb» → Bilbao (Vizcaya): ${await first.textContent()}`);
  if (OUT) await p.screenshot({ path: `${OUT}/zone-pick.png` });
  await first.click();
  assert((await p.textContent('[data-testid=new-zone-chosen]')).includes('Bilbao'), 'elegida');
  await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
  assert((await p.textContent('#acc-head')).includes('España › País Vasco › Vizcaya › Bilbao'), 'la empresa, en España › País Vasco › Vizcaya › Bilbao');

  // ---- Busan: ni zona ni catálogo → Google (cualquier país), y se crea Corea del Sur › Busan.
  await open('Club Haeundae Pick');
  await p.fill('[data-testid=new-zone-q]', 'Busan');
  const world = p.locator('[data-testid=new-zone-list] [data-testid=zone-world]').first();
  await world.waitFor({ timeout: 10000 });
  assert((await world.textContent()).includes('Corea del Sur'), `Busan, de Google: ${await world.textContent()}`);
  await world.click();
  await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
  assert((await p.textContent('#acc-head')).includes('Corea del Sur › Busan'), 'la empresa, en Corea del Sur › Busan');

  // ---- La segunda vez, Busan ya es una zona (sin Google) y en Datos se cambia con el mismo buscador.
  await p.click('[data-testid=acc-zone] [data-zp-change]');
  await p.fill('[data-testid=acc-zone-q]', 'Getx');
  await p.locator('[data-testid=acc-zone-list] button').first().click();
  await p.waitForFunction(() => document.querySelector('#acc-head')?.textContent?.includes('Getxo'));
  assert(true, 'en Datos: Getxo, guardado solo');
  await open('Otra Busan Pick');
  await p.fill('[data-testid=new-zone-q]', 'Busan');
  const again = p.locator('[data-testid=new-zone-list] [data-testid=zone-option]').first();
  await again.waitFor();
  assert((await again.textContent()).includes('Corea del Sur'), 'Busan ya sale como zona');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
