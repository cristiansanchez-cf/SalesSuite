/**
 * Mirar la web de la empresa (docs/CRM_DINAMICO.md §15): al confirmar su ficha de Google, se abre su web una vez y se
 * apuntan los enlaces que la propia web publica (Instagram, Facebook, LinkedIn y email). Sin buscadores ni scraping de
 * redes: solo la portada que Google da como su web. Solo servidor.
 */
export interface Socials { instagram: string | null; facebook: string | null; linkedin: string | null; email: string | null }
export interface WebsiteApi { scan(url: string): Promise<Socials> }
const NONE: Socials = { instagram: null, facebook: null, linkedin: null, email: null };

/** Solo webs públicas: https/http, con nombre (no IP), sin puertos raros ni nombres internos. */
export function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp|test)$/.test(h)) return null;
  return u;
}

const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'developer', 'legal', 'direct']);
const FB_SKIP = new Set(['sharer', 'sharer.php', 'share', 'share.php', 'dialog', 'plugins', 'tr', 'login', 'login.php', 'help', 'policies', 'privacy', 'groups', 'events', 'watch', 'hashtag', 'photo.php', 'l.php']);
const MAIL_SKIP = /(\.(png|jpe?g|gif|webp|svg)$)|(@(example|domain|email|sentry|wixpress|sentry-next)\.)|^(name|tu|your|user)@/i;

/** Direcciones internas (la web no puede apuntar a la red del servidor), también las IPv4 escondidas en IPv6. */
export function privateIp(ip: string): boolean {
  let v = ip.toLowerCase().trim();
  const mapped = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) v = mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  // IPv6: sin especificar, local, privadas (fc/fd), enlace (fe80), 6to4 y NAT64 (pueden llevar dentro una IPv4 interna).
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('2002:') || v.startsWith('64:ff9b:') || v.startsWith('::');
}
type Lookup = (host: string) => Promise<string[]>;
const dnsLookup: Lookup = async (host) => (await (await import('node:dns')).promises.lookup(host, { all: true })).map((x) => x.address);

/** Una petición GET: estado, a dónde redirige, tipo y (como mucho 800 KB de) contenido. */
export interface WebResponse { status: number; location: string | null; type: string; body: string }
export type WebGet = (url: URL, signal: AbortSignal) => Promise<WebResponse>;

/**
 * GET con Node que comprueba la dirección AL CONECTAR (el `lookup` de la conexión rechaza las internas): así no vale
 * engañar al servidor cambiando el DNS entre la comprobación y la conexión (DNS rebinding).
 */
export function nodeGet(check: (ips: string[]) => boolean = (ips) => ips.length > 0 && !ips.some(privateIp)): WebGet {
  return async (url, signal) => {
    const [mod, dns] = await Promise.all([url.protocol === 'https:' ? import('node:https') : import('node:http'), import('node:dns')]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookup = (host: string, opts: any, cb: any) => dns.lookup(host, { ...opts, all: true }, (err, list) => {
      const addrs = (list ?? []) as unknown as Array<{ address: string; family: number }>;
      if (err || !check(addrs.map((x) => x.address))) return cb(err ?? new Error('Dirección no permitida'), opts?.all ? [] : '', 4);
      return opts?.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
    });
    return new Promise<WebResponse>((resolve, reject) => {
      const req = mod.request(url, { method: 'GET', lookup, signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; CofundoVentas/1.0)', accept: 'text/html' } }, (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        if (status >= 300 && status < 400 || !/html/i.test(type || 'text/html')) { res.destroy(); return resolve({ status, location, type, body: '' }); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => { body += c; if (body.length > 800_000) res.destroy(); });
        res.on('close', () => resolve({ status, location, type, body: body.slice(0, 800_000) }));
        res.on('error', () => resolve({ status, location, type, body }));
      });
      req.on('error', reject);
      req.end();
    });
  };
}

/** Lo que la web enlaza. La primera aparición de cada red manda (suele ser la del pie o la cabecera). */
export function parseSocials(html: string): Socials {
  const out: Socials = { ...NONE };
  for (const m of html.matchAll(/https?:\/\/(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?=["'?#\s<>)]|$)/g)) {
    if (!IG_SKIP.has(m[1].toLowerCase())) { out.instagram = `https://www.instagram.com/${m[1]}/`; break; }
  }
  for (const m of html.matchAll(/https?:\/\/(?:www\.|m\.|es-es\.)?(?:facebook|fb)\.com\/((?:profile\.php\?id=\d{5,20})|[A-Za-z0-9.\-]{2,80})\/?(?=["'?#\s<>)&]|$)/g)) {
    if (!FB_SKIP.has(m[1].toLowerCase())) { out.facebook = `https://www.facebook.com/${m[1]}`; break; }
  }
  const li = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|school|in)\/([A-Za-z0-9_\-%.]{2,100})\/?(?=["'?#\s<>)]|$)/.exec(html);
  if (li) out.linkedin = `https://www.linkedin.com/${li[1]}/${li[2]}`;
  const mail = [...html.matchAll(/mailto:([^"'?\s<>]{3,200})/gi)].map((m) => decodeURIComponent(m[1]))
    .concat([...html.matchAll(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{2,100}\.[A-Za-z]{2,12}/g)].map((m) => m[0]))
    .find((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,12}$/i.test(e) && !MAIL_SKIP.test(e));
  if (mail) out.email = mail.toLowerCase();
  return out;
}

/** Abre la web (como mucho 3 redirecciones, 6 s y 800 KB) y lee sus enlaces. Si algo falla: nada, sin error. */
export function realWebsite(get: WebGet = nodeGet(), lookup: Lookup = dnsLookup): WebsiteApi {
  return {
    async scan(raw) {
      let url = safeUrl(raw);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      try {
        for (let hop = 0; url && hop < 4; hop++) {
          // Primer filtro (barato); el de verdad va al conectar (nodeGet).
          const ips = await lookup(url.hostname).catch(() => []);
          if (!ips.length || ips.some(privateIp)) return NONE;
          const res = await get(url, ctl.signal);
          if (res.status >= 300 && res.status < 400) { url = res.location ? safeUrl(new URL(res.location, url).toString()) : null; continue; }
          if (res.status < 200 || res.status >= 300 || !res.body) return NONE;
          return parseSocials(res.body);
        }
        return NONE;
      } catch { return NONE; } finally { clearTimeout(timer); }
    },
  };
}

/** Para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave de Google): la web de mentira de fixturePlaces «enlaza» sus redes. */
export function fixtureWebsite(): WebsiteApi {
  return {
    async scan(raw) {
      const slug = /^https:\/\/([a-z0-9]+)\.test\//.exec(raw)?.[1];
      return slug ? { instagram: `https://www.instagram.com/${slug}/`, facebook: `https://www.facebook.com/${slug}`, linkedin: null, email: `hola@${slug}.test` } : NONE;
    },
  };
}
