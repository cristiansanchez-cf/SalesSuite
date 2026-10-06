/**
 * Smoke del comercial (rol `rep`; docs/FOUNDATIONS.md, ACCOUNTS.md, COMMISSIONS.md): ve las propuestas de ejemplo,
 * las de otros solo en lectura (también por la API), su cuenta reservada en «Lo mío» y cómo la ve un compañero,
 * soltarla, «Preparar mensaje» con el contexto de su propuesta y «Mis comisiones» sin acceso a las del equipo.
 * No usa rep@enjoy.test (otros smokes lo hacen gerente): el admin invita dos comerciales nuevos con nombre único.
 *   npm run build && npm run start:demo ; node scripts/smoke-rep.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const REP_A = `rep-a.${RUN}@enjoy.test`;
const REP_B = `rep-b.${RUN}@enjoy.test`;
const ACCOUNT = `Bar del comercial ${RUN}`;
const CLUB_SOL = '00000000-0000-4000-8000-000000d05511';  // propuesta de ejemplo de otro comercial (store.ts)
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const login = async (email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
    p.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };

  // ---- el admin invita a dos comerciales y deja una cuenta libre
  const admin = await login('admin@enjoy.test');
  for (const email of [REP_A, REP_B]) {
    await admin.goto(`${BASE}/admin/team`);
    await admin.click('[data-dialog-open=invite]');
    await admin.fill('[data-testid=invite-form] [name=email]', email);
    await admin.selectOption('[data-testid=invite-form] [name=role]', 'rep');
    await admin.click('[data-testid=invite-form] button[type=submit]');
    await admin.waitForURL(/ok=invited/);
  }
  await admin.goto(`${BASE}/admin/accounts`);
  await admin.click('[data-testid=new-account]');
  await admin.fill('[data-testid=new-account-form] [name=name]', ACCOUNT);
  await admin.click('[data-testid=new-account-form] button[type=submit]');
  await admin.waitForURL(/ok=created/);
  assert((await admin.getAttribute('[data-testid=account-status]', 'data-state')) === 'free', 'cuenta creada por el admin: libre');

  // ---- propuestas: ve las de ejemplo; las de otros, solo lectura
  const rep = await login(REP_A);
  assert((await rep.textContent('[data-testid=role]')).includes('Comercial'), 'entra como comercial');
  await rep.goto(`${BASE}/admin`);
  const list = await rep.textContent('[data-testid=dossier-list]');
  assert(['Sala X · Bodas 2027', 'Club Sol · Fiesta de verano', 'Hotel Mar Azul · Eventos de empresa'].every((t) => list.includes(t)), 've las propuestas de ejemplo en su lista');
  const r = await rep.goto(`${BASE}/admin/dossiers/${CLUB_SOL}`);
  assert(r.status() === 200, 'abre la propuesta de otro comercial');
  await rep.waitForSelector('[data-testid=builder]');
  assert((await rep.textContent('[data-testid=builder]')).includes('Solo lectura'), 'propuesta ajena: aviso de solo lectura');
  assert(await rep.isDisabled('[data-testid=title]') && await rep.isDisabled('[data-testid=outcome]'), 'propuesta ajena: título y resultado deshabilitados');
  const api = `${BASE}/admin/api/dossiers/${CLUB_SOL}`;
  const st = await rep.request.get(api);
  assert(st.status() === 200 && (await st.json()).canEdit === false, 'API: estado legible con canEdit=false');
  const save = await rep.request.post(api, { headers: { 'content-type': 'application/json', origin: BASE }, data: { op: 'update', patch: { title: `Pisada ${RUN}` } } });
  assert(save.status() === 403, `API: guardar en propuesta ajena → 403 (${save.status()})`);
  const del = await rep.request.delete(api, { headers: { origin: BASE } });
  assert(del.status() === 403, `API: borrar propuesta ajena → 403 (${del.status()})`);
  assert(!(await (await rep.request.get(api)).json()).dossier.title.includes(RUN), 'la propuesta ajena no ha cambiado');

  // su propia propuesta sí se edita
  await rep.goto(`${BASE}/admin`);
  await rep.click('[data-testid=new-dossier]');
  await rep.fill('[data-testid=create-form] [name=prospectCompany]', `Sala Prisma ${RUN}`);
  await rep.fill('[data-testid=create-form] [name=title]', `Propuesta del comercial ${RUN}`);
  await rep.click('[data-testid=create-form] button[type=submit]');
  await rep.waitForURL(/\/admin\/dossiers\/[0-9a-f-]{36}$/);
  assert(!(await rep.isDisabled('[data-testid=title]')) && !(await rep.textContent('[data-testid=builder]')).includes('Solo lectura'), 'su propuesta: editable');

  // ---- Preparar mensaje desde su propuesta
  await rep.click('[data-testid=followup] a[href^="/admin/compose?dossier="]');
  await rep.waitForURL(/\/admin\/compose\?dossier=/);
  assert((await rep.$eval('[data-testid=compose-form] [name=dossier]', (s) => s.selectedOptions[0]?.textContent ?? '')).includes(`Propuesta del comercial ${RUN}`), 'Preparar mensaje: la propuesta ya elegida');
  assert((await rep.inputValue('[data-testid=type-select]')) === 'seguimiento', 'Preparar mensaje: tipo «seguimiento» desde la propuesta');
  await rep.click('[data-testid=compose-go]');
  await rep.waitForSelector('[data-testid=prompt]');
  const prompt = await rep.inputValue('[data-testid=prompt]');
  assert(prompt.includes(`PROPUESTA: «Propuesta del comercial ${RUN}» para Sala Prisma ${RUN}`), 'el contexto incluye la propuesta y la empresa');
  if (OUT) await rep.screenshot({ path: `${OUT}/rep-compose.png`, fullPage: false });

  // ---- Cuentas: me la quedo → «Lo mío»; un compañero la ve de otra persona; la suelto
  await rep.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(ACCOUNT)}`);
  await rep.locator(`[data-testid=account][data-name="${ACCOUNT}"] [data-testid=claim]`).click();
  await rep.waitForURL(/ok=claimed/);
  const accountUrl = rep.url().split('?')[0];
  await rep.goto(`${BASE}/admin/accounts?ver=mine`);
  assert((await rep.getAttribute(`[data-testid=account][data-name="${ACCOUNT}"] [data-testid=account-state]`, 'data-state')) === 'mine', '«Lo mío»: la cuenta reservada');

  const mate = await login(REP_B);
  await mate.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(ACCOUNT)}`);
  const row = mate.locator(`[data-testid=account][data-name="${ACCOUNT}"]`);
  assert((await row.locator('[data-testid=account-state]').getAttribute('data-state')) === 'taken' && !(await row.locator('[data-testid=claim]').count()), 'otro comercial: la trabaja otra persona, sin «Me la quedo»');
  await mate.goto(accountUrl);
  assert((await mate.getAttribute('[data-testid=account-status]', 'data-state')) === 'taken', 'otro comercial: ficha como reservada');
  assert(!(await mate.isVisible('[data-testid=contact-form]')) && !(await mate.isVisible('[data-testid=account-dossier]')), 'otro comercial: sin registrar contacto ni crear propuesta');
  await mate.goto(`${BASE}/admin/accounts?ver=mine`);
  assert(!(await mate.isVisible(`[data-testid=account][data-name="${ACCOUNT}"]`)), 'otro comercial: no está en su «Lo mío»');

  await rep.goto(accountUrl);
  await rep.click('[data-dialog-open=release]');
  await rep.click('dialog#release button[type=submit]');
  await rep.waitForURL(/ok=released/);
  assert((await rep.getAttribute('[data-testid=account-status]', 'data-state')) === 'free', 'soltar la cuenta: vuelve a estar libre');
  await rep.goto(`${BASE}/admin/accounts?ver=mine`);
  assert(!(await rep.isVisible(`[data-testid=account][data-name="${ACCOUNT}"]`)), 'soltada: ya no está en «Lo mío»');
  await mate.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(ACCOUNT)}`);
  assert(await mate.isVisible(`[data-testid=account][data-name="${ACCOUNT}"] [data-testid=claim]`), 'el compañero ya puede quedársela');

  // ---- Mis comisiones sí; las del equipo no
  const mc = await rep.goto(`${BASE}/admin/commissions`);
  assert(mc.status() === 200 && (await rep.locator('[data-testid=my-totals] [data-testid^="total-"]').count()) === 3, 'Mis comisiones: resumen con pendiente, aprobado y pagado');
  assert((await rep.textContent('[data-testid="total-Pagado"]')).includes('0,00'), 'Mis comisiones: nada pagado todavía');
  if (OUT) await rep.screenshot({ path: `${OUT}/rep-commissions.png`, fullPage: true });
  assert(!(await rep.locator('a[href^="/admin/commissions/team"]').count()), 'sin enlace a las comisiones del equipo');
  const team = await rep.goto(`${BASE}/admin/commissions/team`);
  assert(team.status() === 403, `comisiones del equipo → 403 (${team.status()})`);

  assert(errors.length === 0, `sin errores JS ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
