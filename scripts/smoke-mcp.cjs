/**
 * Smoke de «Conecta tu IA» (docs/MCP.md): en Mi cuenta se crea una clave; con un cliente MCP de verdad (el SDK oficial)
 * se conecta a /api/mcp y usa las herramientas como lo haría Claude: buscar, ver la ficha, lo de hoy, registrar un
 * contacto, próximo paso, cualificar, anotar un dato, crear una empresa, añadir una persona, y apuntar como por
 * WhatsApp (preparar → guardar). Sin clave o revocada: 401.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-mcp.cjs   (deja la demo cambiada)
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(`${BASE}/admin/login`);
  await p.click('[data-testid="demo-rep@enjoy.test"]');
  await p.waitForURL(/\/admin/);

  // La clave, en Mi cuenta.
  await p.goto(`${BASE}/admin/account#ia`);
  assert((await p.inputValue('[data-testid=mcp-url]')).endsWith('/api/mcp'), 'la dirección del servidor');
  await p.fill('[data-testid=mcp-name]', 'Claude del portátil');
  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=mcp-create]')]);
  const key = await p.inputValue('[data-testid=mcp-key]');
  assert(/^ss_mcp_/.test(key), 'clave creada y enseñada una vez');
  assert((await p.textContent('[data-testid=mcp-snippet-code]')).includes(key), 'instrucciones con la clave ya puesta');
  await p.goto(`${BASE}/admin/account?v=2#ia`);
  assert(!(await p.locator('[data-testid=mcp-key]').count()) && (await p.locator('[data-testid=mcp-token]').count()) === 1, 'al volver ya no se ve la clave; sí la conexión');

  // Sin clave o con una falsa: 401.
  const raw = (k) => fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(k ? { authorization: `Bearer ${k}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert((await raw(null)).status === 401 && (await raw('ss_mcp_' + 'x'.repeat(43))).status === 401, 'sin clave o falsa: 401');
  assert(((await raw(null)).headers.get('www-authenticate') ?? '').includes('resource_metadata'), 'dice dónde autenticarse (para el OAuth)');

  // Un cliente MCP de verdad.
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  assert((client.getInstructions() ?? '').includes('Enjoy'), 'instrucciones con el nombre del espacio');
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert(['buscar_empresas', 'ver_empresa', 'lo_de_hoy', 'registrar_contacto', 'proximo_paso', 'preguntas_cualificacion', 'cualificar', 'anotar_dato', 'crear_empresa', 'anadir_persona', 'preparar_apunte', 'guardar_apunte'].every((x) => tools.includes(x)), `herramientas (${tools.length})`);
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? ''; if (r.isError) return { error: t }; return JSON.parse(t); };

  const found = await call('buscar_empresas', { texto: 'club sol' });
  const sol = found.find((x) => x.nombre === 'Club Sol');
  assert(!!sol, `buscar_empresas: Club Sol (${found.length})`);
  const ficha = await call('ver_empresa', { empresa_id: sol.id });
  assert(ficha.nombre === 'Club Sol' && Array.isArray(ficha.falta_por_saber), 'ver_empresa: la ficha con lo que falta por saber');
  const hoy = await call('lo_de_hoy');
  assert(hoy.cuantas && Array.isArray(hoy.empresas), `lo_de_hoy (${hoy.empresas.length})`);
  const reg = await call('registrar_contacto', { empresa_id: sol.id, canal: 'phone', resultado: 'interested', nota: 'Les interesa probar en enero (smoke MCP).' });
  assert(reg.guardado, 'registrar_contacto');
  const ns = await call('proximo_paso', { empresa_id: sol.id, que: 'Llamar para cerrar la prueba (smoke MCP)', dia: '2027-01-12', hora: '12:00' });
  assert(ns.guardado, 'proximo_paso');
  const q = await call('preguntas_cualificacion', { empresa_id: sol.id });
  const first = q.preguntas[0];
  if (first) {
    const cq = await call('cualificar', { empresa_id: sol.id, respuestas: [{ campo: first.campo, valor: first.opciones[0].valor }] });
    assert(cq.marcado?.length === 1, `cualificar: ${cq.marcado?.[0]}`);
  } else assert(true, 'sin preguntas pendientes');
  assert((await call('anotar_dato', { empresa_id: sol.id, texto: 'Abren una segunda sala en primavera (smoke MCP).', importante: true })).guardado, 'anotar_dato');
  const after = await call('ver_empresa', { empresa_id: sol.id });
  assert(after.proximo_paso?.que?.includes('smoke MCP') && after.lo_importante.some((x) => x.includes('segunda sala')) && after.ultimas_interacciones.some((x) => (x.nota ?? '').includes('smoke MCP')), 'en la ficha: el contacto, el paso y el dato');
  const dup = await call('crear_empresa', { nombre: 'Club Sol' });
  assert(dup.creada === false && dup.ya_existe?.id === sol.id, 'crear_empresa: no duplica');
  const nueva = await call('crear_empresa', { nombre: 'Sala MCP Prueba', ciudad: 'Málaga' });
  assert(nueva.creada && nueva.id, 'crear_empresa: nueva');
  const per = await call('anadir_persona', { nombre: 'Jorge MCP', empresa_id: nueva.id, papel: 'Encargado', telefono: '+34 600 000 111' });
  assert(per.creada && per.empresa_id === nueva.id, 'anadir_persona vinculada');

  // Como por WhatsApp: preparar → guardar.
  const prep = await call('preparar_apunte', { texto: 'Sala MCP Prueba: hablé con Jorge, el encargado, quieren pantalla grande. Mirar sus redes.' });
  if (prep.error) assert(false, `preparar_apunte: ${prep.error}`);
  else {
    const ap = prep.apuntes[0];
    assert(ap && ap.fila && Array.isArray(ap.candidatas), `preparar_apunte: ${prep.apuntes.length} apunte(s), candidatas ${ap?.candidatas.map((c) => c.nombre).join(', ')}`);
    const target = ap.candidatas.find((c) => c.id === nueva.id) ?? { id: nueva.id };
    const g = await call('guardar_apunte', { apuntes: [{ fila: ap.fila, empresa_id: target.id }] });
    assert(g.guardados?.[0]?.ok, 'guardar_apunte');
  }
  const bad = await call('ver_empresa', { empresa_id: '00000000-0000-4000-8000-00000000dead' });
  assert(!!bad.error, `un error del CRM vuelve como texto (${bad.error})`);
  await client.close();

  // Revocar: deja de valer.
  await p.goto(`${BASE}/admin/account?v=3#ia`);
  p.once('dialog', (d) => d.accept());
  await Promise.all([p.waitForLoadState('load'), p.click('[data-testid=mcp-revoke]')]);
  assert((await p.getAttribute('[data-testid=mcp-token]', 'data-revoked')) === 'true', 'revocada');
  assert((await raw(key)).status === 401, 'revocada: 401');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
