/**
 * Smoke de la investigación con IA (docs/CRM_DINAMICO.md §13), con la respuesta fija de pruebas (AI_RESEARCH_FIXTURE=1,
 * sin llamar a la IA): investigar desde la ficha, propuestas con su fuente, aceptar (va a la ficha) y descartar.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-ai-research.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/accounts?ver=all&q=Terraza%20Azahar`);
  await p.click('[data-testid=account][data-name="Terraza Azahar"] a.co-row__main');
  await p.waitForURL(/\/admin\/accounts\/[^/?#]+/);

  const card = '[data-testid=ai-research]';
  assert((await p.textContent(card)).includes('Nada se guarda en la ficha hasta que lo aceptes'), 'antes de investigar: qué hace y que nada se guarda solo');
  await Promise.all([p.waitForURL(/ok=ai/), p.click('[data-testid=ai-run]')]);
  assert((await p.textContent(card)).includes('Sin verificar'), 'marcado «sin verificar»');
  assert((await p.textContent('[data-testid=ai-summary]')).includes('Ejemplo de prueba'), 'resumen');
  const keys = await p.$$eval('[data-testid=ai-suggestion]', (xs) => xs.map((x) => x.getAttribute('data-key')));
  assert(JSON.stringify(keys) === JSON.stringify(['nights', 'screens', 'email', 'person']), `solo lo que tiene prueba y fuente (${keys})`);
  assert(await p.isVisible('[data-testid=ai-suggestion][data-key=nights] a[href^="https://example.com/"]'), 'cada propuesta con su fuente');
  if (OUT) await p.screenshot({ path: `${OUT}/ai-research.png`, fullPage: true });

  await Promise.all([p.waitForURL(/ok=aiAccept/), p.click('[data-testid=ai-suggestion][data-key=nights] [data-testid=ai-accept]')]);
  assert((await p.getAttribute('[data-testid="qual-nights-3"]', 'aria-pressed')) === 'true', 'aceptar: la cualificación queda marcada');
  await Promise.all([p.waitForURL(/ok=aiAccept/), p.click('[data-testid=ai-suggestion][data-key=email] [data-testid=ai-accept]')]);
  assert(await p.isVisible('[data-testid=contact-links] a[href="mailto:hola@ejemplo.test"]'), 'aceptar: el email va al contacto de la empresa');
  await Promise.all([p.waitForURL(/ok=aiDismiss/), p.click('[data-testid=ai-suggestion][data-key=screens] [data-testid=ai-dismiss]')]);
  assert((await p.getAttribute('[data-testid="qual-screens-yes"]', 'aria-pressed')) !== 'true', 'descartar no toca la ficha');
  assert((await p.textContent('[data-testid=ai-decided]')).includes('2 aceptadas · 1 descartadas'), 'cuenta lo decidido');
  assert((await p.$$('[data-testid=ai-suggestion]')).length === 1, 'queda la persona por decidir');

  // Volver a investigar en seguida: no se gasta dos veces.
  await p.click('[data-testid=ai-run]');
  await p.waitForLoadState('load');
  assert((await p.textContent('body')).includes('Se acaba de investigar'), 'no se investiga dos veces seguidas');
  if (OUT) await p.screenshot({ path: `${OUT}/ai-research-after.png`, fullPage: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
