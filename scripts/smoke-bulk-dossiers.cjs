/**
 * Smoke de «varias a la vez» en Propuestas: «Seleccionar» → casillas y barra; elegir unas, cambiar el responsable,
 * archivarlas y sacarlas del archivo; «Seleccionar todas»; un comercial no ve «Cambiar responsable».
 *   npm run build && npm run start:demo ; node scripts/smoke-bulk-dossiers.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const login = async (who) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
    await p.goto(`${BASE}/admin/login`); await p.click(`[data-testid="demo-${who}"]`); await p.waitForURL(/\/admin/);
    return p;
  };
  const p = await login('admin@enjoy.test');
  await p.goto(`${BASE}/admin?autor=todos`);
  const total = await p.locator('[data-testid=bulk-check]').count();
  assert(total >= 3 && !(await p.isVisible('[data-testid=bulk-check]')) && !(await p.isVisible('[data-testid=bulk-bar]')), `sin seleccionar: ni casillas ni barra (${total} propuestas)`);
  await p.click('[data-testid=bulk-start]');
  assert(await p.isVisible('[data-testid=bulk-bar]') && await p.isVisible('[data-testid=bulk-check] >> nth=0'), '«Seleccionar»: casillas y barra');
  assert(await p.isDisabled('[data-testid=bulk-archive]'), 'sin nada marcado, los botones no hacen nada');
  // Clic en la tarjeta: la marca (no la abre).
  await p.locator('[data-testid=dossier-list] li a').nth(0).click();
  await p.locator('[data-testid=dossier-list] li a').nth(1).click();
  assert(/\/admin\?/.test(p.url()) && (await p.textContent('[data-testid=bulk-count]')).includes('2'), `dos marcadas al pulsar las tarjetas (${(await p.textContent('[data-testid=bulk-count]')).trim()})`);
  assert(await p.isDisabled('[data-testid=bulk-assign]'), '«Cambiar» espera a que se elija a quién');
  const opts = await p.locator('[data-testid=bulk-owner] option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })).filter((o) => o.v));
  const target = opts[opts.length - 1];
  await p.selectOption('[data-testid=bulk-owner]', target.v);
  const ids = await p.locator('[data-testid=bulk-check]:checked').evaluateAll((xs) => xs.map((x) => x.value));
  await Promise.all([p.waitForURL(/bulk=/), p.click('[data-testid=bulk-assign]')]);
  assert((await p.textContent('main')).includes('Hecho'), `responsable cambiado: ${(await p.locator('[data-testid=alert-success]').textContent().catch(() => '')).trim()}`);
  await p.goto(`${BASE}/admin?autor=${target.v}`);
  const theirs = await p.locator('[data-testid=bulk-check]').evaluateAll((xs) => xs.map((x) => x.value));
  assert(ids.every((id) => theirs.includes(id)), `las dos son ahora de ${target.t}`);
  // Archivar y sacar del archivo.
  await p.click('[data-testid=bulk-start]');
  await p.check(`[data-testid=bulk-check][value="${ids[0]}"]`);
  await Promise.all([p.waitForURL(/bulk=/), p.click('[data-testid=bulk-archive]')]);
  assert((await p.locator(`[data-group=archived] [data-testid=bulk-check][value="${ids[0]}"]`).count()) === 1, 'archivada');
  await p.click('[data-testid=bulk-start]');
  await p.click('[data-group=archived] [data-testid=bulk-group]');
  await Promise.all([p.waitForURL(/bulk=/), p.click('[data-testid=bulk-unarchive]')]);
  assert((await p.locator('[data-group=archived]').count()) === 0, 'fuera del archivo (como borrador)');
  // Seleccionar todas.
  await p.click('[data-testid=bulk-start]');
  await p.click('[data-testid=bulk-all]');
  assert((await p.locator('[data-testid=bulk-check]:checked').count()) === (await p.locator('[data-testid=bulk-check]').count()), '«Seleccionar todas»');
  await p.click('[data-testid=bulk-cancel]');
  assert(!(await p.isVisible('[data-testid=bulk-bar]')) && (await p.locator('[data-testid=bulk-check]:checked').count()) === 0, '«Cancelar» quita la selección');
  // Un comercial: archivar sí, cambiar responsable no.
  const r = await login('rep@enjoy.test');
  await r.goto(`${BASE}/admin`);
  if (await r.locator('[data-testid=bulk-start]').count()) {
    await r.click('[data-testid=bulk-start]');
    assert(await r.isVisible('[data-testid=bulk-archive]') && !(await r.locator('[data-testid=bulk-owner]').count()), 'comercial: sin «Cambiar responsable»');
  } else assert(true, 'comercial sin propuestas');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
