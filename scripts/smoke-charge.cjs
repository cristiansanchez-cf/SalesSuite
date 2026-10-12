/**
 * Smoke de «Generar pago» (docs/CRM_DINAMICO.md §35): tamaño → tarifa de su tamaño → cupón → enlace (con la referencia
 * del enlace y el cupón) → «Cierre» en el tablero; anular; el precio a medida solo lo ve el admin.
 * Pagado = Cerrada (§36): Stripe avisa del pago → celebración, «Cerrada» y aviso al admin; a mano sin enlace.
 *   npm run build && npm run start:demo ; node scripts/smoke-charge.cjs
 */
const { createHmac } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const NAME = 'Bar Cobro Smoke';

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${who}@enjoy.test"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const rep = await login('rep');
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  await rep.click('[data-testid=add-open]'); await rep.click('[data-testid=new-account]');
  await rep.fill('[data-testid=new-account-form] [name=name]', NAME);
  await Promise.all([rep.waitForURL(/ok=created/), rep.click('[data-testid=new-account-form] button[type=submit]')]);
  const page = rep.url().split('?')[0];

  // ---- tamaño (no se sabía) → la tarifa de su tamaño
  assert(await rep.isVisible('[data-testid=charge-size]'), 'sin tamaño: lo pregunta');
  assert(!(await rep.isVisible('[data-testid=charge-custom]')), 'el comercial no ve el precio a medida');
  await Promise.all([rep.waitForURL(/ok=qualified/), rep.click('[data-testid=charge-size-small]')]);
  assert(!(await rep.isVisible('[data-testid=charge-size]')), 'tamaño guardado: ya no lo pregunta');
  const chosen = await rep.$eval('[data-testid=charge-tariff]', (s) => s.options[s.selectedIndex].textContent);
  assert(chosen.includes('Local pequeño') && chosen.includes('la de su tamaño'), `la de su tamaño, marcada (${chosen})`);
  assert(await rep.$eval('[data-testid=charge-tariff]', (s) => [...s.options].some((o) => o.textContent.includes('Local grande'))), 'se puede elegir una superior');

  // ---- cupón y enlace
  await rep.selectOption('[data-testid=charge-coupon]', { label: 'LANZA30 · 30 % de lanzamiento' });
  await Promise.all([rep.waitForURL(/ok=charge/), rep.click('[data-testid=charge-generate]')]);
  const item = rep.locator('[data-testid=charge-item]').first();
  assert((await item.getAttribute('data-status')) === 'sent' && (await item.textContent()).includes('Enviado'), 'enlace generado: «Enviado»');
  assert((await item.textContent()).includes('69,30'), `con el cupón: paga 69,30 € (${(await item.textContent()).replace(/\s+/g, ' ').trim()})`);
  const url = await item.locator('[data-charge-url]').inputValue();
  const u = new URL(url);
  assert(u.href.startsWith('https://buy.stripe.com/test_pequeno') && /^pay_[0-9a-f-]{36}$/.test(u.searchParams.get('client_reference_id') ?? '') && u.searchParams.get('prefilled_promo_code') === 'LANZA30',
    `el enlace: la tarifa, este cobro y el cupón (${url})`);
  await item.locator('[data-testid=charge-copy]').click();
  assert((await rep.evaluate(() => navigator.clipboard.readText())) === url, 'copiar enlace');
  assert(((await item.locator('[data-testid=charge-whatsapp]').getAttribute('href')) ?? '').includes(encodeURIComponent(url)), 'mandar por WhatsApp con el enlace');
  if (OUT) await rep.screenshot({ path: `${OUT}/charge.png`, fullPage: true });

  // ---- el tablero: a «Cierre»
  await rep.goto(`${BASE}/admin/accounts/tablero`);
  assert((await rep.getAttribute(`[data-testid=board-card][data-name="${NAME}"]`, 'data-stage')) === 'closing', 'tablero: «Cierre»');

  // ---- anular
  await rep.goto(page);
  await Promise.all([rep.waitForURL(/ok=chargeCancelled/), rep.locator('[data-testid=charge-item] [data-testid=charge-cancel]').first().click()]);
  assert(!(await rep.isVisible('[data-testid=charge-item]')), 'anulado: ya no sale');
  await rep.goto(`${BASE}/admin/accounts/tablero`);
  assert((await rep.getAttribute(`[data-testid=board-card][data-name="${NAME}"]`, 'data-stage')) !== 'closing', 'tablero: sale de «Cierre»');

  // ---- admin: precio a medida (con su enlace de Stripe)
  const adm = await login('admin');
  await adm.goto(page);
  if (!(await adm.$eval('[data-testid=charge-wizard]', (d) => d.open))) await adm.click('[data-testid=charge-open]');
  await adm.click('[data-testid=charge-custom] summary');
  await adm.fill('[data-testid=charge-form] [name=customLabel]', 'Especial apertura');
  await adm.fill('[data-testid=charge-form] [name=customAmount]', '180');
  await adm.fill('[data-testid=charge-custom-link]', 'https://buy.stripe.com/test_especial');
  await Promise.all([adm.waitForURL(/ok=charge/), adm.click('[data-testid=charge-generate]')]);
  const custom = await adm.textContent('[data-testid=charge-item]');
  assert(custom.includes('Especial apertura') && custom.includes('180'), 'admin: precio a medida');
  // Se deja anulado (los smokes comparten servidor).
  await Promise.all([adm.waitForURL(/ok=chargeCancelled/), adm.locator('[data-testid=charge-item] [data-testid=charge-cancel]').first().click()]);

  // ---- pagado = Cerrada: Stripe avisa del pago del enlace (webhook firmado con el secreto del espacio)
  const SECRET = 'whsec_SmokeTestSecret123';
  await adm.goto(`${BASE}/admin/prices`);
  if ((await adm.getAttribute('[data-testid=stripe-webhook]', 'data-connected')) !== '1') {
    await adm.fill('[data-testid=stripe-webhook] [name=secret]', SECRET);
    await Promise.all([adm.waitForURL(/ok=stripe/), adm.click('[data-testid=stripe-save]')]);
  }
  const hook = await adm.evaluate(() => fetch('/admin/prices').then(() => location.origin));
  await rep.goto(page);
  await Promise.all([rep.waitForURL(/ok=charge/), rep.click('[data-testid=charge-generate]')]);
  const payRef = new URL(await rep.locator('[data-testid=charge-item] [data-charge-url]').first().inputValue()).searchParams.get('client_reference_id');
  const ev = JSON.stringify({ id: 'evt_smoke', type: 'checkout.session.completed', data: { object: { id: 'cs_smoke_charge', client_reference_id: payRef, mode: 'payment',
    payment_status: 'paid', payment_intent: 'pi_smoke_charge', amount_total: 9900, currency: 'eur', created: Math.floor(Date.now() / 1000) } } });
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${hook}/api/v1/stripe/00000000-0000-4000-8000-000000000e01`, { method: 'POST', body: ev,
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${createHmac('sha256', SECRET).update(`${ts}.${ev}`).digest('hex')}` } });
  const body = await res.json();
  assert(res.status === 200 && body.charge === 'paid', `Stripe: pagado (${res.status} ${JSON.stringify(body)})`);

  await rep.goto(`${BASE}/admin/inicio`);
  await rep.waitForSelector('[data-testid=celebrate]:not([hidden])');
  assert((await rep.textContent('[data-testid=celebrate]')).includes(`${NAME} ha pagado`), 'celebración: «… ha pagado»');
  if (OUT) await rep.screenshot({ path: `${OUT}/charge-celebrate.png` });
  await rep.click('[data-testid=celebrate-close]');
  await rep.reload();
  assert(await rep.$eval('[data-testid=celebrate]', (e) => e.hidden).catch(() => true), 'una sola vez');
  await rep.goto(page);
  assert(await rep.isVisible('[data-testid=charge-won]') && (await rep.textContent('[data-testid=charge-list]')).includes('Pagado'), 'la ficha: pagado, ya es cliente');
  await rep.goto(`${BASE}/admin/accounts/tablero`);
  assert((await rep.getAttribute(`[data-testid=board-card][data-name="${NAME}"]`, 'data-stage')) === 'won', 'tablero: «Cerrada»');
  await adm.goto(`${BASE}/admin/notifications`);
  assert((await adm.textContent('main')).includes(`${NAME} ha pagado`), 'aviso al admin');
  assert(await adm.isVisible('[data-testid=celebrate]'), 'el admin también lo celebra');
  await adm.click('[data-testid=celebrate-close]');

  // ---- sin Stripe: el admin la da por ganada a mano
  await rep.goto(`${BASE}/admin/accounts?ver=all`);
  await rep.click('[data-testid=add-open]'); await rep.click('[data-testid=new-account]');
  await rep.fill('[data-testid=new-account-form] [name=name]', 'Bar Transferencia Smoke');
  await Promise.all([rep.waitForURL(/ok=created/), rep.click('[data-testid=new-account-form] button[type=submit]')]);
  assert(!(await rep.isVisible('[data-testid=charge-mark-won]')), 'el comercial no la da por ganada');
  await adm.goto(rep.url().split('?')[0]);
  await Promise.all([adm.waitForURL(/ok=paid/), adm.click('[data-testid=charge-mark-won]')]);
  assert(await adm.isVisible('[data-testid=charge-won]'), 'a mano: ganada');

  // Se dejan los avisos leídos: la celebración no debe tapar la pantalla en los smokes siguientes (comparten servidor).
  for (const p of [adm, rep]) {
    await p.goto(`${BASE}/admin/notifications`);
    if (await p.isVisible('[data-testid=celebrate]')) await p.click('[data-testid=celebrate-close]');
    await Promise.all([p.waitForLoadState('load'), p.click('main form:has(input[name=action][value=read-all]) button[type=submit]')]);
  }
  await rep.goto(`${BASE}/admin/inicio`);
  assert(!(await rep.isVisible('[data-testid=celebrate]')), 'leído: ya no se celebra');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
