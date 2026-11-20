/**
 * Smoke de Clientes (docs/CLIENTS.md): el comercial propone cerrar con acuerdo → el admin lo confirma → la empresa está
 * en Clientes con su acuerdo y el próximo paso «Ver cómo va»; el admin lo cambia (versión anterior en el historial).
 * Por «Apuntar con IA», «acuerdo: …» lo cierra.
 *   npm run build && npm run start:demo ; node scripts/smoke-clients.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const SOL = '00000000-0000-4000-8000-0000000ac001';

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
  assert(await rep.isVisible('[data-testid=nav-clients]'), 'menú: Clientes');
  await rep.goto(`${BASE}/admin/accounts/${SOL}`);
  // Una sola tarjeta «Cierre» (con paquetes, docs/PAQUETES.md): paquetes y precio, el formulario ya abierto y un solo
  // botón; el enlace de pago de Stripe, aparte (modal).
  assert(await rep.isVisible('[data-testid=closing]') && await rep.isVisible('[data-testid=agreement-pkgs]') && !(await rep.isVisible('[data-testid=charge]')), 'Cierre: paquetes y precio; el enlace de pago, aparte');
  assert(!(await rep.isVisible('[data-testid=agreement-open]')), 'un solo botón (el formulario ya está abierto)');
  await rep.check('[data-testid=pkg-album]');
  await rep.fill('[data-testid=agreement-terms]', '70/30 para ellos si conseguimos marcas. Nos avisan antes de cada festival.');
  assert((await rep.textContent('[data-testid=agreement-save]')).includes('Proponer'), 'el comercial propone (no cierra solo)');
  await Promise.all([rep.waitForURL(/ok=agProposed/), rep.click('[data-testid=agreement-save]')]);
  assert(await rep.isVisible('[data-testid=agreement-pending]') && !(await rep.isVisible('[data-testid=agreement-confirm]')), 'pendiente, sin botón de confirmar para él');

  const admin = await login(b, 'admin@enjoy.test');
  await admin.goto(`${BASE}/admin/notifications?ver=todo`);
  assert((await admin.locator('[data-testid=notifications] [data-kind=agreement_pending]').count()) > 0, 'aviso al admin');
  await admin.goto(`${BASE}/admin/accounts/${SOL}`);
  await Promise.all([admin.waitForURL(/ok=agConfirmed/), admin.click('[data-testid=agreement-confirm]')]);
  assert((await admin.textContent('[data-testid=agreement-active]')).includes('70/30'), 'confirmado: acuerdo vigente');
  assert((await admin.textContent('[data-testid=account-summary]')).includes('Ver cómo va'), 'próximo paso: ver cómo va (cada mes)');

  await admin.goto(`${BASE}/admin/clientes`);
  const row = admin.locator('[data-testid=client-row][data-name="Club Sol"]');
  assert(await row.isVisible() && (await row.textContent()).includes('70/30'), 'en Clientes con su acuerdo');

  // Cambiar el acuerdo: el anterior, al historial.
  await admin.goto(`${BASE}/admin/accounts/${SOL}`);
  await admin.click('[data-testid=agreement-open]');
  await admin.fill('[data-testid=agreement-terms]', '60/40 desde enero.');
  await Promise.all([admin.waitForURL(/ok=agChanged/), admin.click('[data-testid=agreement-save]')]);
  assert((await admin.textContent('[data-testid=agreement-active]')).includes('60/40') && (await admin.textContent('[data-testid=agreement-history]')).includes('70/30'), 'cambiado: el anterior en el historial');

  // Por Apuntar con IA: «acuerdo: …» cierra (admin: directo).
  await admin.goto(`${BASE}/admin/accounts/apuntar`);
  await admin.fill('[data-testid=notes-text]', 'Sala Gran Vía: hablé con el dueño, acuerdo: les ponemos pantallas gratis 1 mes y luego 99 al mes');
  await Promise.all([admin.waitForSelector('[data-testid=notes-review]'), admin.click('[data-testid=notes-run]')]);
  assert(await admin.isVisible('[data-testid=notes-agreement]'), 'Apuntar: enseña el acuerdo para revisar');
  await Promise.all([admin.waitForURL(/ok=saved/), admin.click('[data-testid=notes-save]')]);
  await admin.goto(`${BASE}/admin/clientes`);
  assert((await admin.textContent('[data-testid=clients]')).includes('99 al mes'), 'cerrada por Apuntar: en Clientes');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
