/**
 * Smoke de «propuesta desde la ficha» (docs/PROPOSAL_PRESETS.md §Desde la ficha): un local evaluado en el CRM (DJ
 * residente) → «Crear propuesta» → la propuesta nace con su sector, la receta montada y «¿Tiene DJ residente?» marcada,
 * sin tener que volver a contarlo. Lo que la ficha no sabe, sin marcar.
 *   npm run build && npm run start:demo ; node scripts/smoke-proposal-from-account.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // ---- Un local nuevo, sin sector, evaluado: DJ residente.
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  await p.click('[data-testid=add-open]'); await p.click('[data-testid=new-account]');
  await p.fill('[data-testid=new-account-form] [name=name]', 'Sala Herencia');
  await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
  await p.click('[data-testid=qual-dj-resident]');
  assert(await p.waitForSelector('[data-testid=qual-dj-resident][aria-pressed=true]').then(() => true, () => false), 'en su ficha: DJ residente');

  // ---- Crear propuesta desde la ficha: ya sabe el sector y lo del DJ.
  await Promise.all([p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/), p.click('[data-testid=account-dossier]')]);
  await p.waitForSelector('[data-testid=builder]');
  const sector = await p.$eval('[data-testid=segment]', (s) => s.selectedOptions[0]?.textContent?.trim() ?? '');
  assert(/ocio nocturno/i.test(sector), `su sector, sin elegirlo (${sector})`);
  assert(await p.isChecked('[data-testid=preset-q-dj]'), '«¿Tiene DJ residente?» ya marcada');
  assert((await p.$$('[data-item-key]')).length > 0, 'la receta del sector, ya montada');
  assert((await p.textContent('[data-testid=builder]')).includes('Sala Herencia'), 'con el nombre de la empresa');

  // ---- Un local sin el dato: la pregunta queda para el comercial.
  await p.goto(`${BASE}/admin/accounts?ver=all`);
  await p.click('[data-testid=add-open]'); await p.click('[data-testid=new-account]');
  await p.fill('[data-testid=new-account-form] [name=name]', 'Sala Sin Datos');
  await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
  await Promise.all([p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/), p.click('[data-testid=account-dossier]')]);
  await p.waitForSelector('[data-testid=builder]');
  assert(!(await p.isChecked('[data-testid=preset-q-dj]')), 'lo que la ficha no sabe, sin marcar');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
