/**
 * Smoke de los leads de la web (docs/LEADS.md): CORS (preflight), entrada v2 y v1, repetido, cuarentena, prueba desde
 * localhost, la cola (cron) con su email de respuesta y el aviso, la bandeja, la ficha, validar al CRM y los ajustes.
 *   npm run build && npm run start:demo ; node scripts/smoke-leads.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const WEB = 'https://enjoytheclub.es';
const lead = (over = {}) => ({
  schema: 'enjoy.lead.v2', idempotency_key: `smoke-${Date.now()}-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name: 'Laura Smoke', email: 'laura@salasmoke.es', phone: '600 123 123' },
  fields: { venue_name: 'Sala Smoke', city: 'Valencia', how_heard: 'google' }, message: 'Abrimos de jueves a sábado.',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: `${WEB}/es/politica-de-privacidad/`, submitted_at: new Date().toISOString() },
  context: { locale: 'es', form_version: '2026-11-01', page_url: `${WEB}/es/soluciones/locales/`, page_path: '/es/soluciones/locales/', cta: { id: 'hero-primary', label: 'Hablemos de tu local', location: 'hero' },
    cookie_consent: { analytics: true, ads: true }, attribution: { current: { utm_source: 'google', utm_medium: 'cpc', gclid: 'smoke-gclid' } }, time_to_submit_ms: 30000 },
  ...over,
});
const post = (body, origin = WEB) => fetch(`${BASE}/api/v1/leads`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });

(async () => {
  // ---- CORS
  const pre = await fetch(`${BASE}/api/v1/leads`, { method: 'OPTIONS', headers: { origin: WEB, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert(pre.status === 204 && pre.headers.get('access-control-allow-origin') === WEB && pre.headers.get('access-control-max-age') === '86400' && /Origin/.test(pre.headers.get('vary') ?? ''), 'preflight de la web: 204 con sus cabeceras');
  const evil = await fetch(`${BASE}/api/v1/leads`, { method: 'OPTIONS', headers: { origin: 'https://cualquiera.web.app' } });
  assert(evil.status === 403 && !evil.headers.get('access-control-allow-origin'), 'otro *.web.app no pasa');
  assert((await post(lead(), 'https://otro.es')).status === 403, 'POST desde un origen no permitido → 403');

  // ---- Entrada
  const body = lead();
  const r1 = await post(body);
  const j1 = await r1.json();
  assert(r1.status === 201 && j1.id && j1.next?.channel === 'email' && j1.next?.eta === 'minutes', `201 con next (${JSON.stringify(j1.next)})`);
  assert(r1.headers.get('access-control-allow-origin') === WEB, 'la respuesta lleva el CORS');
  const r2 = await post(body);
  const j2 = await r2.json();
  assert(r2.status === 200 && j2.duplicate === true && j2.id === j1.id, 'misma clave → misma respuesta');
  const bad = await post({ ...lead(), contact: { name: 'X', email: 'no-email' } });
  assert(bad.status === 400 && (await bad.json()).errors?.['contact.email'] === 'invalid', '400 con errores por campo');
  const v1 = await post({ schema: 'enjoy.lead.v1', idempotency_key: `v1-${Date.now()}`, brand: 'enjoy', type: 'wedding', contact: { name: 'Novios V1', email: 'novios@gmail.com' },
    fields: { wedding_date: '2027-06-14', guests: '150' }, consent: { privacy: true, policy_url: 'x', accepted_at: new Date().toISOString() }, context: { locale: 'es', cta: 'Pedir info', time_to_submit_ms: 20000 } });
  assert(v1.status === 201, 'el contrato v1 se sigue aceptando');
  const spam = await post(lead({ contact: { name: 'Bot', email: 'bot@yopmail.com' }, context: { ...lead().context, time_to_submit_ms: 300 } }));
  assert(spam.status === 201, 'lo sospechoso también responde 201 (no se le da pistas)');
  const local = await post(lead({ contact: { name: 'Prueba Local', email: 'local@salasmoke.es' } }), 'http://localhost:4321');
  assert(local.status === 201, 'desde localhost se acepta (como prueba)');

  // ---- Cola: el cron manda lo que toca
  const cron = await (await fetch(`${BASE}/api/cron/leads`)).json();
  assert(cron.ok && cron.failed === 0, `cron de leads (${JSON.stringify(cron)})`);

  // ---- Consola
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/people`);
  assert(await p.isVisible('[data-testid=tab-leads]'), 'pestaña «Leads web» en el CRM');
  await Promise.all([p.waitForURL(/\/admin\/leads/), p.click('[data-testid=tab-leads]')]);
  const inbox = await p.$$eval('[data-testid=lead]', (xs) => xs.map((x) => x.getAttribute('data-email')));
  assert(inbox.includes('laura@salasmoke.es') && inbox.includes('novios@gmail.com'), 'por validar: los dos leads');
  assert(!inbox.includes('bot@yopmail.com') && !inbox.includes('local@salasmoke.es'), 'ni el sospechoso ni la prueba');
  await p.click('[data-testid=leads-view-quarantine]');
  assert((await p.$$eval('[data-testid=lead]', (xs) => xs.map((x) => x.getAttribute('data-email')))).includes('bot@yopmail.com'), 'el sospechoso, en cuarentena');
  await p.click('[data-testid=leads-view-test]');
  assert((await p.$$eval('[data-testid=lead]', (xs) => xs.map((x) => x.getAttribute('data-email')))).includes('local@salasmoke.es'), 'lo de localhost, en pruebas');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-list.png`, fullPage: true });

  // ---- Ficha
  await p.goto(`${BASE}/admin/leads/${j1.id}`);
  const steps = await p.$$eval('[data-testid=lead-message]', (xs) => xs.map((x) => `${x.getAttribute('data-step')}:${x.getAttribute('data-status')}`));
  assert(steps.includes('autoreply:sent') && steps.includes('notify:sent'), `envíos: ${steps.join(', ')}`);
  assert((await p.textContent('[data-testid=lead-origin]')).includes('smoke-gclid'), 'origen con el gclid');
  assert((await p.textContent('[data-testid=lead-legal]')).includes('Anuncios: Sí'), 'prueba legal: consentimiento de anuncios');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-detail.png`, fullPage: true });
  await Promise.all([p.waitForURL(/ok=contacted/), p.click('[data-testid=lead-contacted]')]);
  assert((await p.textContent('[data-testid=lead-stage-box]')).includes('min laborables'), 'primer contacto humano, en minutos laborables');
  await Promise.all([p.waitForURL(/ok=validated/), p.click('[data-testid=lead-validate]')]);
  await Promise.all([p.waitForURL(/\/admin\/people\//), p.click('[data-testid=lead-open-contact]')]);
  assert((await p.textContent('main')).includes('Laura Smoke'), 'validado: la persona está en el CRM');
  await p.goto(`${BASE}/admin/leads`);
  assert(!(await p.$$eval('[data-testid=lead]', (xs) => xs.map((x) => x.getAttribute('data-email')))).includes('laura@salasmoke.es'), 'sale de «por validar»');

  // ---- Descartar exige motivo
  const novios = (await (await post({ ...lead(), idempotency_key: `n-${Date.now()}`, type: 'wedding', contact: { name: 'Novios V1', email: 'novios@gmail.com' }, fields: { wedding_date: '2027-06-14' } })).json()).id;
  await p.goto(`${BASE}/admin/leads/${novios}`);
  await p.selectOption('[data-testid=lead-stage-select]', 'discarded');
  await p.click('[data-testid=lead-stage-save]');
  assert((await p.textContent('main')).includes('Indica el motivo'), 'descartar sin motivo → aviso');

  // ---- Ajustes
  await p.goto(`${BASE}/admin/leads/ajustes`);
  assert((await p.textContent('[data-testid=leads-endpoint]')).endsWith('/api/v1/leads'), 'la dirección para la web');
  assert((await p.textContent('[data-testid=leads-preview]')).includes('Hola {{1}}') === false, 'vista previa con el lead de ejemplo');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=leads-settings-save]')]);
  assert(true, 'ajustes guardados');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-settings.png`, fullPage: true });
  await b.close();

  // ---- Baja con un clic (el enlace del email)
  const bad2 = await fetch(`${BASE}/api/v1/leads/unsubscribe?l=${j1.id}&t=mal`);
  assert(bad2.status === 400, 'baja con firma mala → 400');
})().catch((e) => { console.error(e); process.exitCode = 1; });
