/**
 * Smoke de «qué mirar» en la investigación con IA (docs/CRM_DINAMICO.md §13), con la respuesta fija de pruebas
 * (AI_RESEARCH_FIXTURE=1): el admin pone lo de siempre (web antigua, aviso legal, privacidad y cookies; revisar su web);
 * en la ficha sale ya escrito, se investiga y se ven «Su web» con ✓/✗ y «Lo que queríais saber». Luego, otra cosa
 * solo para esa vez.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-research-focus.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const bg = async (pg, click) => { const n = Number(await pg.evaluate(() => document.documentElement.dataset.asyncDone || 0)); await click(); await pg.waitForFunction((k) => Number(document.documentElement.dataset.asyncDone || 0) > k, n, { timeout: 90000 }); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // Lo de siempre (admin): con los atajos.
  await p.goto(`${BASE}/admin/team/fields?de=investigar`);
  assert(!(await p.isChecked('[data-testid=research-web]')), 'de primeras, sin revisar la web');
  await p.click('[data-testid=research-preset-webOld]');
  await p.click('[data-testid=research-preset-webLegal]');
  await p.click('[data-testid=research-preset-webLegal]');
  const text = await p.inputValue('[data-testid=research-focus]');
  assert(text.split('\n').length === 2 && /antigua/.test(text) && /cookies/.test(text), 'los atajos añaden su línea (sin repetir)');
  assert(await p.isChecked('[data-testid=research-web]'), 'los de la web marcan «Revisar su web»');
  await Promise.all([p.waitForURL(/ok=research/), p.click('[data-testid=research-save]')]);
  assert((await p.inputValue('[data-testid=research-focus]')).includes('antigua'), 'guardado');

  // En la ficha: una empresa con web.
  await p.goto(`${BASE}/admin/accounts?ver=all&q=Terraza%20Azahar`);
  await p.click('[data-testid=account][data-name="Terraza Azahar"] a.co-row__main');
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);
  const unblock = p.locator('form:has(input[name=action][value=unblock]) button[type=submit]');
  if (await unblock.count()) { await Promise.all([p.waitForURL(/ok=unblocked/), unblock.click()]); }
  const acc = p.url().split(/[?#]/)[0];
  const det = p.locator('details:has([data-testid=company-contact-form])');
  if (!(await det.evaluate((d) => d.open))) await det.locator('summary').click();
  await bg(p, async () => { await p.fill('[data-testid=company-contact-form] [name=website]', 'https://azahar.test/'); await p.press('[data-testid=company-contact-form] [name=website]', 'Tab'); });
  await p.goto(acc);
  await p.click('[data-testid=ai-ask] summary');
  assert((await p.inputValue('[data-testid=ai-focus]')).includes('antigua') && await p.isChecked('[data-testid=ai-web-check]'), 'en la ficha, ya con lo de siempre');
  await bg(p, () => p.click('[data-testid=ai-run]'));
  assert(await p.isVisible('[data-testid=ai-web]'), '«Su web», revisada por la app');
  const rows = await p.$$eval('[data-testid=ai-web-row]', (xs) => xs.map((x) => `${x.getAttribute('data-ok')} ${x.textContent.trim()}`));
  assert(rows.some((r) => r.startsWith('false') && r.includes('HTTPS')) && rows.some((r) => r.startsWith('false') && r.includes('privacidad')) && rows.some((r) => r.startsWith('true') && r.includes('Aviso legal')), `✓/✗ por cosa (${rows.length} filas)`);
  assert(/\d+ cosas a mejorar/.test(await p.textContent('[data-testid=ai-web-problems]')), 'cuántas cosas a mejorar');
  const checks = await p.$$eval('[data-testid=ai-check]', (xs) => xs.map((x) => x.getAttribute('data-verdict')));
  assert(checks.length === 2 && checks.every((v) => v === 'problem'), `«Lo que queríais saber»: cada punto (${checks})`);

  // Solo esta vez: otra cosa y sin la web (pasada la espera entre investigaciones no se puede en un smoke: se mira el
  // formulario, que es lo que cambia).
  await p.click('[data-testid=ai-ask] summary');
  await p.fill('[data-testid=ai-focus]', '¿Qué dicen sus reseñas?');
  await p.uncheck('[data-testid=ai-web-check]');
  assert((await p.inputValue('[data-testid=ai-focus]')) === '¿Qué dicen sus reseñas?', 'se puede cambiar para esta vez');
  await p.goto(`${BASE}/admin/team/fields?de=investigar`);
  assert((await p.inputValue('[data-testid=research-focus]')).includes('antigua'), 'y lo de siempre sigue igual');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
