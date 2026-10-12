/**
 * Smoke de «Unir empresas» (docs/CRM_DINAMICO.md §41): dos fichas de la misma empresa (una con una persona, la otra
 * con un dato y una interacción) → marcar las dos → Unir → elegir cuál se queda y el nombre de la otra → todo junto en
 * una y la otra borrada.
 *   npm run build && npm run start:demo ; node scripts/smoke-merge.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const A = 'Mya Fusion', B = 'Mya Fusion Valencia';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  const create = async (name) => {
    await p.goto(`${BASE}/admin/accounts?ver=all`);
    await p.click('[data-testid=add-open]'); await p.click('[data-testid=new-account]');
    await p.fill('[data-testid=new-account-form] [name=name]', name);
    await Promise.all([p.waitForURL(/ok=created/), p.click('[data-testid=new-account-form] button[type=submit]')]);
    return p.url().split('?')[0];
  };
  // A: una persona (como la del Fun Business Days).
  const pageA = await create(A);
  await p.click('[data-testid=account-add-person]');
  await p.fill('[data-testid=add-person-form] [name=name]', 'Lucía Fusión');
  await Promise.all([p.waitForURL(/ok=person/), p.click('[data-testid=add-person-form] button[type=submit]')]);
  // B: un dato y una interacción (como la de Google Maps, ya trabajada).
  await create(B);
  await p.fill('[data-testid=fact-text]', 'Tiene dos salas y terraza');
  await p.click('[data-testid=fact-add]');
  await p.waitForFunction(() => document.querySelector('[data-testid=facts-card]')?.textContent?.includes('Tiene dos salas'));
  await p.reload();
  await p.click('[data-testid=log-open]');
  await p.fill('[data-testid=log-note]', 'Hablé con el encargado');
  await p.click('[data-testid=outcome-replied]');
  await Promise.all([p.waitForURL(/ok=contact/), p.click('[data-testid=log-save]')]);

  // ---- marcar las dos y «Unir»
  await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent('Mya Fusion')}`);
  for (const n of [A, B]) await p.check(`[data-testid=account][data-name="${n}"] [data-bulk]`);
  assert(await p.isVisible('[data-testid=bulk-merge]'), 'con dos marcadas: «Unir»');
  await Promise.all([p.waitForURL(/\/admin\/accounts\/unir/), p.click('[data-testid=bulk-merge]')]);
  assert((await p.$$('[data-testid=merge-side]')).length === 2, 'las dos, lado a lado');
  // Se queda A (la de la persona), con el nombre de B.
  if ((await p.getAttribute(`[data-testid=merge-side][data-name="${A}"]`, 'data-keep')) !== '1') {
    await Promise.all([p.waitForURL(/keep=/), p.click(`[data-testid=merge-side][data-name="${A}"] [data-testid=merge-choose]`)]);
  }
  assert((await p.getAttribute(`[data-testid=merge-side][data-name="${A}"]`, 'data-keep')) === '1', `se queda «${A}»`);
  await p.check('[data-testid=merge-row][data-key=name] [data-testid=merge-drop-value]');
  assert((await p.textContent('[data-testid=merge-people]')).includes('Lucía Fusión') && (await p.textContent('[data-testid=merge-facts]')).includes('dos salas'), 'personas y lo que sabemos de las dos, con casillas');
  assert((await p.textContent('[data-testid=merge-moved]')).includes('1 interacciones'), 'lo que pasa sin elegir: su interacción');
  if (OUT) await p.screenshot({ path: `${OUT}/merge.png`, fullPage: true });
  await p.click('[data-testid=merge-run]');
  await Promise.all([p.waitForURL(/ok=merged/), p.click('[data-testid=merge-confirm]')]);

  // ---- una sola, con todo
  assert(p.url().split('?')[0] === pageA, 'queda la ficha de la que se queda');
  assert((await p.textContent('h1')).includes(B), `con el nombre elegido («${B}»)`);
  assert((await p.textContent('[data-testid=account-people]')).includes('Lucía Fusión'), 'su persona');
  assert((await p.textContent('[data-testid=facts-card]')).includes('Tiene dos salas y terraza'), 'el dato de la otra');
  assert((await p.textContent('[data-testid=interactions]')).includes('Hablé con el encargado'), 'la interacción de la otra');
  await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent('Mya Fusion')}`);
  assert((await p.$$('[data-testid=account]')).length === 1, 'la otra, borrada');

  // ---- Tipo (§42): en la ficha, a un toque; en la lista, varias a la vez.
  const zafiro = await create('Zafiro Fusion');
  await Promise.all([p.waitForURL(/ok=kind/), p.click('[data-testid=kind-switch-promotora]')]);
  assert((await p.getAttribute('[data-testid=kind-switch-promotora]', 'aria-current')) === 'page' && (await p.getAttribute('[data-testid=qualification]', 'data-profile')) === 'promoter',
    'Zafiro: promotora, con su ficha de promotora');
  await create('DJ Uno Fusion'); await create('DJ Dos Fusion');
  await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent('DJ')}`);
  for (const n of ['DJ Uno Fusion', 'DJ Dos Fusion']) await p.check(`[data-testid=account][data-name="${n}"] [data-bulk]`);
  await p.click('[data-testid=bulk-kind]');
  await p.click('[data-testid=bulk-kind-dj]');
  await Promise.all([p.waitForURL(/ok=kinds/), p.click('[data-testid=bulk-kind-confirm]')]);
  assert((await p.textContent('main')).includes('Tipo cambiado en 2'), 'dos cambiadas a DJ de una vez');
  await p.goto(`${BASE}/admin/accounts?ver=all&tipo=dj&q=${encodeURIComponent('Fusion')}`);
  const djs = await p.$$eval('[data-testid=account]', (xs) => xs.map((x) => x.getAttribute('data-name')));
  assert(djs.includes('DJ Uno Fusion') && djs.includes('DJ Dos Fusion'), `en la pestaña DJs (${djs})`);
  void zafiro;
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
