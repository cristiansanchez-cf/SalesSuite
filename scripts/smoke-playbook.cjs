/**
 * Smoke E2E del playbook (modo DEMO).  npm run build && npm run start:demo ; node scripts/smoke-playbook.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const login = async (email) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(`${BASE}/admin`);
    return p;
  };

  // ---------------- comercial: aprende
  const rep = await login('rep@enjoy.test');
  await rep.click('a[href="/admin/learn"]');
  assert(await rep.isVisible('[data-testid=progress]'), 'Aprende: barra de progreso');
  assert((await rep.$$('[data-testid=topic]')).length >= 3, 'Aprende: fichas por módulo');
  if (OUT) await rep.screenshot({ path: `${OUT}/learn-index.png`, fullPage: true });

  await rep.click('[data-testid=topic-general]');
  const caro = rep.locator('[data-testid=play]', { hasText: '"Es caro"' });
  assert((await caro.locator('[data-testid=cerebro-refs]').textContent()).includes('[707]'), 'jugada enlaza ficha del Cerebro con atribución');
  // El voto es un interruptor: comprobamos que cambia (el script se puede repetir).
  const voteBtn = () => rep.locator('[data-testid=play]').first().locator('[data-testid=vote-worked]');
  const before = await voteBtn().getAttribute('aria-pressed');
  await Promise.all([rep.waitForNavigation(), voteBtn().click()]);
  const after = await voteBtn().getAttribute('aria-pressed');
  assert(before !== after, `voto «me funcionó» registrado (${before} → ${after})`);
  if (after === 'false') await Promise.all([rep.waitForNavigation(), voteBtn().click()]);  // deja el voto puesto

  await caro.locator('summary', { hasText: 'Proponer una mejora' }).click();
  await caro.locator('[name=title]').fill(`Coste por invitado ${RUN}`);
  await caro.locator('textarea[name=body]').fill(`Calcula delante de ellos el **coste por invitado** (${RUN}).`);
  await caro.locator('button', { hasText: 'Enviar al líder' }).click();
  await rep.waitForURL(/ok=change/);
  assert(await rep.isVisible('text=Tus propuestas'), 'propuesta visible para su autor (pendiente)');

  await rep.fill('[data-testid=tip-form] [name=title]', `Truco ${RUN}`);
  await rep.fill('[data-testid=tip-form] [name=body]', 'Pregunto por la canción del primer baile: abre la conversación.');
  await rep.click('[data-testid=tip-form] button');
  await rep.waitForURL(/ok=tip/);
  assert((await rep.textContent('[data-testid=team]')).includes(`Truco ${RUN}`), 'truco compartido visible al momento');
  if (!(await rep.textContent('[data-testid=learned]')).includes('Aprendido')) {
    await rep.click('[data-testid=learned]');
    await rep.waitForURL(/ok=learned/);
  }
  await rep.goto(`${BASE}/admin/learn`);
  assert((await rep.textContent('[data-testid=progress]')).includes('1/'), 'progreso de formación actualizado');

  // ficha de módulo con vista previa en vivo
  await rep.locator('[data-testid=topic]', { hasText: 'Tabs · Experiencias' }).click();
  const frame = rep.frameLocator('iframe[title^="Vista previa"]');
  assert(await frame.locator('[data-block-type=tabs-showcase]').isVisible(), 'ficha de módulo: vista previa en vivo del módulo');
  if (OUT) await rep.screenshot({ path: `${OUT}/learn-module.png`, fullPage: false });

  // ---------------- guion en el builder (Sala X)
  await rep.goto(`${BASE}/admin/dossiers/00000000-0000-4000-8000-000000d05501`);
  await rep.click('[data-testid=tab-script]');
  await rep.waitForSelector('[data-testid=track-line]');
  const track = await rep.textContent('[data-testid=talk-track]');
  assert(track.includes('Hola Laura') && track.includes('Sala X'), 'guion personalizado con el prospecto');
  assert(track.includes('2. Tabs · Locales') && track.includes('3. Tabs · Experiencias'), 'guion sigue el orden del dossier');
  assert(track.includes('700') && track.includes('"Es caro"'), 'guion incluye precio del dossier y objeciones');
  if (OUT) await rep.screenshot({ path: `${OUT}/builder-script.png`, fullPage: false });
  const sp = await rep.context().newPage();
  await sp.goto(`${BASE}/admin/dossiers/00000000-0000-4000-8000-000000d05501/script`);
  assert((await sp.textContent('h1')).includes('Sala X'), 'guion imprimible');

  // ---------------- líder: bandeja, ascenso, edición, métricas, export
  const adm = await login('admin@enjoy.test');
  assert((await adm.textContent('a[href="/admin/playbook"]')).match(/Playbook \(\d+\)/), 'menú del líder con propuestas pendientes');
  await adm.click('a[href="/admin/playbook"]');
  const prop = adm.locator('[data-testid=pending]', { hasText: `Coste por invitado ${RUN}` });
  await prop.locator('[data-testid=accept]').click();
  await adm.waitForURL(/ok=accept/);
  const tip = adm.locator('[data-testid=team-tip]', { hasText: `Truco ${RUN}` });
  await tip.locator('[data-testid=promote]').click();
  await adm.waitForURL(/ok=promote/);
  if (OUT) await adm.screenshot({ path: `${OUT}/playbook-admin.png`, fullPage: false });

  await adm.goto(`${BASE}/admin/playbook?tab=plays`);
  await adm.locator('[data-testid=plays-admin] a', { hasText: 'Enjoy en una frase' }).click();
  await adm.fill('[data-testid=play-form] [name=title]', `Enjoy en una frase (${RUN})`);
  await adm.click('[data-testid=play-form] button[value=save]');
  assert((await adm.textContent('[data-testid=error]')).includes('nota de cambio'), 'editar exige nota de cambio');
  await adm.fill('[data-testid=play-form] [name=note]', 'Afinado tras reunión de equipo');
  await adm.click('[data-testid=play-form] button[value=save]');
  await adm.waitForURL(/ok=saved/);
  assert((await adm.textContent('[data-testid=history]')).includes('Afinado tras reunión de equipo'), 'historial de versiones');
  await adm.goto(`${BASE}/admin/playbook?tab=metrics`);
  assert((await adm.textContent('[data-testid=metrics]')).includes('Lo que más funciona'), 'métricas');
  const exp = await adm.request.get(`${BASE}/admin/api/playbook/export`);
  const json = await exp.json();
  assert(json.formato === 'salessuite.playbook/v1' && json.jugadas.length > 10, 'export con formato de ficha');

  // ---------------- el comercial ve la novedad y su mejora aceptada
  await rep.goto(`${BASE}/admin/learn`);
  assert((await rep.textContent('[data-testid=news]')).includes(`Coste por invitado ${RUN}`), 'novedad: mejora aceptada visible al equipo');
  await rep.goto(`${BASE}/admin/learn/general`);
  assert((await rep.textContent('body')).includes(`coste por invitado (${RUN})`), 'jugada oficial actualizada con la mejora');
  assert((await rep.goto(`${BASE}/admin/playbook`)).status() === 403, 'comercial no accede al panel del líder');

  assert(errors.length === 0, `sin errores JS ${errors}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
