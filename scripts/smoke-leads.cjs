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

  const brand = await post(lead({ contact: { name: 'Ana Marca', email: 'ana@cervezasmoke.com', phone: '600222333' }, fields: { venue_name: 'Cervezas Smoke' },
    message: 'Somos una marca de cerveza y buscamos un acuerdo de patrocinio con vuestros locales' }));
  assert(brand.status === 201 && (await brand.json()).next?.channel === 'email', 'una marca que escribe desde «locales»: sin WhatsApp');

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

  await p.goto(`${BASE}/admin/leads`);
  const review = await p.$$eval('[data-testid=lead]', (xs) => xs.filter((x) => x.querySelector('[data-testid=lead-review]')).map((x) => x.getAttribute('data-email')));
  assert(review.includes('ana@cervezasmoke.com') && !review.includes('laura@salasmoke.es'), `la marca, marcada «lo sigues tú» (${review})`);

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
  assert((await p.textContent('[data-testid=leads-resend-status]')).includes('plataforma'), 'sin clave propia: usa la cuenta de la plataforma');
  await p.fill('[data-testid=leads-resend-key]', 'no-es-una-clave');
  await p.click('[data-testid=leads-resend-save]');
  assert((await p.textContent('main')).includes('no es válida'), 'una clave mala no se guarda');
  await p.fill('[data-testid=leads-resend-key]', 're_smokeKey12345678');
  await Promise.all([p.waitForURL(/ok=resendSaved/), p.click('[data-testid=leads-resend-save]')]);
  const st = await p.textContent('[data-testid=leads-resend-status]');
  assert(st.includes('re_…5678') && !(await p.content()).includes('re_smokeKey12345678'), 'clave propia guardada: solo se ve la pista');
  await Promise.all([p.waitForURL(/ok=resendCleared/), p.click('[data-testid=leads-resend-clear]')]);
  await Promise.all([p.waitForURL(/ok=saved/), p.click('[data-testid=leads-settings-save]')]);
  assert(true, 'ajustes guardados');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-settings.png`, fullPage: true });
  // ---- Firma del email
  await p.goto(`${BASE}/admin/leads/ajustes`);
  await p.fill('[data-testid=leads-sig-name]', 'Cristian Smoke Salido');
  await p.fill('[data-testid=leads-sig-logo]', 'https://example.com/logo.svg');
  await p.click('[data-testid=leads-sig-save]');
  await p.waitForLoadState('load');
  assert((await p.textContent('main')).includes('PNG o JPG'), 'logo SVG → aviso');
  await p.fill('[data-testid=leads-sig-logo]', 'https://example.com/logo.png');
  await Promise.all([p.waitForURL(/ok=sigSaved/), p.click('[data-testid=leads-sig-save]')]);
  assert((await p.innerHTML('[data-testid=leads-preview-html]')).includes('Cristian Smoke Salido'), 'la firma, en la vista previa del email');

  // ---- Mensajes: propuesta con IA, guardar, validar las variables de WhatsApp y volver a los de por defecto
  await p.goto(`${BASE}/admin/leads/ajustes`);
  assert((await p.textContent('[data-testid=leads-preview-neutral]')).includes('Te contesto yo personalmente'), 'vista previa del email neutro');
  await p.click('[data-testid=leads-texts-ai]');
  await p.waitForLoadState('load');
  const q = await p.inputValue('[data-testid=leads-texts-es-q-venue]');
  assert(q.includes('propuesta para') || (await p.textContent('main')).includes('no está activada'), `propuesta de la IA en el editor (${q.slice(0, 40)})`);
  await p.fill('[data-testid=leads-texts-es-q-venue]', '¿Cuántas noches abrís a la semana?');
  await Promise.all([p.waitForURL(/ok=textsSaved/), p.click('[data-testid=leads-texts-save]')]);
  assert((await p.inputValue('[data-testid=leads-texts-es-q-venue]')) === '¿Cuántas noches abrís a la semana?', 'mensajes guardados');
  await p.fill('[data-testid=leads-texts-es-wa1]', 'Hola {{1}}, sin las otras variables');
  await p.click('[data-testid=leads-texts-save]');
  await p.waitForLoadState('load');
  assert((await p.textContent('main')).includes('{{1}}, {{2}} y {{3}}'), 'WhatsApp sin sus variables → aviso');
  await Promise.all([p.waitForURL(/ok=textsReset/), p.click('[data-testid=leads-texts-reset]')]);
  assert((await p.inputValue('[data-testid=leads-texts-es-q-venue]')).startsWith('¿Qué noches abrís'), 'vuelta a los de por defecto');

  await b.close();

  // ---- Baja con un clic (el enlace del email)
  const bad2 = await fetch(`${BASE}/api/v1/leads/unsubscribe?l=${j1.id}&t=mal`);
  assert(bad2.status === 400, 'baja con firma mala → 400');
})().catch((e) => { console.error(e); process.exitCode = 1; });
