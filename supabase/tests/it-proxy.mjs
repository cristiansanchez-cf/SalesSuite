// Proxy mínimo que imita el gateway de Supabase: /rest/v1/* → PostgREST.
import http from 'node:http';
const [port, target] = [Number(process.env.PROXY_PORT || 54321), new URL(process.env.POSTGREST_URL || 'http://127.0.0.1:3000')];
http.createServer((req, res) => {
  if (!req.url.startsWith('/rest/v1')) { res.writeHead(404).end(); return; }
  const up = http.request({
    host: target.hostname, port: target.port, method: req.method,
    path: req.url.slice('/rest/v1'.length) || '/', headers: { ...req.headers, host: target.host },
  }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', (e) => { res.writeHead(502).end(String(e)); });
  req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log(`proxy :${port} → ${target.href}`));
