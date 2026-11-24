/**
 * Smoke de «WhatsApp al validar» (docs/LEADS.md §2f), en demo: sin WhatsApp conectado nada lo promete y aceptar solo lo
 * pasa al CRM; conectado (todos esperan, 6 minutos), aceptar lo valida y programa el WhatsApp 1; sin la casilla, no.
 * Plataforma dice qué espacios lo tienen conectado.
 *   npm run build && npm run start:demo ; node scripts/smoke-leads-ok.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const WEB = 'https://enjoytheclub.es';
const lead = (over = {}) => ({
  schema: 'enjoy.lead.v2', idempotency_key: `ok-${RUN}-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name: 'Laura OK', email: `laura-${RUN}@salaok.es`, phone: '600 123 124' },
  fields: { venue_name: 'Sala OK', city: 'Valencia' }, message: 'Abrimos de jueves a sábado.',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: `${WEB}/es/politica-de-privacidad/`, submitted_at: new Date().toISOString() },
  context: { locale: 'es', form_version: '2026-11-01', page_url: `${WEB}/es/soluciones/locales/`, page_path: '/es/soluciones/locales/', time_to_submit_ms: 30000 },
  ...over,
});
const post = async (body) => (await fetch(`${BASE}/api/v1/leads`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify(body) })).json();

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  // Envía un formulario del diálogo de WhatsApp con estos valores (sin depender de los pasos del modal).
  const submit = async (testid, values) => {
    await p.goto(`${BASE}/admin/leads/configurar?abrir=whatsapp`);
    await Promise.all([p.waitForURL(/ok=/), p.evaluate(([id, v]) => {
      const f = document.querySelector(`[data-testid=${id}]`);
      for (const [k, val] of Object.entries(v)) {
        const els = f.querySelectorAll(`[name="${k}"]`);
        if (!els.length) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(val); f.append(i); continue; }
        els.forEach((el) => { if (el.type === 'checkbox') el.checked = !!val; else if (el.type === 'radio') el.checked = el.value === val; else el.value = String(val); });
      }
      f.requestSubmit();
    }, [testid, values])]);
  };
  const steps = async () => p.$$eval('[data-testid=lead-message]', (xs) => xs.map((x) => `${x.getAttribute('data-step')}:${x.getAttribute('data-status')}`));
  const accept = async (id, wa = true) => {
    await p.click('[data-testid=lead-accept]');
    const dlg = `[data-testid=accept-${id}]`;
    const text = await p.textContent(dlg);
    if (!wa && await p.isVisible(`[data-testid=accept-${id}-wa]`)) await p.uncheck(`[data-testid=accept-${id}-wa]`);
    await Promise.all([p.waitForURL(/ok=validated/), p.click(`[data-testid=accept-${id}-confirm]`)]);
    return text;
  };

  // 1) Sin el WhatsApp conectado: en ningún sitio se promete; aceptar solo lo pasa al CRM y lo dice.
  await p.goto(`${BASE}/admin/leads`);
  assert((await p.getAttribute('[data-testid=leads-wa-badge]', 'data-on')) === '0', 'bandeja: «WhatsApp de leads sin conectar»');
  const off = await post(lead({ contact: { name: 'Sin WA', email: `sinwa-${RUN}@salaok.es`, phone: '600 123 120' } }));
  assert(off.next?.channel === 'email', 'la web no promete WhatsApp');
  await p.goto(`${BASE}/admin/leads/${off.id}`);
  assert(!(await p.isVisible('[data-testid=lead-talk-box]')), 'la ficha no dice que le vaya a salir un WhatsApp');
  const offText = await accept(off.id);
  assert(/no tiene WhatsApp conectado/.test(offText) && !/min, le sale/.test(offText), 'aceptar: «no le manda ningún mensaje (sin WhatsApp: …no tiene WhatsApp conectado)»');
  assert(/Sin WhatsApp: este espacio no tiene WhatsApp conectado/.test(await p.textContent('main')) && !(await steps()).some((x) => /^wa1/.test(x)), 'validado, sin WhatsApp, y lo dice');

  // 2) Se conecta: todos esperan a que se validen; a los 6 min de validar, el WhatsApp.
  await submit('whatsapp-connect', { phoneId: '1493985227120621' });
  await submit('whatsapp-templates', { tpl_wa1_es: 'enjoy_lead_1_es', tpl_wa2_es: 'enjoy_lead_2_es' });
  await submit('whatsapp-activate', { enabled: true, wa2: true, approval: 'all', delayMinutes: 6, teamWhatsapp: true });
  await p.goto(`${BASE}/admin/leads/configurar?abrir=whatsapp&p=5`);
  assert(await p.isChecked('[data-testid=approval-all]') && (await p.inputValue('[data-testid=wa-delay]')) === '6' && await p.isChecked('[data-testid=team-whatsapp]'), 'Ajustes: «todos», 6 minutos y el aviso por WhatsApp, guardados');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-ok-settings.png` });
  await p.goto(`${BASE}/admin/leads`);
  assert((await p.getAttribute('[data-testid=leads-wa-badge]', 'data-on')) === '1', 'bandeja: «WhatsApp de leads conectado»');

  const venue = await post(lead());
  await fetch(`${BASE}/api/cron/leads`);
  await p.goto(`${BASE}/admin/leads/${venue.id}`);
  assert(!(await steps()).some((x) => /^wa[12]:/.test(x)), `nada sale solo (${(await steps()).join(', ')})`);
  assert(/a los 6 min le sale el WhatsApp/.test(await p.textContent('[data-testid=lead-talk-box]')), 'la ficha: espera tu validación, a los 6 min');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-ok-awaiting.png` });
  const onText = await accept(venue.id);
  assert(/a los 6 min, le sale el WhatsApp de bienvenida/.test(onText), 'aceptar: dice que a los 6 min le sale el WhatsApp');
  assert(/a los 6 min le sale el WhatsApp/.test(await p.textContent('main')) && (await steps()).some((x) => x.startsWith('wa1:pending')), `validado y el WhatsApp 1 programado (${(await steps()).join(', ')})`);
  assert(!(await p.isVisible('[data-testid=lead-talk-box]')), 'y no se puede pedir otra vez');

  // 3) Aceptar quitando la casilla: solo al CRM.
  const quiet = await post(lead({ contact: { name: 'Pepe OK', email: `pepe-${RUN}@salaok2.es`, phone: '600 123 125' } }));
  await p.goto(`${BASE}/admin/leads/${quiet.id}`);
  await accept(quiet.id, false);
  assert(!(await steps()).some((x) => /^wa1/.test(x)), 'sin la casilla: validado y sin WhatsApp');

  // 4) En bloque: «Seleccionar todos», quitar uno y rechazar el resto; después, aceptar el que quedaba.
  for (const n of ['b1', 'b2', 'b3']) await post(lead({ contact: { name: `Bulk ${n}`, email: `${n}-${RUN}@bulk.es`, phone: '600 123 130' } }));
  await p.goto(`${BASE}/admin/leads`);
  await p.check('[data-testid=leads-select-all]');
  await p.uncheck(`[data-testid=lead][data-email="b2-${RUN}@bulk.es"] [data-testid=lead-select]`);
  const nSel = await p.$$eval('[data-testid=lead-select]:checked', (xs) => xs.length);
  await p.click('[data-testid=leads-bulk-reject]');
  assert((await p.textContent('#bulk-reject-title')).includes(String(nSel)), `en bloque: la confirmación dice cuántos (${nSel})`);
  await Promise.all([p.waitForURL(/ok=bulkRejected/), p.click('[data-testid=bulk-reject-confirm]')]);
  const left = await p.$$eval('[data-testid=lead]', (xs) => xs.map((x) => x.getAttribute('data-email')));
  assert(left.includes(`b2-${RUN}@bulk.es`) && !left.includes(`b1-${RUN}@bulk.es`) && !left.includes(`b3-${RUN}@bulk.es`), `todos menos uno, rechazados (${new RegExp(`${nSel} rechazados`).test(await p.textContent('main'))})`);
  await p.check(`[data-testid=lead][data-email="b2-${RUN}@bulk.es"] [data-testid=lead-select]`);
  await p.click('[data-testid=leads-bulk-accept]');
  assert(await p.isVisible('[data-testid=bulk-accept-wa]'), 'aceptar en bloque: con la casilla del WhatsApp (está conectado)');
  await Promise.all([p.waitForURL(/ok=bulkAccepted/), p.click('[data-testid=bulk-accept-confirm]')]);
  assert(/1 aceptados: ya están en el CRM\. A 1 les sale el WhatsApp a los 6 min/.test(await p.textContent('main')), 'aceptado en bloque y dice a cuántos les sale el WhatsApp');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-bulk.png` });

  // 4) Plataforma: Enjoy, con el WhatsApp conectado.
  const sup = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await sup.goto(`${BASE}/admin/login`); await sup.click('[data-testid="demo-super@cofundo.test"]'); await sup.waitForURL(/\/admin/);
  await sup.goto(`${BASE}/admin/platform`);
  assert((await sup.getAttribute('[data-testid=platform-space][data-slug=enjoy] [data-testid=platform-whatsapp]', 'data-on')) === '1', 'Plataforma: Enjoy con el WhatsApp de leads conectado');
  await submit('whatsapp-activate', { enabled: false, wa2: true, approval: 'all', delayMinutes: 5, teamWhatsapp: true });
  await sup.reload();
  assert((await sup.getAttribute('[data-testid=platform-space][data-slug=enjoy] [data-testid=platform-whatsapp]', 'data-on')) === '0', 'Plataforma: apagado, «sin conectar» y qué falta');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
