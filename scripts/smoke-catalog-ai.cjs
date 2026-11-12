/**
 * Smoke del catálogo con tu IA (docs/CATALOG_AI.md): el admin copia el prompt, pega lo que devuelve su IA, revisa y se
 * crean borradores (sin publicar); luego «Pídele un cambio» en un módulo y lo deshace. Con AI_RESEARCH_FIXTURE=1.
 *   npm run build && DEMO_MODE=1 AI_RESEARCH_FIXTURE=1 node dist/server/entry.mjs ; node scripts/smoke-catalog-ai.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const port = new URL(BASE).port || '4321';
const S = `http://sciscreen.localhost:${port}`;
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${S}/admin/login`);
  await p.click('[data-testid="demo-super@cofundo.test"]');
  await p.waitForLoadState('load');

  // 1. Desde el catálogo, «Cámbialo con tu IA»: el prompt lleva los tipos (y los especiales que ya usa) y lo que tiene.
  await p.goto(`${S}/admin/catalog`);
  assert(await p.isVisible('[data-testid=catalog-ai-link]'), 'el catálogo enlaza «Cámbialo con tu IA»');
  await p.click('[data-testid=catalog-ai-link]');
  await p.waitForSelector('[data-testid=kit-prompt]');
  const prompt = await p.inputValue('[data-testid=kit-prompt]');
  assert(/### tabs-showcase/.test(prompt) && /### site-verify/.test(prompt) && !/### live-screen/.test(prompt), 'tipos generales y los especiales que ya usa (no los de otros productos)');
  assert(prompt.includes('key "su-web"') && prompt.includes('peticiones'), 'lleva su catálogo y cómo devolverlo');
  if (OUT) await p.screenshot({ path: `${OUT}/catalog-ai-kit.png`, fullPage: true });

  // 2. Pega la respuesta de su IA (con texto alrededor): revisar → nuevo, cambia, no vale y peticiones.
  const answer = 'Aquí tienes los módulos:\n```json\n' + JSON.stringify({
    modules: [
      { key: 'portada', block_type: 'hero-pitch', name: 'Portada', props: { eyebrow: 'Propuesta para {company}', title: 'Lo que afirmas, con la evidencia a la vista', subtitle: 'Revisado contra la literatura científica.', rotatingWords: [], ctas: [], stats: [] } },
      { key: 'que-revisamos', block_type: 'tabs-showcase', name: 'Qué revisamos', description: 'Las tres partes del dictamen', props: { title: 'Qué revisamos', tabs: [{ label: 'Afirmaciones', title: 'Cada afirmación', body: 'Una a una, contra los estudios.', bullets: ['Con su fuente'] }] } },
      { key: 'roto', block_type: 'tabs-showcase', name: 'Roto', props: { tabs: 'no' } },
    ],
    peticiones: ['Una animación del escaneo del producto'],
  }, null, 2) + '\n```\n¿Quieres que cambie algo?';
  await p.fill('[data-testid=kit-answer]', answer);
  await p.click('[data-testid=kit-review-btn]');
  await p.waitForSelector('[data-testid=kit-review]');
  const acts = await p.$$eval('[data-testid=kit-row]', (els) => els.map((e) => `${e.dataset.key}:${e.dataset.action}`));
  assert(JSON.stringify(acts) === JSON.stringify(['portada:update', 'que-revisamos:new', 'roto:invalid']), `revisar: ${acts.join(', ')}`);
  assert((await p.textContent('[data-testid=kit-requests]')).includes('animación del escaneo'), 'lo que no encaja sale como petición para nosotros');
  if (OUT) await p.screenshot({ path: `${OUT}/catalog-ai-review.png`, fullPage: true });
  await p.click('[data-testid=kit-import]');
  await p.waitForURL(/\/admin\/catalog\?ok=kit/);
  assert((await p.textContent('[role=status]')).includes('2 borradores'), 'crea 2 borradores');
  const draftOf = (key) => p.$eval(`[data-module-key="${key}"]`, (el) => [...el.querySelectorAll('tbody tr')].some((tr) => /Borrador/i.test(tr.textContent)));
  assert(await draftOf('portada') && await draftOf('que-revisamos'), 'quedan como borradores: no se publica nada solo');

  // 3. «Pídele un cambio» en el borrador de la portada: cambia, se ve qué, y se deshace.
  const draftHref = await p.$eval('[data-module-key="portada"]', (el) => [...el.querySelectorAll('tbody tr')].find((tr) => /Borrador/i.test(tr.textContent)).querySelector('a').getAttribute('href'));
  await p.goto(`${S}${draftHref}`);
  await p.fill('[data-testid=ai-instruction]', 'cambia «evidencia» por «prueba»');
  await p.click('[data-testid=ai-ask-btn]');
  await p.waitForSelector('[data-testid=ai-result]');
  assert((await p.textContent('[data-testid=ai-result]')).includes('prueba'), 'el cambio se guarda en el borrador y dice qué ha cambiado');
  assert((await p.inputValue('[data-testid=props]')).includes('con la prueba a la vista'), 'el contenido ya lo lleva');
  if (OUT) await p.screenshot({ path: `${OUT}/catalog-ai-change.png`, fullPage: true });
  await p.click('[data-testid=ai-undo]');
  await p.waitForSelector('[data-testid=ai-result]');
  assert((await p.inputValue('[data-testid=props]')).includes('con la evidencia a la vista'), 'deshacer lo deja como estaba');

  // 4. En una versión publicada, el cambio va a un borrador nuevo (la publicada no se toca).
  await p.goto(`${S}/admin/catalog`);
  const pubHref = await p.$eval('[data-module-key="el-sello"]', (el) => [...el.querySelectorAll('tbody tr')].find((tr) => /Publicad/i.test(tr.textContent)).querySelector('a').getAttribute('href'));
  await p.goto(`${S}${pubHref}`);
  await p.fill('[data-testid=ai-instruction]', 'cambia «sello» por «distintivo»');
  await p.click('[data-testid=ai-ask-btn]');
  await p.waitForSelector('[data-testid=ai-result]');
  assert(new URL(p.url()).pathname !== pubHref, 'desde una publicada, el cambio queda en una versión nueva (borrador)');
  assert(await p.isEnabled('[data-testid=props]'), 'y se puede seguir editando el borrador');

  // 5. Instrucciones largas: no (es para cambios pequeños).
  await p.fill('[data-testid=ai-instruction]', '');
  await p.evaluate(() => { const t = document.querySelector('[data-testid=ai-instruction]'); t.removeAttribute('maxlength'); t.value = 'x'.repeat(500); });
  await p.click('[data-testid=ai-ask-btn]');
  await p.waitForLoadState('load');
  assert(/Como mucho 400/.test(await p.textContent('body')), 'una instrucción larga se rechaza: un cambio pequeño cada vez');

  assert(errors.length === 0, `sin errores de JS (${errors.join(' | ')})`);
  await b.close();
})();
