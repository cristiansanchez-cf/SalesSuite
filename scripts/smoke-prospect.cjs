/**
 * Smoke de «Buscar clientes» (docs/CRM_DINAMICO.md §19), con Google de pruebas (AI_RESEARCH_FIXTURE=1, sin clave):
 * Empresas → Buscar clientes → «discotecas» en Valencia → 12 sitios (uno cerrado sin marcar) → quitar uno → importar →
 * en Empresas con su lista, ficha de Google y redes de su web → la misma búsqueda ya sale como «Ya la tienes».
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-prospect.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  await p.goto(`${BASE}/admin/accounts?ver=all`);
  await Promise.all([p.waitForURL(/\/admin\/accounts\/buscar/), p.click('[data-testid=prospect-open]')]);
  await p.fill('[data-testid=prospect-what]', 'discotecas');
  const vlc = await p.$$eval('[data-testid=prospect-zone] option', (os) => os.find((o) => /› Valencia$/.test(o.textContent.trim()))?.value);
  assert(!!vlc, 'Valencia en el selector de zona');
  await p.selectOption('[data-testid=prospect-zone]', vlc);
  await Promise.all([p.waitForURL(/buscar\?id=/), p.click('[data-testid=prospect-search]')]);
  const rows = async () => p.$$eval('[data-testid=prospect-row]', (xs) => xs.map((x) => ({ name: x.getAttribute('data-name'), state: x.getAttribute('data-state'), checked: x.querySelector('input').checked })));
  let r = await rows();
  assert(r.length === 12, `12 sitios de Google (${r.length})`);
  assert(r.find((x) => x.state === 'closed' && !x.checked), 'el cerrado sale sin marcar');
  assert(r.every((x) => x.checked === (x.state === 'new')), 'solo lo nuevo sale marcado');
  assert(r.find((x) => x.name === 'Discoteca Faro')?.state === 'maybe', '«Discoteca Faro» ya existe (Barcelona): «¿Ya la tienes?», sin marcar');
  const fresh = r.filter((x) => x.state === 'new').length;
  if (OUT) await p.screenshot({ path: `${OUT}/prospect-results.png`, fullPage: true });

  // Quitar uno e importar el resto.
  await p.click('[data-testid=prospect-row][data-name="Discoteca Rayo"] [data-testid=prospect-pick]');
  assert((await p.textContent('[data-testid=prospect-import]')).includes(String(fresh - 1)), 'el botón dice cuántas');
  await p.click('[data-testid=prospect-import]');
  await p.waitForFunction(() => /Hecho/.test(document.querySelector('[data-testid=prospect-status]')?.textContent || ''), null, { timeout: 90000 });
  assert((await p.textContent('[data-testid=prospect-status]')).includes(`${fresh - 1} importadas`), 'importadas con el resumen');
  r = await rows();
  assert(r.filter((x) => x.state === 'have').length === fresh - 1 && r.find((x) => x.name === 'Discoteca Rayo').state === 'new', 'lo importado pasa a «Ya la tienes»; lo quitado, no');
  assert(await p.isVisible('[data-testid=prospect-research]'), 'ofrece investigar con IA lo importado');
  if (OUT) await p.screenshot({ path: `${OUT}/prospect-done.png`, fullPage: true });

  // En Empresas, en su lista; la ficha con Google y las redes de su web.
  await Promise.all([p.waitForURL(/lista=discotecas/), p.click('[data-testid=prospect-see]')]);
  const names = await p.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.getAttribute('data-name')));
  assert(names.includes('Discoteca Sol') && !names.includes('Discoteca Rayo'), `en Empresas (${names.length})`);
  await p.click('[data-testid=account][data-name="Discoteca Sol"] a.co-row__main');
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+$/);
  assert(!!(await p.$('main a[href="https://discotecasol.test/"]')) && !!(await p.$('main a[href*="instagram.com/discotecasol"]')), 'ficha con su web y su Instagram');

  // La misma búsqueda otra vez: aviso y lo ya importado no se duplica.
  await p.goto(`${BASE}/admin/accounts/buscar`);
  assert((await p.$$('[data-testid=prospect-sweep]')).length >= 1, 'la búsqueda queda en el historial');
  await p.fill('[data-testid=prospect-what]', 'discotecas');
  await p.selectOption('[data-testid=prospect-zone]', vlc);
  await Promise.all([p.waitForURL(/buscar\?id=/), p.click('[data-testid=prospect-search]')]);
  r = await rows();
  assert(r.filter((x) => x.state === 'have').length === fresh - 1 && r.filter((x) => x.checked).length === 1, 'otra vez: lo importado sale como «Ya la tienes» y solo la que quité, marcada');

  // Un comercial también busca (y lo que importa es suyo).
  const rep = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await rep.goto(`${BASE}/admin/login`);
  await rep.click('[data-testid="demo-rep@enjoy.test"]');
  await rep.waitForURL(/\/admin/);
  await rep.goto(`${BASE}/admin/accounts/buscar`);
  assert(await rep.isVisible('[data-testid=prospect-form]') && !(await rep.isVisible('[data-testid=prospect-owner]')), 'el comercial busca; no elige a quién asignar');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
