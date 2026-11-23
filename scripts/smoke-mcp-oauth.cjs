/**
 * Smoke del OAuth de «Conecta tu IA» (docs/MCP.md §OAuth): lo que hace claude.ai al añadir el conector.
 * 401 con resource_metadata → metadatos → registro dinámico → «Autorizar» (con login si no hay sesión) → código con
 * PKCE → token → herramientas → refresco (rotación) → revocar. Y lo que NO debe pasar: vuelta no registrada, código
 * reusado, verificador falso, refresco viejo.
 *   npm run build && AI_RESEARCH_FIXTURE=1 npm run start:demo ; node scripts/smoke-mcp-oauth.cjs
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
const rpc = (token) => fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });

(async () => {
  // La vuelta (como Claude Code: loopback, con un puerto cualquiera).
  let got = null;
  const srv = http.createServer((req, res) => { got = new URL(req.url, 'http://127.0.0.1'); res.end('ok'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const redirect = `http://127.0.0.1:${port}/callback`;

  // 1. Descubrimiento.
  const r401 = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  const wa = r401.headers.get('www-authenticate') ?? '';
  const metaUrl = /resource_metadata="([^"]+)"/.exec(wa)?.[1];
  assert(r401.status === 401 && !!metaUrl, `401 con resource_metadata (${metaUrl})`);
  const prm = await (await fetch(metaUrl)).json();
  assert(prm.resource === `${BASE}/api/mcp` && prm.authorization_servers?.[0] === BASE, 'recurso protegido: la misma URL y su servidor de autorización');
  const as = await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
  assert(as.code_challenge_methods_supported?.includes('S256') && as.registration_endpoint && as.token_endpoint && as.authorization_endpoint, 'servidor de autorización: PKCE S256, registro, token');

  // 2. Registro dinámico.
  const bad = await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Malo', redirect_uris: ['http://evil.example/cb'] }) });
  assert(bad.status === 400, 'registro: http fuera de localhost, no');
  const reg = await (await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['http://127.0.0.1/callback', 'https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }) })).json();
  assert(!!reg.client_id, 'registro dinámico: client_id');

  // 3. «Autorizar» (sin sesión: login y vuelve).
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const authUrl = (ru, st = 'st-123') => `${as.authorization_endpoint}?${new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: ru, code_challenge: challenge, code_challenge_method: 'S256', state: st, scope: 'crm offline_access', resource: prm.resource })}`;
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await p.goto(authUrl(redirect));
  assert(/\/admin\/login/.test(p.url()), 'sin sesión: al login');
  await Promise.all([p.waitForURL(/\/admin\/oauth\/authorize/), p.click('[data-testid="demo-rep@enjoy.test"]')]);
  assert((await p.textContent('[data-testid=oauth-title]')).includes('Claude'), 'vuelve a «Autorizar»: «Claude quiere conectarse a tu CRM»');
  assert((await p.textContent('[data-testid=oauth-back]')).includes(`127.0.0.1:${port}`), 'dice adónde vuelve');
  await p.click('[data-testid=oauth-approve]');
  await p.waitForFunction(() => location.pathname === '/callback').catch(() => {});
  assert(got && got.searchParams.get('code') && got.searchParams.get('state') === 'st-123' && got.searchParams.get('iss') === BASE, 'vuelve con code, state e iss');
  const code = got.searchParams.get('code');

  // Una vuelta no registrada: se queda (no redirige).
  await p.goto(authUrl('https://evil.example/cb'));
  assert(!(await p.locator('[data-testid=oauth-consent]').count()) && p.url().startsWith(BASE), 'vuelta no registrada: no se va a ningún sitio');

  // 4. Token (form-urlencoded).
  const wrong = await fetch(as.token_endpoint, form({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: redirect, code_verifier: crypto.randomBytes(32).toString('base64url') }));
  assert(wrong.status === 400 && (await wrong.json()).error === 'invalid_grant', 'verificador falso: invalid_grant (y el código ya no vale)');
  // Otro código, bien.
  got = null;
  await p.goto(authUrl(redirect, 'st-2'));
  await p.click('[data-testid=oauth-approve]');
  await p.waitForFunction(() => location.pathname === '/callback').catch(() => {});
  const code2 = got.searchParams.get('code');
  const tok = await (await fetch(as.token_endpoint, form({ grant_type: 'authorization_code', code: code2, client_id: reg.client_id, redirect_uri: redirect, code_verifier: verifier }))).json();
  assert(/^ss_mcp_/.test(tok.access_token) && /^ss_mcpr_/.test(tok.refresh_token) && tok.token_type === 'Bearer' && tok.expires_in > 0, 'token y refresco');
  const again = await fetch(as.token_endpoint, form({ grant_type: 'authorization_code', code: code2, client_id: reg.client_id, redirect_uri: redirect, code_verifier: verifier }));
  assert(again.status === 400, 'el código no se puede reusar');

  // 5. Con el token, el MCP.
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new Client({ name: 'smoke-oauth', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.access_token}` } } }));
  const found = JSON.parse((await client.callTool({ name: 'buscar_empresas', arguments: { texto: 'club sol' } })).content[0].text);
  assert(found.some((x) => x.nombre === 'Club Sol'), 'con el token OAuth: buscar_empresas');
  await client.close();

  // 6. Refresco con rotación.
  const ref = await (await fetch(as.token_endpoint, form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: reg.client_id }))).json();
  assert(ref.access_token && ref.refresh_token && ref.refresh_token !== tok.refresh_token, 'refresco: token y refresco nuevos');
  const oldRef = await fetch(as.token_endpoint, form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: reg.client_id }));
  assert(oldRef.status === 400, 'el refresco viejo ya no vale');
  assert((await rpc(tok.access_token)).status === 401 && (await rpc(ref.access_token)).status === 200, 'el token viejo no vale; el nuevo sí');

  // 7. En «Conecta tu IA»: la conexión con cuenta, y revocarla.
  await p.goto(`${BASE}/admin/ia`);
  const row = p.locator('[data-testid=mcp-token][data-via=oauth][data-revoked=false]').first();
  assert((await row.textContent()).includes('Claude'), 'Tus conexiones: «Claude · Con tu cuenta»');
  p.once('dialog', (d) => d.accept());
  await Promise.all([p.waitForLoadState('load'), row.locator('[data-testid=mcp-revoke]').click()]);
  assert((await rpc(ref.access_token)).status === 401, 'revocada: el token deja de valer');
  const afterRevoke = await fetch(as.token_endpoint, form({ grant_type: 'refresh_token', refresh_token: ref.refresh_token, client_id: reg.client_id }));
  assert(afterRevoke.status === 400, 'y el refresco tampoco');
  await b.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
