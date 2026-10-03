/**
 * Smoke de comisiones (modo DEMO, docs/COMMISSIONS.md): «todo igual» + excepción, venta declarada, confirmar,
 * calcular, aprobar, liquidar, pagar; «Mis comisiones»; API con clave (idempotente).
 *   npm run build && npm run start:demo ; node scripts/smoke-commissions.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const euros = (s) => Number(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));

(async () => {
  const b = await chromium.launch();
  const login = async (email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const admin = await login('admin@enjoy.test');
  const rep = await login('rep@enjoy.test');
  const repBefore = await (async () => { await rep.goto(`${BASE}/admin/commissions`); return euros(await rep.textContent('[data-testid="total-Pagado"]')); })();

  // ---- plan: todo igual 30 % + excepción
  await admin.goto(`${BASE}/admin/commissions/team?tab=plan`);
  await admin.fill('[data-testid=flat] [name=pct]', '30');
  await admin.click('[data-testid=flat] button[type=submit]');
  await admin.waitForLoadState();
  await admin.click('[data-testid=add-rule]');
  await admin.fill('[data-testid=rule-form] [name=label]', `Paquete grande ${RUN}`);
  await admin.fill('[data-testid=rule-form] [name=pct]', '10');
  await admin.fill('[data-testid=rule-form] [name=offers]', 'pack-3000');
  await admin.click('[data-testid=rule-form] button[type=submit]');
  await admin.waitForLoadState();
  const rules = await admin.$$eval('[data-testid=rule]', (els) => els.map((e) => e.dataset.label));
  assert(rules[0] === `Paquete grande ${RUN}` && rules.at(-1).startsWith('Todo igual: 30'), 'excepción encima de la regla general');
  if (OUT) await admin.screenshot({ path: `${OUT}/commissions-plan.png`, fullPage: true });

  // ---- el comercial gana y declara la venta
  await rep.goto(`${BASE}/admin`);
  await rep.fill('[data-testid=create-form] [name=title]', `Boda ${RUN}`);
  await rep.click('[data-testid=create-form] button[type=submit]');
  await rep.waitForURL(/\/admin\/dossiers\//);
  const dossierUrl = rep.url();
  await rep.selectOption('[data-testid=outcome]', 'won');
  await rep.waitForURL(/debrief/);
  await rep.goto(dossierUrl);
  await rep.fill('[data-testid=declare-sale] [name=amount]', '1.000');
  await rep.fill('[data-testid=declare-sale] [name=offer]', 'pack-1000');
  await rep.click('[data-testid=declare-sale] button[type=submit]');
  await rep.waitForLoadState();
  assert((await rep.textContent('[data-testid=declared]')).includes('Pendiente de confirmar'), 'venta declarada, pendiente de confirmar');

  // ---- admin: confirmar, calcular, aprobar, liquidar, pagar
  await admin.goto(`${BASE}/admin/commissions/team?tab=ingresos`);
  const pend = admin.locator('[data-testid=pending-event]', { hasText: '1000,00' }).last();
  await pend.locator('[data-testid=confirm-event]').click();
  await admin.waitForLoadState();
  await admin.click('[data-testid=process]');
  await admin.waitForLoadState();
  assert((await admin.textContent('[role=status]')).includes('Calculado: 1 línea nueva'), 'calcular crea la comisión');
  await admin.click('[data-testid=process]');
  await admin.waitForLoadState();
  assert((await admin.textContent('[role=status]')).includes('Calculado: 0 líneas'), 'calcular otra vez no duplica');
  await admin.goto(`${BASE}/admin/commissions/team?tab=resumen`);
  await admin.click('[data-testid=approve-period]');
  await admin.waitForLoadState();
  await admin.click('[data-testid=settle]');
  await admin.waitForLoadState();
  await admin.goto(`${BASE}/admin/commissions/team?tab=liquidaciones`);
  const payout = admin.locator('[data-testid=payout][data-status=open]', { hasText: 'Comercial Enjoy' });
  assert((await payout.textContent()).includes('300,00'), 'liquidación de 300 € (30 % de 1.000 €)');
  await payout.locator('[data-testid=mark-paid]').click();
  await admin.locator('dialog[open] button[type=submit]').click();
  await admin.waitForLoadState();
  assert(await admin.isVisible('[data-testid=payout][data-status=paid]'), 'liquidación pagada');
  if (OUT) await admin.screenshot({ path: `${OUT}/commissions-payouts.png`, fullPage: true });

  // ---- mis comisiones
  await rep.goto(`${BASE}/admin/commissions`);
  assert(euros(await rep.textContent('[data-testid="total-Pagado"]')) - repBefore === 300, 'el comercial ve 300 € pagados');
  assert((await rep.textContent('[data-testid=entries]')).includes('sobre 1000,00'), 'cada línea explica de dónde sale');
  if (OUT) await rep.screenshot({ path: `${OUT}/commissions-mine.png`, fullPage: true });

  // ---- API con clave
  await admin.goto(`${BASE}/admin/commissions/team?tab=api`);
  await admin.fill('[data-testid=api-keys] [name=name]', `Pasarela ${RUN}`);
  await admin.click('[data-testid=create-key]');
  await admin.waitForSelector('[data-testid=new-key] code');
  const key = (await admin.textContent('[data-testid=new-key] code')).trim();
  const body = { source: 'pasarela', events: [{ external_id: `inv-${RUN}`, kind: 'sale', occurred_at: new Date().toISOString(), amount: '200', seller_email: 'rep@enjoy.test' }] };
  const post = (k) => admin.request.post(`${BASE}/api/v1/events`, { headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, data: body });
  const r1 = await post(key);
  assert(r1.status() === 200 && (await r1.json()).created === 1, 'API: evento creado con la clave');
  const r2 = await post(key);
  assert((await r2.json()).duplicates === 1, 'API: reenviar no duplica');
  assert((await post('ss_live_clavefalsa000000000000000')).status() === 401, 'API: clave falsa → 401');
  const bad = await admin.request.post(`${BASE}/api/v1/events`, { headers: { authorization: `Bearer ${key}` }, data: { source: 'pasarela', events: [{ ...body.events[0], amount: '999' }] } });
  assert(bad.status() === 422 && (await bad.json()).conflicts.length === 1, 'API: mismo id con otro importe se rechaza');

  // ---- cupones: el admin crea uno, se aplica en la propuesta y el cliente lo ve
  await admin.goto(`${BASE}/admin/commissions/team?tab=cupones`);
  await admin.fill('[data-testid=coupon-form] [name=label]', `10 % por pago anual ${RUN}`);
  await admin.fill('[data-testid=coupon-form] [name=code]', `ANUAL${RUN}`.toUpperCase().slice(0, 30));
  await admin.fill('[data-testid=coupon-form] [name=value]', '10');
  await admin.click('[data-testid=coupon-form] button[type=submit]');
  await admin.waitForLoadState();
  assert(await admin.isVisible(`[data-testid=coupon][data-code="${`ANUAL${RUN}`.toUpperCase().slice(0, 30)}"]`), 'cupón creado');
  await admin.goto(`${BASE}/admin/dossiers/00000000-0000-4000-8000-000000d05501`);
  await admin.click('[role=tab]:visible >> text=Editar').catch(() => {});
  const before = euros(await admin.textContent('[data-testid=total]'));
  await admin.selectOption('[data-testid=coupon]', { label: `10 % por pago anual ${RUN} (${`ANUAL${RUN}`.toUpperCase().slice(0, 30)})` });
  await admin.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await admin.waitForTimeout(300);
  const after = euros(await admin.textContent('[data-testid=total]'));
  assert(Math.abs(after - before * 0.9) < 0.01, `el total baja un 10 % (${before} → ${after})`);
  const pub = await b.newPage();
  await pub.goto(`${BASE}/d/demo-sala-x-7Qm2`);
  assert((await pub.textContent('[data-testid=pricing-discount]').catch(() => '')).includes('10 % por pago anual'), 'el cliente ve el cupón aplicado');
  assert(await pub.isVisible('[data-testid=pricing-before]'), 'y el precio anterior tachado');
  if (OUT) await pub.screenshot({ path: `${OUT}/coupon-public.png`, fullPage: true });
  await admin.selectOption('[data-testid=coupon]', '');
  await b.close();
})();
