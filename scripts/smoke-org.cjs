/**
 * Smoke del organigrama (docs/ORG.md): la dirección monta una delegación con su gerente y sus zonas; el gerente ve solo
 * lo de su equipo; el superadmin ve la plataforma y entra en cualquier espacio como admin.
 *   npm run build && npm run start:demo ; node scripts/smoke-org.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

async function login(b, email) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click(`[data-testid="demo-${email}"]`);
  await p.waitForURL(/\/admin/);
  return p;
}
async function newDossier(p, title) {
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=title]', title);
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  return p.url();
}

(async () => {
  const b = await chromium.launch();
  const admin = await login(b, 'admin@enjoy.test');
  const adminDossier = await newDossier(admin, 'Propuesta del admin');
  const rep = await login(b, 'rep@enjoy.test');
  await newDossier(rep, 'Propuesta del comercial');

  // La dirección monta la delegación: nombre + gerente (pasa a gerente de esa delegación) + una zona.
  await admin.goto(`${BASE}/admin/team/org`);
  assert(await admin.isVisible('[data-testid=org-top]'), 'arriba, la dirección');
  await admin.fill('[data-testid=delegation-new] [name=name]', 'Levante');
  await admin.selectOption('[data-testid=delegation-new] [name=managerId]', { label: 'Comercial Enjoy' });
  await admin.click('[data-testid=delegation-new] button[type=submit]');
  await admin.waitForURL(/ok=created/);
  const card = admin.locator('[data-testid=delegation][data-name=Levante]');
  assert(await card.isVisible(), 'delegación Levante creada');
  const zone = card.locator('[data-testid=delegation-zone]');
  if (await zone.count()) {
    const opt = await zone.locator('option').nth(1).textContent();
    await zone.selectOption({ index: 1 });
    await admin.waitForURL(/ok=zone/);
    assert((await admin.locator('[data-testid=delegation][data-name=Levante]').textContent()).includes(opt.trim()), `zona «${opt.trim()}» en Levante`);
  }
  if (OUT) await admin.screenshot({ path: `${OUT}/org.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/team`);
  assert((await admin.textContent('[data-testid=members]')).includes('Levante'), 'Equipo: se ve la delegación de cada persona');

  // El gerente de Levante: solo su equipo.
  const ger = await login(b, 'rep@enjoy.test');
  assert((await ger.textContent('[data-testid=role]')).includes('Gerente'), `rol: ${(await ger.textContent('[data-testid=role]')).trim()}`);
  await ger.goto(`${BASE}/admin`);
  const list = await ger.textContent('main');
  assert(list.includes('Propuesta del comercial') && !list.includes('Propuesta del admin'), 'el gerente ve las de su equipo, no las de fuera');
  const r = await ger.goto(adminDossier);
  assert(r.status() === 404, `propuesta de fuera de su delegación → 404 (${r.status()})`);
  await ger.goto(`${BASE}/admin/team/org`);
  assert((await ger.locator('[data-testid=delegation]').count()) === 1 && !(await ger.isVisible('[data-testid=delegation-new]')), 'organigrama: ve su delegación, sin poder cambiarlo');

  // Superadmin: plataforma y, dentro de un espacio, admin.
  const sup = await login(b, 'super@cofundo.test');
  assert((await sup.textContent('[data-testid=role]')).includes('Superadmin'), 'rol: Superadmin');
  await sup.click('[data-testid=nav-platform]');
  await sup.waitForURL(/\/admin\/platform/);
  assert((await sup.locator('[data-testid=platform-space]').count()) >= 2, 'plataforma: todos los espacios');
  if (OUT) await sup.screenshot({ path: `${OUT}/platform.png`, fullPage: true });
  assert((await sup.goto(adminDossier)).status() === 200, 'superadmin entra en cualquier propuesta del espacio');
  assert((await (await login(b, 'admin@enjoy.test')).goto(`${BASE}/admin/platform`)).status() === 403, 'un admin normal no ve la plataforma');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
