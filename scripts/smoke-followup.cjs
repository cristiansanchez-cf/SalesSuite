/**
 * Smoke del seguimiento (docs/CRM_DINAMICO.md §10): «Hoy» en Inicio, contacto de la empresa a un toque, apuntar una
 * interacción y que la app proponga el próximo paso con la regla de los 3 intentos.
 *   npm run build && npm run start:demo ; node scripts/smoke-followup.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // ---- «Hoy» en Inicio
  await p.goto(`${BASE}/admin/inicio`);
  await p.waitForSelector('[data-testid=today]');
  const item = p.locator('[data-testid=today-item][data-name="Club Sol"]');
  assert(await item.isVisible(), '«Hoy»: Club Sol toca hoy');
  assert((await item.textContent()).includes('Proponer una cita el jueves') && (await item.textContent()).includes('Marta Ruiz'), 'con el qué y el con quién');
  assert(await item.locator('a[href^="https://wa.me/34611222333"]').isVisible(), 'WhatsApp a un toque');
  if (OUT) await p.screenshot({ path: `${OUT}/followup-today.png`, fullPage: true });

  // ---- la ficha: contacto y seguimiento
  await item.locator('a.co-row__main').click();
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  assert(await p.isVisible('[data-testid=contact-links] a[href="https://www.instagram.com/clubsol/"]'), 'Instagram de la empresa');
  assert((await p.textContent('[data-testid=contact-links]')).includes('de Marta Ruiz'), 'teléfono de respaldo: el de su persona principal');
  assert((await p.getAttribute('[data-testid=next-step]', 'data-bucket')) === 'today', 'próximo paso: hoy');
  assert((await p.textContent('[data-testid=interactions]')).includes('Le interesa para los viernes'), 'historial de interacciones');

  // ---- apuntar: sin respuesta por WhatsApp → la app propone otra vía en 2 días
  await p.selectOption('[data-testid=log-channel]', 'whatsapp');
  await p.check('[data-testid=outcome-no_reply]', { force: true });
  await p.fill('[data-testid=contact-form] [name=note]', 'Le escribo para cerrar día; sin respuesta');
  await Promise.all([p.waitForURL(/ok=contact/), p.click('[data-testid=log-save]')]);
  assert((await p.getAttribute('[data-testid=next-step]', 'data-bucket')) === 'later', 'próximo paso movido a dentro de 2 días');
  assert((await p.textContent('[data-testid=next-step]')).includes('Llamada'), 'por otra vía (llamada)');
  assert((await p.textContent('[data-testid=interactions]')).includes('WhatsApp · Sin respuesta'), 'la interacción en el historial');
  if (OUT) await p.screenshot({ path: `${OUT}/followup-account.png`, fullPage: true });

  // ---- editar el contacto de la empresa
  await p.click('[data-testid=company-contact] summary');
  await p.fill('[data-testid=company-contact-form] [name=email]', 'hola@clubsol.test');
  await Promise.all([p.waitForURL(/ok=companyContact/), p.click('[data-testid=company-contact-form] button[type=submit]')]);
  assert(await p.isVisible('[data-testid=contact-links] a[href="mailto:hola@clubsol.test"]'), 'email de la empresa guardado');

  await p.goto(`${BASE}/admin/inicio`);
  await p.waitForSelector('[data-testid=today]');
  assert(!(await p.isVisible('[data-testid=today-item][data-name="Club Sol"]')), '«Hoy» ya no lo enseña (toca dentro de 2 días)');
  await b.close();
})();
