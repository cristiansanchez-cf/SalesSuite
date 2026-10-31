/**
 * Smoke de marca blanca (modo DEMO, docs/CRM_DINAMICO.md §45): un espacio sin cualificación (el de prueba «re-tema»,
 * en retheme.localhost) da de alta una empresa y su ficha no enseña Cualificación, nota ni «Le encaja», ni nada de la
 * noche (locales, DJs, pantallas…). Enjoy, en el mismo servidor, sigue con su cualificación.
 *   npm run build && DEMO_MODE=1 DEV_TENANT_SLUG=enjoy node ./dist/server/entry.mjs ; node scripts/smoke-white-label.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
// El mismo servidor, con el host del espacio de prueba (Chromium resuelve *.localhost a esta máquina).
const ALT = BASE.replace(/\/\/[^:/]+/, '//retheme.localhost');
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const NIGHT = /discoteca|\bDJs?\b|pantalla|promotora|aforo|ocio nocturno|Cualificaci[oó]n|Club Sol|Gecko/i;

(async () => {
  const b = await chromium.launch();
  const login = async (base, email) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await p.goto(`${base}/admin/login`);
    await p.click(`[data-testid="demo-${email}"]`);
    await p.waitForURL(/\/admin/);
    return p;
  };
  // El texto que se ve (sin los diálogos cerrados ni los scripts).
  const visible = (p) => p.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);

  const rep = await login(ALT, 'rep@retheme.test');
  await rep.goto(`${ALT}/admin/accounts?ver=all`);
  assert(!(await rep.isVisible('[data-testid=filter-order]')) && (await rep.locator('[data-testid=filter-order]').count()) === 0, 'lista: sin ordenar por prioridad');
  assert((await rep.locator('[data-testid=filter-quality] option[value=sin]').count()) === 0, 'lista: sin «sin cualificar»');
  assert((await rep.getAttribute('[data-testid=new-account-form] [name=name]', 'placeholder')) === 'Empresa Ejemplo', 'alta: ejemplo neutro');

  // Alta de una empresa: lleva a su ficha.
  await rep.click('[data-testid=add-open]'); await rep.click('[data-testid=new-account]');
  await rep.fill('[data-testid=new-account-form] [name=name]', `Empresa Smoke ${RUN}`);
  await rep.click('[data-testid=new-account-form] button[type=submit]');
  await rep.waitForURL(/\/admin\/accounts\/[^/?]+\?ok=created/);
  assert(await rep.isVisible('[data-testid=account-summary]'), 'ficha con resumen');
  for (const t of ['qualification', 'summary-score', 'summary-fit', 'group-locales', 'work-links']) assert((await rep.locator(`[data-testid=${t}]`).count()) === 0, `ficha: sin ${t}`);
  assert((await rep.locator('[data-testid=summary-jump] a[href="#qual"]').count()) === 0, 'ficha: sin salto a Cualificación');
  const text = await visible(rep);
  assert(!NIGHT.test(text), `ficha: nada de la noche (${(NIGHT.exec(text) ?? [''])[0]})`);
  if (OUT) await rep.screenshot({ path: `${OUT}/white-label-account.png`, fullPage: true });
  // Marcar algo de la cualificación a mano no vale (solo el tamaño, el de «Generar pago»).
  const id = new URL(rep.url()).pathname.split('/').pop();
  const posted = await rep.evaluate(async (u) => (await fetch(u, { method: 'POST', body: new URLSearchParams({ action: 'qualify', set: 'screens:yes' }), redirect: 'manual' })).type, `/admin/accounts/${id}`);
  assert(posted !== 'opaqueredirect', `cualificar sin paquete no se guarda (${posted})`);

  // El mapa: la leyenda son los tipos del espacio, sin «Local o sala» ni «Promotora».
  await rep.goto(`${ALT}/admin/accounts/mapa?ver=all`);
  const legend = await rep.textContent('[data-testid=map-kinds]');
  assert(!/Local o sala|Promotora|Conciertos/.test(legend) && /Empresa/.test(legend), `mapa: leyenda con los tipos del espacio (${legend.replace(/\s+/g, ' ').trim()})`);
  assert((await rep.locator('[data-testid=map-temp] option[value=caliente]').count()) === 0, 'mapa: sin «calientes»');

  // Enjoy, igual que siempre: su ficha tiene cualificación y nota.
  const enjoy = await login(BASE, 'rep@enjoy.test');
  await enjoy.goto(`${BASE}/admin/accounts?ver=all&q=Club%20Sol`);
  await enjoy.click('[data-testid=account] a');
  await enjoy.waitForSelector('[data-testid=qualification]');
  assert(await enjoy.isVisible('[data-testid=summary-score]'), 'Enjoy: nota en el resumen y tarjeta de cualificación');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
