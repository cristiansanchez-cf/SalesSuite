/**
 * Smoke del tablero (docs/CRM_DINAMICO.md §34): la columna la decide el historial, el comercial solo ve el suyo, quien
 * gestiona filtra por comercial, y el plazo para cerrar se configura por tipo de cliente.
 *   npm run build && npm run start:demo ; node scripts/smoke-board.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const NAME = 'Bar Tablero Smoke';

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}@enjoy.test"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const stageOf = (p, name) => p.getAttribute(`[data-testid=board-card][data-name="${name}"]`, 'data-stage').catch(() => null);
  const board = async (p, qs = '') => { await p.goto(`${BASE}/admin/accounts/tablero${qs}`); await p.waitForSelector('[data-testid=board-head]'); };

  // ---- el comercial: alta, y la columna avanza sola con lo que apunta
  const rep = await login('rep');
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  await rep.click('[data-testid=add-open]'); await rep.click('[data-testid=new-account]');
  await rep.fill('[data-testid=new-account-form] [name=name]', NAME);
  await Promise.all([rep.waitForURL(/ok=created/), rep.click('[data-testid=new-account-form] button[type=submit]')]);
  const page = rep.url().split('?')[0];
  const log = async (o) => { await rep.click('[data-testid=log-open]'); await rep.click(`[data-testid=outcome-${o}]`); await Promise.all([rep.waitForURL(/ok=contact/), rep.click('[data-testid=log-save]')]); };
  await log('no_reply');
  await board(rep);
  assert(!(await rep.isVisible('[data-testid=board-reps]')), 'el comercial no ve el filtro de comerciales');
  assert(await stageOf(rep, NAME) === 'contacted', 'escrito sin respuesta → Primer contacto');
  assert(await stageOf(rep, 'Club Sol') === 'negotiating', 'Club Sol (contestó) → Negociando');
  await rep.goto(page);
  await log('replied');
  await board(rep);
  assert(await stageOf(rep, NAME) === 'negotiating', 'contestó → Negociando');
  const card = await rep.textContent(`[data-testid=board-card][data-name="${NAME}"]`);
  assert(card.includes('2 interacciones') && card.includes('Contestó'), `la tarjeta: interacciones y lo último (${card.trim()})`);
  assert(!(await rep.$('[data-testid=board-col] [data-testid=board-move]')), 'no hay forma de mover a mano');
  // Por la URL tampoco: el comercial no ve el tablero de otro.
  await board(rep, '?comercial=otro');
  assert(await stageOf(rep, NAME) === 'negotiating', '?comercial= se ignora: sigue viendo el suyo');
  if (OUT) await rep.screenshot({ path: `${OUT}/board-rep.png`, fullPage: true });

  // ---- quien gestiona: todos, o uno
  const adm = await login('admin');
  await board(adm);
  assert(await adm.isVisible('[data-testid=board-reps]'), 'admin: filtro por comercial');
  assert(await stageOf(adm, NAME) === 'negotiating', 'admin: ve el del comercial');
  await Promise.all([adm.waitForURL(/comercial=/), adm.click('[data-testid=board-rep][data-name="Comercial Enjoy"]')]);
  assert(await stageOf(adm, NAME) === 'negotiating' && (await adm.getAttribute('[data-testid=board-rep][data-name="Comercial Enjoy"]', 'aria-current')) === 'true', 'filtrado por «Comercial Enjoy»');
  if (OUT) await adm.screenshot({ path: `${OUT}/board-admin.png`, fullPage: true });

  // ---- plazos por tipo de cliente (Configurar → Datos del CRM → Campos → Tipos)
  await adm.goto(`${BASE}/admin/team/fields?de=tipos`);
  const first = adm.locator('[data-testid=kind-row]').first();
  assert((await first.locator('[data-testid=kind-days]').inputValue()) === '60' && (await first.locator('[data-testid=kind-days-big]').inputValue()) === '180', 'plazos por defecto: 60 y 180 días');
  await first.locator('[data-testid=kind-days]').fill('45');
  await Promise.all([adm.waitForURL(/ok=kinds/), adm.click('[data-testid=kinds-save]')]);
  assert((await adm.locator('[data-testid=kind-row]').first().locator('[data-testid=kind-days]').inputValue()) === '45', 'plazo guardado (45 días)');
  // Se deja como estaba (los smokes comparten servidor).
  await adm.locator('[data-testid=kind-row]').first().locator('[data-testid=kind-days]').fill('60');
  await Promise.all([adm.waitForURL(/ok=kinds/), adm.click('[data-testid=kinds-save]')]);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
