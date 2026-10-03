/**
 * Smoke E2E de «Qué ha funcionado» (modo DEMO, docs/EVIDENCE.md): situación de la cuenta, cierre documentado,
 * recomendaciones en situaciones parecidas (página, guion del dossier y Preparar mensaje).
 *   npm run build && npm run start:demo ; node scripts/smoke-evidence.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  const settle = () => p.waitForFunction(() => !document.querySelector('[data-testid=builder][data-busy]'));
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(`${BASE}/admin`);

  // ---- qué ha funcionado: la situación ordena los cierres
  await p.goto(`${BASE}/admin/wins`);
  assert((await p.$$('[data-testid=story]')).length === 5, 'cinco cierres de ejemplo');
  await p.locator('[data-testid=situation-form] label.co-chip', { hasText: 'Locales de ocio nocturno' }).click();
  await p.locator('[data-testid=situation-form] label.co-chip', { hasText: 'Analítico' }).click();
  await p.click('[data-testid=situation-go]');
  await p.waitForURL(/segment=/);
  assert((await p.locator('[data-testid=story]').first().textContent()).includes('Club Aurora'), 'el cierre más parecido primero');
  assert((await p.textContent('[data-testid=win-plays]')).includes('ganadas'), 'jugadas que más ganan en situaciones así');
  assert((await p.$$('[data-testid=story][data-outcome=lost]')).length >= 1, 'también lo que no funcionó');
  if (OUT) await p.screenshot({ path: `${OUT}/wins.png`, fullPage: true });

  // ---- dossier con situación
  await p.goto(`${BASE}/admin`);
  await p.click('[data-testid=new-dossier]');
  await p.fill('[data-testid=create-form] [name=title]', `Club Prueba ${RUN}`);
  await p.fill('[data-testid=create-form] [name=prospectCompany]', `Club Prueba ${RUN}`);
  await p.click('[data-testid=create-form] button[type=submit]');
  await p.waitForURL(/\/admin\/dossiers\//);
  const url = p.url();
  await p.click('[data-testid=add-tabs-locales]'); await settle();
  await p.selectOption('[data-testid=segment]', { label: 'Locales de ocio nocturno' }); await settle();
  await p.click('[data-testid=facet-region-madrid]'); await settle();
  await p.click('[data-testid=facet-rasgos-local-dj]'); await settle();
  assert((await p.getAttribute('[data-testid=facet-rasgos-local-dj]', 'aria-pressed')) === 'true', 'rasgos de la cuenta marcados');
  await p.fill('[data-testid=contact-name]', 'DJ Leo');
  await p.selectOption('[data-testid=contact-persona]', { label: 'DJ residente (puede vetar)' });
  await p.click('[data-testid=add-contact]'); await settle();
  await p.selectOption('[data-testid=contact] [data-testid=trait-personalidad]', 'analitico'); await settle();
  await p.click('[data-testid=tab-script]');
  await p.waitForSelector('[data-testid=similar]');
  assert((await p.textContent('[data-testid=similar]')).includes('Club Aurora'), 'guion: «en situaciones parecidas» con cierres del equipo');

  // ---- ganado → documentar el cierre (prerrellenado)
  await p.selectOption('[data-testid=outcome]', 'won');
  await p.waitForURL(/\/debrief\?outcome=won/);
  assert(await p.isChecked('[data-testid=debrief-facet-personalidad] input[value=analitico]'), 'situación prerrellenada desde la cuenta y sus personas');
  assert(await p.isChecked('[data-testid=debrief-form] input[name=outcome][value=won]'), 'resultado prerrellenado');
  await p.click('[data-testid=debrief-form] button[type=submit]');
  assert((await p.textContent('[role=alert]')).includes('Cuenta qué funcionó'), 'ganado sin «qué funcionó» → se pide (rechazo, no fallo)');
  await p.fill('[name=whatWorked]', `Le dejé al DJ elegir qué peticiones suenan ${RUN}`);
  await p.locator('[data-testid=debrief-form] input[name=playIds]').first().check();
  await p.click('[data-testid=debrief-form] button[type=submit]');
  await p.waitForURL(/\/admin\/wins\?ok=story/);
  assert((await p.textContent('[role=status]')).includes('ya cuenta para el equipo'), 'cierre compartido con el equipo');
  assert((await p.textContent('[data-testid=stories]')).includes(RUN), 'el cierre aparece en Qué ha funcionado');
  if (OUT) await p.screenshot({ path: `${OUT}/wins-after.png`, fullPage: false });
  await p.goto(url);
  assert((await p.textContent('[data-testid=debrief-cta]')).includes('Revisar lo que funcionó'), 'el dossier sabe que ya está documentado');

  // ---- preparar mensaje con evidencia
  await p.goto(`${BASE}/admin/compose?persona=00000000-0000-4000-8000-0000009e0008&go=1&sit=1&facet:personalidad=analitico`);
  assert((await p.textContent('[data-testid=compose-evidence]')).includes('Club Aurora'), 'Preparar mensaje: lo que le funcionó al equipo');
  const prompt = await p.inputValue('[data-testid=prompt]');
  assert(prompt.includes('LO QUE LE HA FUNCIONADO AL EQUIPO') && prompt.includes('sepáralo'), 'la petición al Cerebro separa la experiencia del equipo');
  assert(prompt.includes('SITUACIÓN: Tipo de personalidad: Analítico'), 'la situación va en el contexto');

  assert(errors.length === 0, `sin errores JS (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
