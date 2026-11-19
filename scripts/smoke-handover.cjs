/**
 * Smoke del traspaso (docs/ORG.md §Traspasar): al quitar a un comercial, el admin reparte sus propuestas abiertas y sus
 * empresas: unas a una persona, el resto «Todo a mí»; el aviso lleva a la página; solo admin.
 *   npm run build && npm run start:demo ; node scripts/smoke-handover.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const REP = '11111111-1111-4111-8111-111111111111';

async function login(b, email) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${email}"]`);
  await p.waitForURL(/\/admin/);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const rep = await login(b, 'rep@enjoy.test');
  const r = await rep.goto(`${BASE}/admin/team/repartir?de=${REP}`);
  assert(r.status() === 403 || (await rep.content()).includes('No está autorizado') || !(await rep.isVisible('[data-testid=handover]')), 'un comercial no reparte nada');

  // El comercial necesita una empresa a su nombre (la demo no trae ninguna reservada).
  const a = await login(b, 'admin@enjoy.test');
  await a.goto(`${BASE}/admin/team`);
  const repRow = a.locator('[data-testid=members] li', { hasText: 'rep@enjoy.test' });
  assert(await repRow.locator('[data-testid=member-handover]').isVisible(), 'en el equipo: «Repartir lo suyo» en quien tiene cosas');

  // Quitarle del equipo lleva directo a repartir.
  await repRow.locator('[data-testid=remove-open]').click();
  await Promise.all([a.waitForURL(/\/admin\/team\/repartir\?de=/), repRow.locator('[data-testid=remove-confirm]').click()]);
  assert(await a.isVisible('[data-testid=handover-gone]'), 'repartir: «Ya no está en el equipo»');
  const rows = a.locator('[data-testid=handover-row]');
  const n = await rows.count();
  assert(n >= 2, `repartir: sus cosas a la vista (${n})`);
  assert(await a.isDisabled('[data-testid=handover-save]'), 'sin destino elegido no se puede guardar');

  // Unas a una persona: marcar la primera y «Las marcadas a…».
  await rows.nth(0).locator('[data-pick]').check();
  await a.click('[data-testid=handover-checked-to]');
  assert((await rows.nth(0).locator('[data-move]').inputValue()) !== '' && (await rows.nth(1).locator('[data-move]').inputValue()) === '', 'las marcadas: solo esa');
  assert((await a.textContent('[data-summary]')).includes('1'), 'resumen de lo que se va a pasar');
  await Promise.all([a.waitForURL(/ok=handover/), a.click('[data-testid=handover-save]')]);
  assert((await rows.count()) === n - 1, 'pasada una: quedan las demás en la página');

  // El resto, «Todo a mí».
  await a.click('[data-testid=handover-all-me]');
  await Promise.all([a.waitForURL(/\/admin\/team\?ok=handover/), a.click('[data-testid=handover-save]')]);
  assert(!(await a.isVisible('[data-testid=handover-former]')), 'todo repartido: ya no sale en «Ya no están»');

  // El aviso lleva a repartir.
  await a.goto(`${BASE}/admin/notifications?ver=todo`);
  const notice = a.locator('[data-testid=notifications] [data-testid=notification][data-kind=member_left]').first();
  assert(await notice.isVisible(), 'aviso al admin: sale con cosas a su nombre');
  await Promise.all([a.waitForURL(/\/admin\/team\/repartir\?de=/), notice.locator('a').first().click()]);
  assert(true, 'el aviso lleva a repartir');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
