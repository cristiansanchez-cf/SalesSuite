/**
 * Smoke de Importar desde Notion (docs/CRM_DINAMICO.md §48), en demo con la base inventada: el superadmin lee la base,
 * revisa (el cliente de Enjoy sale fuera), importa, verifica contra Notion, ve la página en la ficha y lo deshace.
 * Un admin del espacio no entra.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-notion-import.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const login = async (p, who) => { await p.context().clearCookies(); await p.goto(`${BASE}/admin/login`); await p.click(`[data-testid="demo-${who}"]`); await p.waitForURL(/\/admin/); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p, 'admin@enjoy.test');
  await p.goto(`${BASE}/admin/import/notion`);
  assert(!(await p.isVisible('[data-testid=notion-import]')), 'un admin del espacio no lo ve');

  await login(p, 'super@cofundo.test');
  await p.goto(`${BASE}/admin/import`);
  await p.click('[data-testid=notion-import-card]');
  await p.fill('[data-testid=notion-url]', 'https://www.notion.so/Seguimiento-0123456789abcdef0123456789abcdef');
  await p.click('[data-testid=notion-start]');
  await p.waitForURL(/\/admin\/import\/notion\?id=/);
  // Lee las páginas sola y recarga.
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=notion-row][data-read="1"]').length === 3, null, { timeout: 30_000 });
  const inc = await p.$$eval('[data-testid=notion-include]', (xs) => xs.map((x) => x.checked));
  assert(JSON.stringify(inc) === '[true,true,false]', `el cliente de Enjoy, fuera (${inc})`);
  assert((await p.textContent('[data-testid=notion-row] >> nth=0')).includes('2 con fecha'), 'la bitácora: entradas con fecha');
  if (OUT) await p.screenshot({ path: `${OUT}/notion-preview.png`, fullPage: true });
  // El fondo, como inversor.
  await p.selectOption('[data-testid=notion-row] >> nth=1 >> [data-testid=notion-kind]', 'inversor');
  await p.click('[data-testid=notion-run]');
  await p.waitForSelector('[data-testid=notion-verify]', { timeout: 30_000 });
  assert((await p.textContent('[data-msg-ok]')).includes('2 empresas'), `resultado: ${(await p.textContent('[data-msg-ok]')).trim()}`);
  await p.click('[data-testid=notion-verify]');
  await p.waitForSelector('[data-testid=notion-verify-ok], [data-testid=notion-verify-bad]', { timeout: 30_000 });
  assert(await p.isVisible('[data-testid=notion-verify-ok]'), `verificación: ${(await p.textContent('[data-testid=notion-report]')).trim().slice(0, 300)}`);
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'cabe en el móvil');

  // La ficha: el próximo paso, las interacciones y la página de Notion.
  const importUrl = p.url();
  const accId = await p.evaluate(() => { const k = Object.keys(sessionStorage).find((x) => x.startsWith('notion-run-')); return JSON.parse(sessionStorage.getItem(k)).accountIds[0]; });
  await p.goto(`${BASE}/admin/accounts/${accId}`);
  await p.waitForSelector('[data-testid=source-doc]');
  await p.click('[data-testid=source-doc] summary');
  const doc = await p.innerHTML('[data-testid=source-doc] .source-doc');
  assert(doc.includes('<table>') && doc.includes('doc-toggle') && doc.includes('<blockquote>'), 'la página de Notion con su tabla y su desplegable');
  assert((await p.textContent('[data-testid=interactions]')).includes('Propuesta enviada por email'), 'la bitácora en las interacciones');
  if (OUT) await p.screenshot({ path: `${OUT}/notion-account.png`, fullPage: true });

  // Deshacer.
  await p.goto(importUrl);
  await p.waitForSelector('[data-testid=notion-undo]');
  await p.click('[data-testid=notion-undo]');
  await p.waitForFunction(() => document.querySelector('[data-testid=notion-import]')?.dataset.status === 'undone', null, { timeout: 30_000 });
  assert(true, 'deshecha');
  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
