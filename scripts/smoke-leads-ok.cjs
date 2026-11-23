/**
 * Smoke de «WhatsApp con tu OK» (docs/LEADS.md §2f), en demo: se conecta el WhatsApp de los leads, se elige «solo los
 * dudosos esperan» y llega una marca: no se le escribe, la ficha dice que espera tu OK; «Le hablamos» la valida y le sale
 * el WhatsApp 1. Un local claro sale solo (sin espera). Con «todos esperan», tampoco el local.
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
  await submit('whatsapp-connect', { phoneId: '1493985227120621' });
  await submit('whatsapp-templates', { tpl_wa1_es: 'enjoy_lead_1_es', tpl_wa2_es: 'enjoy_lead_2_es' });
  await submit('whatsapp-activate', { enabled: true, wa2: true, approval: 'doubtful', teamWhatsapp: true });
  await p.goto(`${BASE}/admin/leads/configurar?abrir=whatsapp&p=5`);
  assert(await p.isChecked('[data-testid=approval-doubtful]') && await p.isChecked('[data-testid=team-whatsapp]'), 'Ajustes: «solo los dudosos» y el aviso por WhatsApp, guardados');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-ok-settings.png` });

  // Una marca: espera tu OK.
  const brand = await post(lead({ contact: { name: 'Ana Marca OK', email: `ana-${RUN}@cervezasok.com`, phone: '600 222 334' }, fields: { venue_name: 'Cervezas OK' },
    message: 'Somos una marca de cerveza y buscamos un acuerdo de patrocinio con vuestros locales' }));
  await fetch(`${BASE}/api/cron/leads`);
  await p.goto(`${BASE}/admin/leads/${brand.id}`);
  const steps = async () => p.$$eval('[data-testid=lead-message]', (xs) => xs.map((x) => `${x.getAttribute('data-step')}:${x.getAttribute('data-status')}`));
  assert(!(await steps()).some((s) => /^wa[12]:/.test(s)), `la marca: ningún WhatsApp programado (${(await steps()).join(', ')})`);
  assert(await p.isVisible('[data-testid=lead-not-now]') && /Espera tu OK/i.test(await p.textContent('[data-testid=lead-talk-box]')), 'la ficha: espera tu OK, con «Le hablamos» y «Lo miro yo»');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-ok-awaiting.png` });
  await Promise.all([p.waitForURL(/ok=talked/), p.click('[data-testid=lead-talk]')]);
  assert((await steps()).some((s) => s.startsWith('wa1:')), `«Le hablamos»: el WhatsApp 1 sale (${(await steps()).join(', ')})`);
  assert(await p.isVisible('[data-testid=lead-open-contact]'), '«Le hablamos»: ya está en el CRM');
  assert(!(await p.isVisible('[data-testid=lead-talk-box]')), 'y ya no se puede pedir otra vez');

  // Un local claro: sale solo, sin espera.
  const venue = await post(lead());
  await p.goto(`${BASE}/admin/leads/${venue.id}`);
  assert((await steps()).some((s) => s.startsWith('wa1:')) && !(await p.isVisible('[data-testid=lead-not-now]')), 'un local claro: el WhatsApp sale solo');

  // «Todos esperan»: tampoco el local.
  await submit('whatsapp-activate', { enabled: true, wa2: true, approval: 'all', teamWhatsapp: true });
  const venue2 = await post(lead({ contact: { name: 'Pepe OK', email: `pepe-${RUN}@salaok2.es`, phone: '600 123 125' } }));
  await p.goto(`${BASE}/admin/leads/${venue2.id}`);
  assert(!(await steps()).some((s) => /^wa[12]:/.test(s)) && await p.isVisible('[data-testid=lead-not-now]'), '«todos esperan»: el local también espera');
  await Promise.all([p.waitForURL(/ok=dismissed/), p.click('[data-testid=lead-not-now]')]);
  assert(!(await p.isVisible('[data-testid=lead-not-now]')), '«Lo miro yo»: deja de esperar');
  await submit('whatsapp-activate', { enabled: false, wa2: true, approval: 'doubtful', teamWhatsapp: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
