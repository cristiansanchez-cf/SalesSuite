// SPIKE (docs/SPIKE_DATA.md): imita el gateway de Supabase en local para que la app corra en modo
// "supabase" sin cuenta en la nube. /rest/v1 → PostgREST (como supabase/tests/it-proxy.mjs) y un
// Auth MÍNIMO (no es GoTrue): login por contraseña con una clave fija de desarrollo, /user y /logout.
// Solo para desarrollo y smokes locales. NUNCA en un despliegue.
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const REST = new URL(process.env.POSTGREST_URL || 'http://127.0.0.1:3000');
const SECRET = process.env.JWT_SECRET;
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'demo-local';
if (!SECRET) throw new Error('Falta JWT_SECRET');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function sign(claims, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iat: now, exp: now + ttl, ...claims })}`;
  return `${head}.${createHmac('sha256', SECRET).update(head).digest('base64url')}`;
}
function verify(token) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) return null;
  const want = createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
const SERVICE = sign({ role: 'service_role' }, 10 * 365 * 24 * 3600);

async function findUser(q) {
  const r = await fetch(`${REST.origin}/users?select=id,email,display_name&${q}`, { headers: { Authorization: `Bearer ${SERVICE}` } });
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
const toUser = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  user_metadata: { name: u.display_name }, app_metadata: { provider: 'email' }, created_at: new Date(0).toISOString(),
});
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => ok(s ? JSON.parse(s) : {})); });

async function auth(req, res, path) {
  if (req.method === 'POST' && path.startsWith('/token')) {
    const grant = new URL(path, 'http://x').searchParams.get('grant_type');
    const body = await readBody(req);
    let u = null;
    if (grant === 'password' && body.password === DEV_PASSWORD) u = await findUser(`email=eq.${encodeURIComponent(String(body.email).toLowerCase())}`);
    if (grant === 'refresh_token' && String(body.refresh_token).startsWith('r.')) u = await findUser(`id=eq.${encodeURIComponent(body.refresh_token.slice(2))}`);
    if (!u) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' });
    const expires_in = 3600;
    return json(res, 200, {
      access_token: sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email }, expires_in),
      token_type: 'bearer', expires_in, expires_at: Math.floor(Date.now() / 1000) + expires_in,
      refresh_token: `r.${u.id}`, user: toUser(u),
    });
  }
  if (req.method === 'GET' && path === '/user') {
    const claims = verify(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    const u = claims?.sub && (await findUser(`id=eq.${encodeURIComponent(claims.sub)}`));
    return u ? json(res, 200, toUser(u)) : json(res, 401, { code: 401, msg: 'invalid JWT' });
  }
  if (req.method === 'POST' && path.startsWith('/logout')) { res.writeHead(204).end(); return; }
  // OTP, invitaciones, reset de contraseña, admin API: NO implementados (ver docs/SPIKE_DATA.md).
  json(res, 501, { msg: `auth local: ${req.method} ${path} no implementado` });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/auth/v1')) { auth(req, res, req.url.slice('/auth/v1'.length)).catch((e) => json(res, 500, { msg: String(e) })); return; }
  if (!req.url.startsWith('/rest/v1')) { json(res, 404, { msg: 'no implementado en local' }); return; }
  const up = http.request({
    host: REST.hostname, port: REST.port, method: req.method,
    path: req.url.slice('/rest/v1'.length) || '/', headers: { ...req.headers, host: REST.host },
  }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', (e) => { res.writeHead(502).end(String(e)); });
  req.pipe(up);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`gateway local :${PORT} → ${REST.href} (+ auth mínimo)`);
  console.log(`ANON_KEY=${sign({ role: 'anon' }, 10 * 365 * 24 * 3600)}`);
  console.log(`SERVICE_ROLE_KEY=${SERVICE}`);
});
