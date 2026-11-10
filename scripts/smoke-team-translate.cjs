/**
 * Smoke de «Traducir» lo que escribe el equipo (modo DEMO, docs/I18N.md §Lo que escribe el equipo):
 *   npm run build && DEMO_MODE=1 DEV_TENANT_SLUG=enjoy AI_RESEARCH_FIXTURE=1 PORT=4321 npm start
 *   node scripts/smoke-team-translate.cjs     (BASE_URL=http://127.0.0.1:4321)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const ACC = '00000000-0000-4000-8000-0000000ac001';
const KO = '사장님이 다음 주에 다시 연락 달라고 했어요';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let calls = 0;
  p.on('request', (r) => { if (r.url().endsWith('/admin/api/translate') && JSON.parse(r.postData() || '{}').translate === true) calls++; });

  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts/${ACC}`);
  await p.waitForTimeout(800);
  assert(await p.isHidden('[data-testid=ugc-translate]'), 'todo en español: no hay botón');

  // Un compañero coreano apunta un dato en coreano.
  await p.fill('[data-testid=fact-text]', KO);
  await p.click('[data-testid=fact-add]');
  await p.waitForSelector(`[data-ugc]:has-text("${KO}")`);
  await p.waitForSelector('[data-testid=ugc-translate]:not([hidden])');
  assert((await p.textContent('[data-testid=ugc-translate]')).includes('Traducir al español (1)'), 'aparece «Traducir al español (1)»');
  await p.click('[data-testid=ugc-translate]');
  await p.waitForSelector(`[data-ugc]:has-text("[es] ${KO}")`);
  assert((await p.getAttribute(`[data-ugc]:has-text("[es] ${KO}")`, 'title')).includes(KO), 'traducido, con el original al pasar por encima');
  assert((await p.textContent('[data-testid=ugc-translate]')).includes('Ver original'), 'después: «Ver original»');
  await p.click('[data-testid=ugc-translate]');
  assert(await p.isVisible(`[data-ugc]:text-is("${KO}")`), '«Ver original» vuelve al coreano');
  if (OUT) await p.screenshot({ path: `${OUT}/team-translate.png` });

  // Otra vez (o cualquier compañero): ya traducido, sin volver a llamar a la IA.
  await p.reload();
  await p.waitForSelector(`[data-ugc]:has-text("[es] ${KO}")`);
  assert(calls === 1, `traducido una sola vez y guardado (${calls} llamada)`);

  // Se deja como estaba.
  await p.locator(`li[data-testid=fact]:has([data-ugc]) form button`).last().click().catch(() => {});
  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
