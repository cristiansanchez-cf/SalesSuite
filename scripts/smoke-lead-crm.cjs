/**
 * Smoke de «el lead vive en el CRM» (docs/LEADS.md §El lead en el CRM), en demo: aceptar pregunta la empresa y entra
 * con ella; la persona y la empresa enseñan «Viene de la web»; «Pasar a … con IA» abre Apuntar con la conversación; un
 * lead validado sin empresa pasa a la que le añades en su ficha.
 *   npm run build && npm run start:demo ; node scripts/smoke-lead-crm.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const WEB = 'https://enjoytheclub.es';
const lead = (name, email, phone = '600 555 101') => ({
  schema: 'enjoy.lead.v2', idempotency_key: `crm-${RUN}-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name, email, phone }, fields: { city: 'Cuenca' }, message: 'solicitud de musica por parte de los clientes',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: `${WEB}/es/politica-de-privacidad/`, submitted_at: new Date().toISOString() },
  context: { locale: 'es', form_version: '2026-11-01', page_url: `${WEB}/es/soluciones/locales/`, page_path: '/es/soluciones/locales/', time_to_submit_ms: 30000, cta: { id: 'venue', label: 'Hablemos de tu local' } },
});
const post = async (body) => (await fetch(`${BASE}/api/v1/leads`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify(body) })).json();

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  const accept = async (id, company) => {
    await p.goto(`${BASE}/admin/leads/${id}`);
    await p.click('[data-testid=lead-accept]');
    assert((await p.inputValue(`[data-testid=accept-${id}-company]`)) === '', 'aceptar: no dijo su local, así que pregunta «¿De qué empresa o local es?»');
    if (company) await p.fill(`[data-testid=accept-${id}-company]`, company);
    if (await p.isVisible(`[data-testid=accept-${id}-wa]`)) await p.uncheck(`[data-testid=accept-${id}-wa]`);
    await Promise.all([p.waitForURL(/ok=validated/), p.click(`[data-testid=accept-${id}-confirm]`)]);
    await Promise.all([p.waitForURL(/\/admin\/people\//), p.click('[data-testid=lead-open-contact]')]);
  };

  // 1) Aceptar con su local: la persona está en él y las dos fichas enseñan de dónde viene.
  const venue = `La Botellita ${RUN}`;
  const one = await post(lead('Ignacio Smoke', `ignacio-${RUN}@example.com`));
  await accept(one.id, venue);
  assert((await p.textContent('[data-testid=person-companies]')).includes(venue), 'persona: está en el local que dijiste al aceptar');
  const card = '[data-testid=lead-origin]';
  assert((await p.textContent(card)).includes('solicitud de musica'), 'persona: «Viene de la web» con lo que pidió');
  assert((await p.textContent(`${card} [data-testid=lead-origin-ai]`)).includes(venue), 'persona: «Pasar a La Botellita con IA»');
  if (OUT) await p.screenshot({ path: `${OUT}/lead-crm-person.png`, fullPage: true });
  await p.click(`[data-testid=person-companies] [data-name="${venue}"] a`);
  await p.waitForURL(/\/admin\/accounts\//);
  assert((await p.textContent(card)).includes('Hablemos de tu local'), 'empresa: también «Viene de la web»');
  assert((await p.textContent('[data-testid=follow]')).includes('Llegó por la web'), 'empresa: su historial empieza con cómo llegó');
  assert((await p.getAttribute('[data-testid=account-state]', 'data-state')) !== 'free', 'empresa: es de quien la validó (no queda libre)');
  if (OUT) await p.screenshot({ path: `${OUT}/lead-crm-company.png`, fullPage: true });
  await p.click(`${card} [data-testid=lead-origin-ai]`);
  await p.waitForURL(/\/admin\/accounts\/apuntar\?lead=/);
  const text = await p.inputValue('[data-testid=notes-text]');
  assert(/Ignacio Smoke llegó por la web/.test(text) && /\] Ignacio Smoke: solicitud de musica/.test(text), 'Apuntar: con lo que pidió y la conversación ya escritas');
  assert((await p.textContent('[data-testid=notes-who-chosen]')).includes(venue), 'Apuntar: con su empresa ya elegida');

  // 1b) Te manda un audio por WhatsApp: queda escrito (🎤) en su ficha y en la de su empresa.
  const submit = async (testid, values) => {
    await p.goto(`${BASE}/admin/leads/configurar?abrir=whatsapp`);
    await Promise.all([p.waitForURL(/ok=/), p.evaluate(([id, v]) => {
      const f = document.querySelector(`[data-testid=${id}]`);
      for (const [k, val] of Object.entries(v)) {
        const els = f.querySelectorAll(`[name="${k}"]`);
        if (!els.length) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(val); f.append(i); continue; }
        els.forEach((el) => { el.value = String(val); });
      }
      f.requestSubmit();
    }, [testid, values])]);
  };
  await submit('whatsapp-connect', { phoneId: '1493985227120621' });
  const hook = await fetch(`${BASE}/api/v1/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '1493985227120621' },
    messages: [{ from: '34600555101', id: `wamid.${RUN}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'audio', audio: { id: `media-${RUN}`, mime_type: 'audio/ogg' } }],
  } }] }] }) }).then((r) => r.json());
  assert(hook.audio === 1, 'webhook: el audio se transcribe aparte (en segundo plano, sin hacer esperar a Meta)');
  await p.goto(`${BASE}/admin/leads/${one.id}`);
  assert((await p.textContent('[data-testid=lead-history]')).includes('🎤 «Hola, sí, me interesa para el local'), 'lead: el audio, escrito (🎤)');
  await p.click('[data-testid=lead-open-contact]');
  await p.waitForURL(/\/admin\/people\//);
  assert((await p.textContent(card)).includes('🎤 Hola, sí, me interesa'), 'persona: la conversación con lo que dijo en el audio');

  // 2) Aceptar sin saber el local: se avisa en su ficha y, al añadírselo, el lead pasa a él.
  const two = await post(lead('Marta Smoke', `marta-${RUN}@example.com`, '600 555 102'));
  await accept(two.id, '');
  assert(await p.isVisible('[data-testid=person-no-company]'), 'persona sin empresa: aviso de que le falta (y su historial irá con ella)');
  assert(await p.isVisible(card), 'persona sin empresa: «Viene de la web» igual');
  const other = `Sala Marta ${RUN}`;
  await p.fill('[data-testid=person-link] [name=company]', other);
  await Promise.all([p.waitForURL(/ok=attached/), p.click('[data-testid=person-link] button[type=submit]')]);
  assert((await p.textContent('main')).includes(`Añadida a ${other}`), 'al añadirla: «lo que habéis hablado está en su ficha»');
  await p.click(`[data-testid=person-companies] [data-name="${other}"] a`);
  await p.waitForURL(/\/admin\/accounts\//);
  assert(await p.isVisible(card), 'su nueva empresa enseña «Viene de la web»');
  assert((await p.textContent('[data-testid=follow]')).includes('Llegó por la web'), 'y su historial empieza con cómo llegó');

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
