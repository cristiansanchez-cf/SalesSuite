/**
 * Smoke de la configuración con IA (docs/SETUP_WIZARD.md §Con IA): prompt para su ChatGPT/Claude → pegar lo que
 * devuelva → revisar (qué se añade, qué ya estaba) → importar → el bloque siguiente; al final, «comprueba» e invitar.
 *   npm run build && npm run start:demo ; node scripts/smoke-setup-ai.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'es-ES' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  await p.goto(`${BASE}/admin/setup`);
  assert(await p.isVisible('[data-testid=setup-ai]'), 'configuración: «con IA» como primera opción');

  await p.goto(`${BASE}/admin/setup/ia?b=mercado`);
  const prompt = await p.inputValue('[data-testid=ai-prompt]');
  assert(prompt.includes('Eres el asistente de') && prompt.includes('```json') && prompt.includes('"actores"'), 'prompt listo para copiar, con el formato');
  if (OUT) await p.screenshot({ path: `${OUT}/setup-ai-prompt.png`, fullPage: true });

  const RUN = Date.now().toString(36);
  const answer = `¡Perfecto! Aquí lo tienes:\n\`\`\`json\n${JSON.stringify({ sectores: [
    { nombre: 'Ocio nocturno', actores: [{ nombre: 'Dueño', papel: 'decisor' }] },
    { nombre: `Hoteles ${RUN}`, cliente_ideal: 'Hoteles con terraza y más de 80 habitaciones.', actores: [{ nombre: 'Director', papel: 'quien decide' }, { nombre: 'Recepción', papel: 'guardián', puede_frenar: 'Si le da trabajo extra.' }] },
  ] })}\n\`\`\`\nSi quieres, seguimos con las jugadas.`;
  await p.fill('[data-testid=ai-answer]', answer);
  await p.click('[data-testid=ai-review]');
  await p.waitForSelector('[data-testid=ai-preview]');
  const pv = await p.textContent('[data-testid=ai-preview]');
  assert(pv.includes(`Sector Hoteles ${RUN}`) && pv.includes('Recepción') && pv.includes('guardian'), 'revisar: qué se va a añadir (papel entendido)');
  assert(/ya la?s? tenías/.test(pv), 'revisar: lo que ya estaba no se toca');
  if (OUT) await p.screenshot({ path: `${OUT}/setup-ai-preview.png`, fullPage: true });
  await p.click('[data-testid=ai-import]');
  await p.waitForURL(/b=situaciones&n=\d+/);
  assert((await p.textContent('[role=status]')).includes('importadas'), 'importado → siguiente bloque');
  await p.goto(`${BASE}/admin/setup?step=2`);
  assert((await p.textContent('main')).includes(`Hoteles ${RUN}`), 'el sector importado está en su sitio');

  // formato equivocado → explicado, sin romper
  await p.goto(`${BASE}/admin/setup/ia?b=precios`);
  await p.fill('[data-testid=ai-answer]', 'no sé, dime tú');
  await p.click('[data-testid=ai-review]');
  assert((await p.textContent('main')).includes('No encuentro el bloque JSON'), 'sin JSON → qué hacer');

  await p.goto(`${BASE}/admin/setup/ia?b=listo`);
  assert(await p.isVisible('[data-testid=ai-check]') && await p.isVisible('[data-testid=ai-next]'), 'al final: comprueba y primer comercial');
  if (OUT) await p.screenshot({ path: `${OUT}/setup-ai-done.png`, fullPage: true });
  await b.close();
})();
