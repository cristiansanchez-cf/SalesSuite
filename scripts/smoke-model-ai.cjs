/**
 * Smoke de «Cambiar el modelo con IA» (docs/PAQUETES.md §Con IA): el admin lo cuenta («mediano a 35, nuevo paquete
 * Bebidas…, quitamos Álbum»), revisa lo que propone (lo que cambia en cada paquete y por qué), desmarca uno y aplica:
 * solo cambia lo marcado. Con AI_RESEARCH_FIXTURE=1 (sin IA).
 *   npm run build && npm run start:demo ; node scripts/smoke-model-ai.cjs   (deja la demo cambiada: reiniciar después)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);
  await p.goto(`${BASE}/admin/prices`);
  await p.click('[data-testid=packages-ai]');
  await p.waitForURL(/\/admin\/prices\/ia/);
  await p.fill('[data-testid=model-ai-text]', 'Ponemos el mediano a 35. Nuevo paquete Bebidas: carta en el móvil, pedidos a 30. Quitamos Álbum.');
  await Promise.all([p.waitForSelector('[data-testid=model-ai-plan], [data-testid=model-ai-nothing]'), p.click('[data-testid=model-ai-run]')]);
  const acts = await p.$$eval('[data-testid=model-ai-change]', (els) => els.map((e) => e.dataset.action));
  assert(acts.filter((a) => a === 'update').length === 3 && acts.includes('create') && acts.includes('deactivate'), `propone: ${acts.join(', ')}`);
  const upd = await p.locator('[data-testid=model-ai-change][data-action=update]').first().textContent();
  assert(/Mediano:\s*25(,00)?\s*€\s*→\s*35(,00)?\s*€/.test(upd.replace(/ /g, ' ')), 'enseña qué cambia (mediano 25 € → 35 €)');
  // Desmarcar «se desactiva Álbum»: no se aplica.
  await p.locator('[data-testid=model-ai-change][data-action=deactivate] input[name=pick]').uncheck();
  await Promise.all([p.waitForURL(/ok=pkgAi/), p.click('[data-testid=model-ai-apply]')]);
  assert((await p.textContent('[role=status]')).includes('4 cambios aplicados'), 'aplicados los marcados');
  assert((await p.locator('[data-testid=package][data-key=bebidas]').count()) === 1, 'paquete nuevo: Bebidas');
  assert((await p.textContent('[data-testid=package][data-key=pantalla]')).includes('35'), 'mediano a 35');
  assert(!(await p.textContent('[data-testid=package][data-key=album]')).includes('Desactivado'), 'Álbum sigue (estaba desmarcado)');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
