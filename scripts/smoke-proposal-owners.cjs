/**
 * Smoke de «cada uno ve sus propuestas» (docs/ORG.md): el admin filtra por comercial y da una copia (en coreano, con
 * los textos propios traducidos por la respuesta fija de pruebas, AI_RESEARCH_FIXTURE=1); el comercial solo ve las suyas
 * y no abre las de otros.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-proposal-owners.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const TITLE = `Propuesta del admin ${Date.now() % 100000}`;

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const titles = (p) => p.$$eval('[data-testid=dossier-list] .co-entity', (xs) => xs.map((x) => x.textContent.trim()));

  // ---- el admin crea una propuesta (desde otra) y le da una copia en coreano al comercial
  const adm = await login('admin@enjoy.test');
  await adm.goto(`${BASE}/admin`);
  assert(await adm.isVisible('[data-testid=author-select]'), 'el admin elige de quién ver las propuestas');
  await adm.click('[data-testid=new-dossier]');
  await adm.fill('[data-testid=create-form] [name=title]', TITLE);
  const tpl = await adm.$eval('[data-testid=create-form] [name=fromDossierId]', (s) => [...s.options].find((o) => o.value)?.value);
  await adm.selectOption('[data-testid=create-form] [name=fromDossierId]', tpl);
  await Promise.all([adm.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}/), adm.click('[data-testid=create-form] button[type=submit]')]);
  const adminUrl = adm.url();
  await adm.click('[data-testid=copy-to-open]');
  await adm.check('[data-testid=copy-to-form] label:has-text("rep@enjoy.test") [data-testid=copy-to-member]');
  await adm.selectOption('[data-testid=copy-to-locale]', 'ko-KR');
  await Promise.all([adm.waitForURL(/ok=copied/), adm.click('[data-testid=copy-to-send]')]);
  assert((await adm.textContent('main')).includes('Copia creada'), 'copia creada');

  // Por defecto, las suyas; eligiendo al comercial, las de él.
  await adm.goto(`${BASE}/admin`);
  assert((await titles(adm)).includes(TITLE), 'el admin ve las suyas por defecto');
  const repId = await adm.$eval('[data-testid=author-select]', (s) => [...s.options].find((o) => /Comercial|rep@/.test(o.textContent))?.value);
  await Promise.all([adm.waitForURL(/autor=/), adm.selectOption('[data-testid=author-select]', repId)]);
  const ofRep = await titles(adm);
  assert(ofRep.includes(`[ko] ${TITLE}`) && !ofRep.includes(TITLE), `las del comercial (${ofRep.length})`);
  if (OUT) await adm.screenshot({ path: `${OUT}/owners-admin.png`, fullPage: true });
  await adm.goto(`${BASE}/admin/analytics`);
  assert(await adm.isVisible('[data-testid=analytics-author-select]'), 'analítica: elegir comercial');

  // ---- el comercial: solo las suyas, y no abre las de otros
  const rep = await login('rep@enjoy.test');
  await rep.goto(`${BASE}/admin`);
  const mine = await titles(rep);
  assert(mine.includes(`[ko] ${TITLE}`), 'el comercial tiene su copia');
  assert(!mine.includes(TITLE), 'no ve la del admin');
  assert(!(await rep.isVisible('[data-testid=author-select]')), 'sin selector de comercial');
  const res = await rep.goto(adminUrl);
  assert(res.status() === 404, 'no abre la del admin por enlace');
  await rep.goto(`${BASE}/admin`);
  await Promise.all([rep.waitForURL(/\/admin\/dossiers\//), rep.click(`[data-testid=dossier-list] a:has-text("[ko] ${TITLE}")`)]);
  if (OUT) await rep.screenshot({ path: `${OUT}/owners-rep.png`, fullPage: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
