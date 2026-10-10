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

/** Direcciones internas (la web no puede apuntar a la red del servidor). */
export function privateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}
type Lookup = (host: string) => Promise<string[]>;
const dnsLookup: Lookup = async (host) => (await (await import('node:dns')).promises.lookup(host, { all: true })).map((x) => x.address);

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
export function realWebsite(fetchImpl: typeof fetch = fetch, lookup: Lookup = dnsLookup): WebsiteApi {
  return {
    async scan(raw) {
      let url = safeUrl(raw);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      try {
        for (let hop = 0; url && hop < 4; hop++) {
          const ips = await lookup(url.hostname).catch(() => []);
          if (!ips.length || ips.some(privateIp)) return NONE;
          const res = await fetchImpl(url, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; CofundoVentas/1.0)', accept: 'text/html' } });
          if (res.status >= 300 && res.status < 400) { const to = res.headers.get('location'); url = to ? safeUrl(new URL(to, url).toString()) : null; continue; }
          if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? 'text/html') || !res.body) return NONE;
          const reader = res.body.getReader();
          let html = '';
          const dec = new TextDecoder();
          while (html.length < 800_000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); }
          reader.cancel().catch(() => undefined);
          return parseSocials(html);
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
