/**
 * Smoke de la privacidad de los leads (docs/LEADS.md §Privacidad), en demo: sin consentimiento de anuncios el gclid no
 * se guarda; Ajustes → Privacidad (plazos, borrar ahora, último borrado, WhatsApp 2); derechos: buscar por email,
 * exportar en JSON y suprimir, con el registro.
 *   npm run build && npm run start:demo ; node scripts/smoke-privacy.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const WEB = 'https://enjoytheclub.es';
const run = Date.now();
const EMAIL = `pepa-${run}@privacidad-smoke.es`;
const lead = (over = {}) => ({
  schema: 'enjoy.lead.v2', idempotency_key: `priv-${run}-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name: 'Pepa Privacidad', email: EMAIL, phone: '600 999 111' }, fields: { venue_name: 'Sala Priv', city: 'Madrid' }, message: 'Quiero información.',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: `${WEB}/es/politica-de-privacidad/` },
  context: { locale: 'es', page_url: `${WEB}/es/locales/?gclid=priv-gclid&utm_source=google`, page_path: '/es/locales/', cta: { id: 'hero' },
    cookie_consent: { analytics: true, ads: false }, attribution: { current: { utm_source: 'google', gclid: 'priv-gclid', landing_page: '/es/?gclid=priv-gclid' } }, time_to_submit_ms: 30000 },
  ...over,
});

(async () => {
  const r = await fetch(`${BASE}/api/v1/leads`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify(lead()) });
  const j = await r.json();
  assert(r.status === 201 && j.id, `lead creado (${r.status})`);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // La ficha: sin consentimiento de anuncios, ni rastro del gclid.
  await p.goto(`${BASE}/admin/leads/${j.id}`);
  assert(!(await p.textContent('main')).includes('priv-gclid'), 'sin consentimiento de anuncios no se guarda el gclid');

  // ---- Ajustes → Privacidad
  await p.goto(`${BASE}/admin/leads/ajustes#privacy`);
  assert(await p.isVisible('[data-testid=leads-privacy]'), 'sección de privacidad');
  assert((await p.inputValue('[data-testid=leads-retention-lead]')) === '24' && (await p.inputValue('[data-testid=leads-retention-test]')) === '30', 'plazos por defecto (24 meses, 30 días)');
  assert(await p.isChecked('[data-testid=leads-wa2]'), 'WhatsApp 2 encendido por defecto');
  await p.fill('[data-testid=leads-retention-test]', '14');
  await Promise.all([p.waitForURL(/ok=retentionSaved/), p.click('[data-testid=leads-retention-save]')]);
  assert((await p.inputValue('[data-testid=leads-retention-test]')) === '14', 'plazo de pruebas guardado');
  await Promise.all([p.waitForURL(/ok=purged/), p.click('[data-testid=leads-purge-now]')]);
  assert(!(await p.textContent('[data-testid=leads-last-purge]')).includes('Aún no'), 'fecha del último borrado');
  assert(await p.isVisible('[data-testid=leads-purge-log]'), 'registro de borrados');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-privacy.png`, fullPage: false });
  // Vuelve el plazo de pruebas por defecto (para no cambiar otras pruebas).
  await p.fill('[data-testid=leads-retention-test]', '30');
  await Promise.all([p.waitForURL(/ok=retentionSaved/), p.click('[data-testid=leads-retention-save]')]);
  // Apagar el WhatsApp 2 y volver a encenderlo (se guarda con el resto de ajustes).
  await p.goto(`${BASE}/admin/leads/ajustes#whatsapp`);
  await p.uncheck('[data-testid=leads-wa2]');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('#whatsapp button[name=at]')]);
  assert(!(await p.isChecked('[data-testid=leads-wa2]')), 'WhatsApp 2 apagado');
  await p.check('[data-testid=leads-wa2]');
  await Promise.all([p.waitForURL(/ok=saved/), p.click('#whatsapp button[name=at]')]);

  // ---- Derechos
  await Promise.all([p.waitForURL(/\/admin\/leads\/privacidad/), p.click('[data-testid=leads-rights-link]')]);
  await p.fill('[data-testid=privacy-email]', EMAIL.toUpperCase());
  await Promise.all([p.waitForURL(/email=/), p.click('[data-testid=privacy-search-go]')]);
  assert((await p.getAttribute('[data-testid=privacy-count-leads]', 'data-n')) === '1', 'encuentra su lead (sin importar mayúsculas)');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=privacy-export]')]);
  const path = await dl.path();
  const data = JSON.parse(require('node:fs').readFileSync(path, 'utf8'));
  assert(data.subject === EMAIL && data.leads.length === 1 && data.leads[0].submissions[0].message === 'Quiero información.', 'exportación en JSON con todo');
  assert(!JSON.stringify(data).includes('priv-gclid'), 'la exportación tampoco tiene el gclid');
  await p.goto(`${BASE}/admin/leads/privacidad?email=${encodeURIComponent(EMAIL)}`);
  await p.fill('[data-testid=privacy-confirm]', 'otro@x.es');
  await p.click('[data-testid=privacy-erase]');
  assert((await p.textContent('main')).includes('escribe el email otra vez'), 'sin confirmar bien, no suprime');
  await p.goto(`${BASE}/admin/leads/privacidad?email=${encodeURIComponent(EMAIL)}`);
  await p.fill('[data-testid=privacy-confirm]', EMAIL);
  await p.click('[data-testid=privacy-erase]');
  await p.waitForSelector('[data-testid=privacy-erased]');
  assert((await p.textContent('[data-testid=privacy-erased]')).includes('1 leads'), 'suprimido');
  const kinds = await p.$$eval('[data-testid=privacy-log-row]', (xs) => xs.map((x) => x.getAttribute('data-kind')));
  assert(kinds.includes('erase') && kinds.includes('export'), `registro: ${kinds.join(', ')}`);
  await p.goto(`${BASE}/admin/leads/privacidad?email=${encodeURIComponent(EMAIL)}`);
  assert(await p.isVisible('[data-testid=privacy-nothing]'), 'ya no queda nada');
  assert((await p.getAttribute('[data-testid=privacy-proofs]', 'data-n')) === '1' && (await p.getAttribute('[data-testid=privacy-suppressed]', 'data-on')) === '1', 'queda la prueba bloqueada y la baja (en hash)');
  const gone = await fetch(`${BASE}/admin/leads/${j.id}`, { headers: { cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } });
  assert(gone.status === 404 || !(await gone.text()).includes('Pepa'), 'la ficha ya no existe');
  if (OUT) await p.screenshot({ path: `${OUT}/leads-rights.png`, fullPage: true });
  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
