/**
 * Smoke de «Correos al CRM» (docs/CRM_DINAMICO.md §47), en demo: CRM → Correos → la dirección propia; llega un correo
 * (webhook de Resend simulado, sin firma solo en demo) de alguien que no está en el CRM → «Sin empresa» → elegir la
 * empresa → apuntado; otro → «No apuntar».
 *   npm run build && npm run start:demo ; node scripts/smoke-inbox.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts`);
  await Promise.all([p.waitForURL(/\/admin\/accounts\/correos/), p.click('[data-testid=tab-emails]')]);
  const address = (await p.textContent('[data-testid=inbox-address-value]')).trim();
  assert(/^apuntar-[a-z0-9]{24}@/.test(address), `dirección propia (${address})`);

  const run = Date.now();
  const send = (id, subject, text) => p.request.post(`${BASE}/api/v1/email/inbound`, { data: {
    type: 'email.received', created_at: new Date().toISOString(),
    data: { email_id: id, created_at: new Date().toISOString(), from: 'admin@enjoy.test', to: [address], message_id: `<${id}@smoke>`, subject },
    demo_email: { from: 'admin@enjoy.test', to: [address], cc: [], subject, date: new Date().toISOString(), messageId: `<${id}@smoke>`, text },
  } });
  const r1 = await send(`s1-${run}`, `RV: Presupuesto ${run}`, `________________________________\nDe: Pepa <pepa-${run}@desconocida-smoke.es>\nEnviado: lunes\nAsunto: Presupuesto\n\n¿Me mandáis el precio para 300 personas?`);
  assert(r1.ok() && (await r1.json()).status === 'unmatched', 'correo de alguien que no está en el CRM → sin empresa');
  const r2 = await send(`s2-${run}`, `RV: Otro ${run}`, `________________________________\nDe: Spam <spam-${run}@spam-smoke.es>\nEnviado: lunes\nAsunto: Otro\n\nOferta.`);
  assert(r2.ok(), 'segundo correo');
  const again = await send(`s1-${run}`, `RV: Presupuesto ${run}`, 'x');
  assert((await again.json()).status === 'duplicate', 'el mismo correo dos veces no se repite');

  await p.reload();
  const item = p.locator('[data-testid=inbox-item]', { hasText: `Presupuesto` }).first();
  assert((await item.getAttribute('data-status')) === 'unmatched', 'sale «Sin empresa»');
  assert((await item.textContent()).includes('300 personas'), 'con lo que decía');
  // Elegir empresa: la primera que salga al buscar.
  await item.locator('[data-testid=inbox-pick]').fill('sa');
  await item.locator('[data-testid=inbox-pick-option]').first().click();
  await Promise.all([p.waitForURL(/ok=assigned/), item.locator('[data-testid=inbox-assign]').click()]);
  const done = p.locator('[data-testid=inbox-item]', { hasText: 'Presupuesto' }).first();
  assert((await done.getAttribute('data-status')) === 'logged' && await done.locator('[data-testid=inbox-account]').isVisible(), 'apuntado en la empresa elegida');
  const accHref = await done.locator('[data-testid=inbox-account]').getAttribute('href');
  const other = p.locator('[data-testid=inbox-item]', { hasText: 'Otro' }).first();
  await Promise.all([p.waitForURL(/ok=ignored/), other.locator('[data-testid=inbox-ignore]').click()]);
  assert((await p.locator('[data-testid=inbox-item]', { hasText: 'Otro' }).first().getAttribute('data-status')) === 'ignored', '«No apuntar»');
  // En la ficha de la empresa: la interacción por email.
  await p.goto(`${BASE}${accHref}`);
  assert((await p.textContent('main')).includes('300 personas'), 'la interacción está en la ficha');
  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
