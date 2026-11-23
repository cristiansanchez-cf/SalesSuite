/**
 * Smoke de la cualificación de buceo (Oquea; docs/CRM_DINAMICO.md §47). Con DEMO_DIVING=1, el espacio de prueba
 * («re-tema», en retheme.localhost) es como Oquea: Centros y operadores · ONGs y clubs · Instructores, y la
 * cualificación de buceo. Se da de alta un centro, se marca qué es y sus señales (un clic cada una) y se comprueba la
 * nota, el nivel, cómo entrar y el siguiente paso; un instructor con dónde trabaja (fijo, colabora o dueño); la lista
 * y el mapa. Enjoy, en el mismo servidor, sigue con lo suyo.
 *   npm run build && DEMO_MODE=1 DEMO_DIVING=1 DEV_TENANT_SLUG=enjoy node ./dist/server/entry.mjs ; node scripts/smoke-diving.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const ALT = BASE.replace(/\/\/[^:/]+/, '//retheme.localhost');
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const NIGHT = /discoteca|\bDJs?\b|pantalla|promotora|aforo|ocio nocturno/i;

(async () => {
  const b = await chromium.launch();
  const login = async (base, email) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'es-ES' })).newPage();
    await p.goto(`${base}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  const rep = await login(ALT, 'rep@retheme.test');
  const create = async (name, kind) => {
    await rep.goto(`${ALT}/admin/accounts?ver=all`);
    await rep.click('[data-testid=add-open]'); await rep.click('[data-testid=new-account]');
    await rep.fill('[data-testid=new-account-form] [name=name]', name);
    if (kind) await rep.selectOption('[data-testid=new-account-kind]', kind);
    await rep.click('[data-testid=new-account-form] button[type=submit]');
    await rep.waitForURL(/\/admin\/accounts\/[^/?]+\?ok=created/);
    return new URL(rep.url()).pathname.split('/').pop();
  };
  const post = (id, set) => rep.evaluate(async ([u, s]) => (await fetch(u, { method: 'POST', body: new URLSearchParams({ action: 'qualify', set: s }), redirect: 'manual' })).type, [`/admin/accounts/${id}`, set]);

  // Un centro: la tarjeta de buceo, sin nada de la noche.
  const centro = await create(`Centro Smoke ${RUN}`);
  assert((await rep.getAttribute('[data-testid=qualification]', 'data-pack')) === 'diving', 'ficha: cualificación de buceo');
  const text = await rep.evaluate(() => document.querySelector('main')?.innerText ?? '');
  assert(!NIGHT.test(text), `ficha: nada de la noche (${(NIGHT.exec(text) ?? [''])[0]})`);
  assert(await rep.isVisible('[data-testid=qual-dv_segment-centro]') && !(await rep.locator('[data-testid=qual-dv_segment-ong]').count()), 'qué es: los de cliente (ONG y club van en su pestaña)');

  // Un clic: qué es (se guarda al instante).
  await rep.click('[data-testid=qual-dv_segment-centro]');
  await rep.waitForSelector('[data-testid=qual-status][data-state=saved]');
  await rep.reload();
  assert(await rep.isVisible('[data-testid=qual-dv_agency-yes]') && !(await rep.locator('[data-testid=qual-dv_ticket-high]').count()), 'centro: sus preguntas (no las de premium)');

  // Las señales de un centro bueno: 25 (A) + 40 (B) + 15 (C) + 10 (D) = 90 → nivel A.
  for (const s of ['dv_web:priority', 'dv_no_booking:yes', 'dv_contact_basic:yes', 'dv_no_loyalty:yes', 'dv_agency:yes', 'dv_courses_and_trips:yes', 'dv_touristic:yes', 'dv_boat_or_team:yes', 'dv_reviews:many', 'dv_owner_name:yes', 'dv_direct_contact:yes']) {
    assert((await post(centro, s)) === 'opaqueredirect', `marca ${s}`);
  }
  await rep.reload();
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '90' && (await rep.getAttribute('[data-testid=qualification]', 'data-level')) === 'a', 'nota 90 y nivel A');
  assert(/red internacional/.test(await rep.textContent('[data-testid=dive-angle]')) && /48 h/.test(await rep.textContent('[data-testid=dive-action]')), 'cómo entrar y siguiente paso del nivel A');
  assert((await rep.getAttribute('[data-testid=summary-level]', 'data-level')) === 'a', 'resumen arriba: nivel A');
  // Ajuste: ya usa un software (−10) → 80, sigue en A, con su etiqueta.
  await post(centro, 'dv_has_software:yes');
  await rep.reload();
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '80' && /Tiene software/.test(await rep.textContent('[data-testid=dive-tags]')), 'ajuste −10 y etiqueta');
  // Pulsar lo marcado lo quita.
  await rep.click('[data-testid=qual-dv_has_software-yes]');
  await rep.waitForSelector('[data-testid=qual-status][data-state=saved]');
  await rep.reload();
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '90', 'desmarcar vuelve a 90');
  // Lo de Enjoy no se guarda aquí.
  assert((await post(centro, 'screens:yes')) !== 'opaqueredirect', 'una pregunta de ocio nocturno no se guarda');
  if (OUT) await rep.screenshot({ path: `${OUT}/diving-account.png`, fullPage: true });

  // La lista: nivel y nota.
  await rep.goto(`${ALT}/admin/accounts?ver=all&q=${encodeURIComponent(`Centro Smoke ${RUN}`)}`);
  assert((await rep.getAttribute('[data-testid=dive-level]', 'data-level')) === 'a', 'lista: nivel A');

  // Un instructor: «¿Puede vendernos?» y dónde trabaja (fijo, colabora o dueño).
  const ins = await create(`Instructor Smoke ${RUN}`, 'instructor');
  assert(/vendernos/.test(await rep.textContent('[data-testid=qualification] h2')), 'instructor: su tarjeta');
  const insText = await rep.evaluate(() => document.querySelector('main')?.innerText ?? '');
  assert(!NIGHT.test(insText), `instructor: nada de la noche (${(NIGHT.exec(insText) ?? [''])[0]})`);
  await rep.click('[data-testid=qual-dv_specialty-technical]');
  await rep.waitForSelector('[data-testid=qual-status][data-state=saved]');
  await rep.click('[data-testid=qual-dv_specialty-cave]');
  await rep.waitForSelector('[data-testid=qual-status][data-state=saved]');
  await post(ins, 'dv_seller:yes');
  await rep.reload();
  assert((await rep.getAttribute('[data-testid=qual-dv_specialty-technical]', 'aria-pressed')) === 'true' && (await rep.getAttribute('[data-testid=qual-dv_specialty-cave]', 'aria-pressed')) === 'true', 'instructor: técnico y cuevas (varios)');
  assert((await rep.textContent('[data-testid=qual-score]')).trim() === '40', 'instructor: nos vendería → 40');
  const roles = await rep.locator('[data-testid=work-links] select[name=role] option').allTextContents();
  assert(['Fijo', 'Colabora', 'Dueño'].every((r) => roles.includes(r)) && !roles.includes('Residente'), `dónde trabaja: ${roles.join(', ')}`);
  if (OUT) await rep.screenshot({ path: `${OUT}/diving-instructor.png`, fullPage: true });

  // El mapa: la leyenda son los tipos de Oquea.
  await rep.goto(`${ALT}/admin/accounts/mapa?ver=all`);
  assert(/Centro u operador/.test(await rep.textContent('[data-testid=map-kinds]')), 'mapa: leyenda con los tipos de buceo');

  // Enjoy, igual que siempre.
  const enjoy = await login(BASE, 'rep@enjoy.test');
  await enjoy.goto(`${BASE}/admin/accounts?ver=all&q=Club%20Sol`);
  await enjoy.click('[data-testid=account] a');
  await enjoy.waitForSelector('[data-testid=qualification]');
  assert((await enjoy.getAttribute('[data-testid=qualification]', 'data-pack')) === null && await enjoy.isVisible('[data-testid=summary-fit]'), 'Enjoy: su cualificación de siempre');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
