/**
 * Smoke de «Importar con tu IA» (docs/IMPORTAR_IA.md): con un cliente MCP de verdad, como haría Claude, el admin de Enjoy
 * abre una importación, manda una tanda (una que ya está en el CRM, una nueva completa y una con fallos), corrige y
 * reenvía con la misma referencia (no duplica), mira el estado y la termina. Nada entra en el CRM hasta «Aplicar» en la
 * app; después se ve la empresa nueva con su gente, su interacción y su próximo paso, y «Deshacer» lo quita todo.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-ai-import.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const OUT = process.env.SHOTS_DIR;
const RUN = Date.now().toString(36);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-admin@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // Inicio y Datos del CRM llevan a «Importar con tu IA», con el mensaje para la IA.
  await p.goto(`${BASE}/admin/inicio`);
  assert(await p.isVisible('[data-testid=home-ai-import]'), 'Inicio: «Importa con tu IA»');
  await p.click('[data-testid=home-ai-import]');
  await p.waitForURL(/\/admin\/import\/ia$/);
  assert(/importacion_empezar/.test(await p.inputValue('[data-testid=ai-import-prompt]')), 'el mensaje para la IA, listo para copiar');

  // La clave del admin para el cliente MCP.
  await p.goto(`${BASE}/admin/ia?ia=key`);
  await p.fill('[data-testid=mcp-name]', 'Importación smoke');
  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=mcp-create]')]);
  const key = await p.inputValue('[data-testid=mcp-key]');
  const client = new Client({ name: 'smoke-import', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? ''; return r.isError ? { error: t } : JSON.parse(t); };
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert(['importacion_empezar', 'importacion_enviar', 'importacion_estado', 'importacion_terminar'].every((x) => tools.includes(x)), 'las cuatro herramientas de importar');

  const s = await call('importacion_empezar', { nombre: `Smoke ${RUN}` });
  assert(s.importacion_id && s.esquema?.tipos?.some((k) => k.clave === 'company') && s.esquema.cualificacion.length > 0 && s.reglas.length >= 5, 'empezar: id, esquema del CRM y reglas');
  const nueva = `Sala Importada ${RUN}`;
  const t1 = await call('importacion_enviar', { importacion_id: s.importacion_id, empresas: [
    { ref: 'n-1', nombre: 'Club Sol', ciudad: 'Valencia', texto_origen: 'Club Sol, ya hablamos el año pasado' },
    { ref: 'n-2', nombre: nueva, ciudad: 'Valencia', telefono: '+34 600 123 456', email: 'hola@salaimportada.test',
      personas: [{ nombre: 'Lucía Import', papel: 'Encargada', telefono: '+34 600 000 222' }], datos: ['Abren jueves a sábado'],
      interacciones: [{ fecha: '2026-11-10', canal: 'phone', nota: 'Llamé a Lucía: le interesa (smoke import)' }],
      proximo_paso: { que: 'Mandar propuesta (smoke import)', fecha: '2027-01-15' }, cualificacion: { nights: '3', screens: 'nope' }, texto_origen: `${nueva}: llamé a Lucía…` },
    { ref: 'n-3', nombre: 'Bar Con Fallos', tipo: 'Federación', email: 'no-es-email', interacciones: [{ fecha: '2027-05-01', nota: 'Futura' }] },
    { ciudad: 'Sin nombre' },
  ] });
  const by = Object.fromEntries(t1.empresas.map((x) => [x.ref, x]));
  assert(t1.recibidas === 3 && t1.rechazadas.length === 1 && /nombre/.test(t1.rechazadas[0].error), 'tanda: 3 recibidas, 1 rechazada (sin nombre)');
  assert(by['n-1']?.estado === 'ya_existe' && by['n-1'].ya_en_el_crm === 'Club Sol', 'Club Sol: ya existe (al aplicar se completa)');
  assert(by['n-2']?.estado === 'nueva' && by['n-2'].avisos.some((a) => /screens: nope/.test(a)), 'la nueva, con el aviso de lo que no vale');
  assert(by['n-3']?.avisos.some((a) => /Federación/.test(a)) && by['n-3'].avisos.some((a) => /futura/.test(a)) && by['n-3'].avisos.some((a) => /Email/.test(a)), 'la de fallos: tipo, email y fecha futura, explicados');
  // Corregir y reenviar con la misma referencia: se actualiza, no se duplica.
  const t2 = await call('importacion_enviar', { importacion_id: s.importacion_id, empresas: [{ ref: 'n-3', nombre: 'Bar Con Fallos', email: 'bar@confallos.test', texto_origen: 'corregido' }] });
  assert(t2.actualizadas === 1 && t2.nuevas === 0 && t2.total.total === 3, 'reenviar con la misma ref: se actualiza (3 en total)');
  const st = await call('importacion_estado', { importacion_id: s.importacion_id });
  assert(st.estado === 'abierta' && st.refs.length === 3, 'estado: abierta, con sus referencias');
  // Nada en el CRM todavía.
  const found = await call('buscar_empresas', { texto: nueva });
  assert(!found.some((x) => x.nombre === nueva), 'antes de aplicar, nada en el CRM');
  const fin = await call('importacion_terminar', { importacion_id: s.importacion_id });
  assert(fin.review === `/admin/import/ia/${s.importacion_id}`, 'terminar: el enlace para revisar');
  await client.close();

  // Revisar y aplicar en la app.
  await p.goto(`${BASE}${fin.review}`);
  assert((await p.getAttribute('[data-testid=ai-import-review]', 'data-state')) === 'ready' && (await p.locator('[data-testid=ai-import-row]').count()) === 3, 'revisar: lista, 3 empresas');
  assert((await p.getAttribute('[data-testid=ai-import-row][data-ref=n-1]', 'data-existing')) === 'true', 'revisar: Club Sol marcada como «ya está»');
  if (OUT) await p.screenshot({ path: `${OUT}/ai-import-review.png`, fullPage: true });
  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=ai-import-apply]')]);
  assert((await p.getAttribute('[data-testid=ai-import-review]', 'data-state')) === 'done', `aplicada (${(await p.textContent('[role=alert], .co-alert').catch(() => ''))?.replace(/\s+/g, ' ').trim()})`);
  await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(nueva)}`);
  await p.click('[data-testid=account] a');
  await p.waitForSelector('[data-testid=account-summary]');
  const text = await p.evaluate(() => document.querySelector('main')?.innerText ?? '');
  assert(/Lucía Import/.test(text) && /smoke import/.test(text) && /Abren jueves a sábado/.test(text), `la nueva: su gente, su interacción, su próximo paso y sus datos (${[/Lucía Import/.test(text), /Llamé a Lucía/.test(text), /Mandar propuesta/.test(text), /Abren jueves/.test(text)]})`);
  assert(!/nope/.test(text), 'lo que no valía no entró');

  // Deshacer: fuera.
  await p.goto(`${BASE}${fin.review}`);
  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=ai-import-undo]')]);
  assert((await p.getAttribute('[data-testid=ai-import-review]', 'data-state')) === 'undone', 'deshecha');
  await p.goto(`${BASE}/admin/accounts?ver=all&q=${encodeURIComponent(nueva)}`);
  assert((await p.locator('[data-testid=account]').count()) === 0, 'deshacer: la empresa nueva ya no está');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
