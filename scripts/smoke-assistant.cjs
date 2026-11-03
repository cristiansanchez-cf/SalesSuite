/**
 * Smoke del asistente de WhatsApp (docs/ASSISTANT.md), en demo: el admin pone el número de WhatsApp del espacio, el
 * comercial su teléfono en Mi cuenta; «Meta» entrega su mensaje (sin firma: solo en demo) → el asistente contesta con el
 * resumen → «Guardar» → la interacción sale en la ficha de Club Sol. Un desconocido no recibe nada.
 *   npm run build && npm run start:demo ; node scripts/smoke-assistant.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const PHONE_ID = '555000111222';
const run = Date.now();
const deliver = (from, message) => fetch(`${BASE}/api/v1/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, messages: [{ from, timestamp: String(Math.floor(Date.now() / 1000)), ...message }] } }] }] }) }).then((r) => r.json());

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  // El admin: el número de WhatsApp del espacio.
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/leads/ajustes#whatsapp`);
  await p.fill('input[name=waPhone]', PHONE_ID);
  await Promise.all([p.waitForURL(/ok=saved/), p.click('#whatsapp button[name=at]')]);
  // El comercial: su teléfono (sin prefijo, como lo pone mucha gente).
  await ctx.clearCookies();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/account`);
  await p.fill('[data-testid=phone]', '699 00 01 11');
  await p.click('form.co-card button[type=submit]');
  await p.waitForSelector('[data-testid=alert-success]');

  const r1 = await deliver('34699000111', { id: `a1-${run}`, type: 'text', text: { body: `Club Sol: hablé con Marta, quieren pantalla los viernes ${run}` } });
  assert(r1.ok && r1.assistant === 1 && r1.matched === 0, `va al asistente, no a los leads (${JSON.stringify(r1)})`);
  const stranger = await deliver('34600999888', { id: `x1-${run}`, type: 'text', text: { body: 'Hola' } });
  assert(stranger.assistant === 0, 'un desconocido no va al asistente');
  const r2 = await deliver('34699000111', { id: `a2-${run}`, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'save', title: 'Guardar' } } });
  assert(r2.assistant === 1, 'Guardar');
  await p.goto(`${BASE}/admin/accounts/00000000-0000-4000-8000-0000000ac001`);
  assert((await p.textContent('main')).includes(`quieren pantalla los viernes ${run}`), 'la interacción está en la ficha de Club Sol');
  await b.close();
})();
