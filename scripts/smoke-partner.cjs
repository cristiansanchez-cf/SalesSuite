/**
 * Smoke E2E de colaboradores (modo DEMO, docs/PARTNERS.md): acceso con código, «Mis cuentas»,
 * propuesta con precio bloqueado por la política de la cuenta, aislamiento y gestión desde Equipo.
 *   npm run build && npm run start:demo ; node scripts/smoke-partner.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const DJ_ID = '55555555-5555-4555-8555-555555555555';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const page = async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    return p;
  };
  const settle = (p) => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));

  // ---- acceso sin contraseña: email → código
  const dj = await page();
  await dj.goto(`${BASE}/admin/login`);
  await dj.fill('[data-testid=code-send] [name=email]', 'DJ@enjoy.test');
  await dj.click('[data-testid=code-send] button[type=submit]');
  const code = (await dj.textContent('[data-testid=demo-code] strong')).trim();
  assert(/^\d{6}$/.test(code), 'código de 6 dígitos (en demo se muestra en pantalla)');
  await dj.fill('[data-testid=code-verify] [name=code]', '000000' === code ? '111111' : '000000');
  await dj.click('[data-testid=code-verify] button[type=submit]');
  assert((await dj.textContent('[role=alert]')).includes('Código incorrecto'), 'código erróneo → rechazado');
  await dj.fill('[data-testid=code-verify] [name=code]', code);
  await dj.click('[data-testid=code-verify] button[type=submit]');
  await dj.waitForURL(`${BASE}/admin`);
  assert((await dj.textContent('[data-testid=role]')).trim() === 'Colaborador', 'entra como colaborador');
  const nav = await dj.textContent('nav[aria-label=Secciones]');
  assert(nav.includes('Mis cuentas') && !nav.includes('Catálogo') && !nav.includes('Equipo') && !nav.includes('Playbook'), 'menú de colaborador (sin Catálogo/Equipo/Playbook)');

  // ---- mis cuentas
  assert((await dj.$$('[data-testid=account]')).length === 3, 've sus 3 cuentas');
  assert((await dj.textContent('[data-testid=welcome-note]')).includes('Hola, Dani'), 'su guía de bienvenida');
  assert((await dj.$$('[data-testid=partner-modules] li')).length === 2, 'solo 2 módulos para ofrecer');
  assert((await dj.textContent('[data-account="Sala Luna"] [data-testid=account-notes]')).includes('Marcos'), 'indicaciones del admin por cuenta');
  if (OUT) await dj.screenshot({ path: `${OUT}/partner-home.png`, fullPage: true });

  // ---- propuesta para Club Neón (−10 %)
  const neon = dj.locator('[data-account="Club Neón"]');
  await neon.locator('details').evaluate((d) => { d.open = true; });
  await neon.locator('[name=title]').fill(`Club Neón ${RUN}`);
  await neon.locator('[name=prospectName]').fill('Lucía (jefa de sala)');
  await neon.locator('button[type=submit]').click();
  await dj.waitForURL(/\/admin\/dossiers\//);
  const neonUrl = dj.url();
  assert((await dj.textContent('[data-testid=partner-account]')).includes('Precio especial'), 'builder: cuenta y política visibles');
  assert(!(await dj.$('[data-testid=price-mode-total]')), 'builder: sin selector de modo de precio');
  assert(!(await dj.$('[data-testid=add-hero-bodas]')), 'catálogo: sin módulos no permitidos');
  await dj.click('[data-testid=add-tabs-experiencias]'); await settle(dj);
  assert(!(await dj.$('[data-testid=item-price-input]')), 'item: sin campo de precio');
  assert((await dj.textContent('[data-testid=item]')).includes('405'), 'precio de la cuenta aplicado (450 € −10 % = 405 €)');
  assert(!(await dj.textContent('body')).includes('450'), 'nunca ve la tarifa (450 €)');
  if (OUT) await dj.screenshot({ path: `${OUT}/partner-builder.png`, fullPage: false });

  // ---- aislamiento
  let r = await dj.goto(`${BASE}/admin/dossiers/${SALA_X}`);
  assert(r.status() === 404, 'no abre dossiers del equipo (404)');
  r = await dj.goto(`${BASE}/admin/team`);
  assert(r.status() === 403, 'no entra en Equipo (403)');
  await dj.goto(`${BASE}/admin/learn`);
  assert((await dj.$$('[data-testid=topic]')).length === 2, 'Aprende: solo sus 2 módulos');
  assert((await dj.$$('[data-testid=segment]')).length === 1, 'Aprende: solo el sector de sus cuentas');
  await dj.click('[data-testid=topic] >> nth=0');
  assert((await dj.textContent('[data-testid=tip-form]')).includes('Enviar para revisión'), 'aporta al playbook, pendiente de aprobación');
  assert(!(await dj.textContent('main')).includes('Precio y monetización'), 'sin jugadas de monetización');

  // ---- admin: gestiona al colaborador
  const admin = await page();
  await admin.goto(`${BASE}/admin/login`);
  await admin.click('[data-testid="demo-admin@enjoy.test"]');
  await admin.waitForURL(`${BASE}/admin`);
  await admin.goto(`${BASE}/admin/team`);
  assert((await admin.$$('[data-testid=partner-row]')).length >= 1, 'Equipo: lista de colaboradores');
  assert(!(await admin.textContent('[data-testid=members]')).includes('dj@enjoy.test'), 'el colaborador no aparece como miembro del equipo');
  await admin.goto(`${BASE}/admin/team/partners/${DJ_ID}`);
  const acc = admin.locator('[data-testid=partner-account][data-account="Club Neón"]');
  assert((await acc.locator('[data-testid=price-preview]').textContent()).includes('405'), 'vista previa del precio por cuenta');
  await acc.locator('[data-testid=edit-account]').click();
  await acc.locator('[data-testid=price-policy]').selectOption('list');
  await acc.locator('button[type=submit]', { hasText: 'Guardar cuenta' }).click();
  await admin.waitForURL(/ok=account-saved/);
  if (OUT) await admin.screenshot({ path: `${OUT}/partner-admin.png`, fullPage: true });
  await dj.goto(neonUrl);
  assert((await dj.textContent('[data-testid=item]')).includes('450'), 'cambio de política aplicado a su propuesta (tarifa)');
  await admin.goto(neonUrl);
  assert((await admin.textContent('[data-testid=partner-account]')).includes('Club Neón'), 'el admin abre la propuesta del colaborador');

  // ---- invitar otro colaborador
  await admin.goto(`${BASE}/admin/team`);
  await admin.click('[data-dialog-open=invite-partner] >> nth=0');
  const inv = admin.locator('[data-testid=invite-partner-form]');
  await inv.locator('[name=email]').fill(`monitor-${RUN}@buceo.test`);
  await inv.locator('label.co-chip').first().click();
  await inv.locator('button[type=submit]').click();
  await admin.waitForURL(/\/admin\/team\/partners\/.+ok=partner-invited/);
  assert((await admin.textContent('[role=status]')).includes('asígnale sus cuentas'), 'invitado → ficha para asignarle cuentas');
  await admin.click('[data-dialog-open=add-account-dialog] >> nth=0');
  await admin.fill('[data-testid=add-account] [name=name]', 'Centro Azul');
  await admin.click('[data-testid=add-account] button[type=submit]');
  await admin.waitForURL(/ok=account-added/);
  assert((await admin.$$('[data-testid=partner-account]')).length === 1, 'cuenta asignada al nuevo colaborador');

  // ---- caducidad
  await admin.goto(`${BASE}/admin/team/partners/${DJ_ID}`);
  await admin.fill('[data-testid=partner-profile] [name=expiresAt]', '2020-01-01');
  await admin.click('[data-testid=partner-profile] button[type=submit]');
  await admin.waitForURL(/ok=profile/);
  r = await dj.goto(`${BASE}/admin`);
  assert(r.status() === 403 && (await dj.textContent('[data-testid=partner-expired]')).includes('terminó'), 'acceso caducado → explicado');
  await admin.goto(`${BASE}/admin/team/partners/${DJ_ID}`);
  await admin.fill('[data-testid=partner-profile] [name=expiresAt]', '');
  await admin.click('[data-testid=partner-profile] button[type=submit]');
  await admin.waitForURL(/ok=profile/);
  r = await dj.goto(`${BASE}/admin`);
  assert(r.status() === 200, 'renovado → vuelve a entrar');

  assert(errors.length === 0, `sin errores JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
