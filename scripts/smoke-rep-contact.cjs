/**
 * Smoke del contacto del comercial en la propuesta (modo DEMO, docs/PERSONALIZE.md §Contacto del comercial):
 *   npm run build && DEV_TENANT_SLUG=enjoy PORT=4321 npm start
 *   node scripts/smoke-rep-contact.cjs     (BASE_URL=http://127.0.0.1:4321)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
// Club Sol: propuesta publicada del comercial de ejemplo (la añade la demo).
const DOSSIER = '00000000-0000-4000-8000-000000d05511';
const TOKEN = 'demo-club-sol-4Hq8';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  // Sin contacto propio: la propuesta lleva el de la marca.
  await p.goto(`${BASE}/d/${TOKEN}`);
  assert(!(await p.isVisible('[data-testid=rep-contact]')), 'sin contacto propio: el botón es el de la marca');

  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(`${BASE}/admin`);
  await p.goto(`${BASE}/admin/dossiers/${DOSSIER}`);
  assert(await p.isVisible('[data-testid=rep-contact-card]'), 'el editor enseña «Tu contacto en esta propuesta»');

  // Canal sin número: pendiente (aviso) y la propuesta sigue con el de la marca.
  await p.selectOption('[data-testid=rep-contact-channel]', 'kakao');
  assert((await p.getAttribute('[data-testid=rep-contact-value]', 'placeholder')).includes('KakaoTalk'), 'el ejemplo del campo cambia con el canal');
  await p.click('[data-testid=rep-contact-save]');
  await p.waitForURL(/ok=contact/);
  assert((await p.getAttribute('[data-testid=rep-contact-card]', 'class')).includes('co-inset--warn'), 'canal sin número: aviso de que falta');
  await p.goto(`${BASE}/d/${TOKEN}`);
  assert(!(await p.isVisible('[data-testid=rep-contact]')), 'canal sin número: sigue el de la marca');

  // Número mal puesto en WhatsApp: error, no se guarda.
  await p.goto(`${BASE}/admin/dossiers/${DOSSIER}`);
  await p.selectOption('[data-testid=rep-contact-channel]', 'whatsapp');
  await p.fill('[data-testid=rep-contact-value]', 'hola');
  await p.click('[data-testid=rep-contact-save]');
  await p.waitForLoadState('load');
  assert(!p.url().includes('ok=contact'), 'WhatsApp sin número válido: no se guarda');

  // Instagram: botón principal de la propuesta y en el pie.
  await p.goto(`${BASE}/admin/dossiers/${DOSSIER}`);
  await p.selectOption('[data-testid=rep-contact-channel]', 'instagram');
  await p.fill('[data-testid=rep-contact-value]', '@ana.ventas');
  await p.click('[data-testid=rep-contact-save]');
  await p.waitForURL(/ok=contact/);
  await p.goto(`${BASE}/d/${TOKEN}?ver=scroll`);
  const btn = p.locator('[data-testid=rep-contact]');
  assert((await btn.getAttribute('href')) === 'https://ig.me/m/ana.ventas', 'propuesta: el botón principal es el Instagram de quien la hizo');
  assert((await p.textContent('[data-testid=brand-footer]')).includes('@ana.ventas'), 'propuesta: el pie también lo enseña');
  if (OUT) await p.screenshot({ path: `${OUT}/rep-contact-public.png` });
  await p.goto(`${BASE}/admin/dossiers/${DOSSIER}/preview?ver=scroll`);
  assert((await p.locator('[data-testid=rep-contact]').getAttribute('href')) === 'https://ig.me/m/ana.ventas', 'vista previa: igual que la verá el cliente');

  // Se deja como estaba.
  await p.goto(`${BASE}/admin/dossiers/${DOSSIER}`);
  if (OUT) await p.locator('[data-testid=rep-contact-card]').screenshot({ path: `${OUT}/rep-contact-editor.png` });
  await p.selectOption('[data-testid=rep-contact-channel]', '');
  await p.fill('[data-testid=rep-contact-value]', '');
  await p.click('[data-testid=rep-contact-save]');
  await p.waitForURL(/ok=contact/);

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
