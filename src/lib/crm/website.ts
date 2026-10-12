/**
 * Mirar la web de la empresa (docs/CRM_DINAMICO.md §15): al confirmar su ficha de Google, se abre su web una vez y se
 * apuntan los enlaces que la propia web publica (Instagram, Facebook, LinkedIn y email). Sin buscadores ni scraping de
 * redes: solo la portada que Google da como su web. Solo servidor.
 */
export interface Socials {
  instagram: string | null; facebook: string | null; linkedin: string | null; email: string | null;
  /** Titular (§25): la razón social y el CIF que publica su aviso legal (o la portada). */
  legalName?: string | null; taxId?: string | null;
}
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

// ---------------------------------------------------------------- Titular (§25)

/** CIF de una sociedad española con su dígito de control bien (así no vale cualquier código que se le parezca). */
export function validCif(raw: string): boolean {
  const v = raw.toUpperCase();
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!m) return false;
  let sum = 0;
  [...m[2]].forEach((d, i) => { const n = Number(d); sum += i % 2 ? n : Math.floor(n * 2 / 10) + (n * 2) % 10; });
  const c = (10 - (sum % 10)) % 10;
  const letter = 'JABCDEFGHI'[c];
  if ('PQRSNW'.includes(m[1])) return m[3] === letter;
  if ('ABEH'.includes(m[1])) return m[3] === String(c);
  return m[3] === String(c) || m[3] === letter;
}
/** «B-12.345.678» → «B12345678». */
export const cleanTaxId = (v: string) => v.toUpperCase().replace(/[\s.\-/]/g, '');

const FORM = String.raw`S\.?\s?L\.?\s?U\.?|S\.?\s?L\.?(?:\s?P\.?)?|S\.?\s?A\.?\s?U\.?|S\.?\s?A\.?|S\.?\s?Coop\.?|Sociedad\s+Limitada(?:\s+Unipersonal)?|Sociedad\s+An[oó]nima|Lda\.?|Unipessoal`;
const WORD = String.raw`[A-ZÁÉÍÓÚÑÜÇ0-9][A-Za-zÁÉÍÓÚÑÜÇáéíóúñüç0-9&'’.\-]*`;
/** Nombre que acaba en la forma social: «Ocio Cosmic Group 2010, S.L.». Palabras en mayúscula (y «de», «y»…). */
const LEGAL_RE = new RegExp(String.raw`(${WORD}(?:\s+(?:(?:de|del|la|las|los|y|e|i|&)\s+)?${WORD}){0,7}?),?\s*(${FORM})(?=[\s,;:)(]|$)`, 'g');
const CIF_RE = /\b([ABCDEFGHJNPQRSUVW])[\s.\-]?(\d{2})[\s.]?(\d{3})[\s.]?(\d{2})[\s.\-]?([0-9A-J])\b/g;
/** Lo que no es el titular aunque lo parezca (los avisos de cookies nombran a otros). */
const NOT_OWNER = /^(google|meta|facebook|wix|squarespace|wordpress|automattic|hubspot|mailchimp|stripe|paypal|amazon|microsoft|cloudflare|hotjar|vimeo|youtube)\b/i;

const HEADING = /^(datos|identificativos|identificaci[oó]n|del?|titular|titularidad|aviso|legal|responsable|empresa|pol[ií]tica|privacidad|informaci[oó]n|general|generales|denominaci[oó]n|social|raz[oó]n|nombre|condiciones|t[eé]rminos|cookies|copyright|©|todos|derechos|reservados|web|sitio)$/i;

/** Texto plano de una página (sin scripts, estilos ni etiquetas). */
export function pageText(html: string): string {
  return html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&([aeiou])acute;/gi, (_, c: string) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' } as Record<string, string>)[c] ?? c)
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ').replace(/\s+/g, ' ');
}

/**
 * La razón social y el CIF de la página. El CIF tiene que cuadrar (dígito de control); la razón social es la que acaba
 * en S.L./S.A./… más cerca del CIF (o tras «titular», «razón social»…). Si no está claro: null.
 */
export function parseLegal(html: string): { legalName: string | null; taxId: string | null } {
  const text = pageText(html);
  const cifs = [...text.matchAll(CIF_RE)].map((m) => ({ id: m.slice(1).join(''), at: m.index ?? 0 })).filter((c) => validCif(c.id));
  // Si hay «CIF»/«NIF» delante, ese manda; si no, el primero.
  const cif = cifs.find((c) => /(C\.?\s?I\.?\s?F|N\.?\s?I\.?\s?F|NIPC|VAT|identificaci[oó]n fiscal)[^A-Za-z0-9]{0,30}$/i.test(text.slice(Math.max(0, c.at - 40), c.at))) ?? cifs[0] ?? null;
  const names = [...text.matchAll(LEGAL_RE)].map((m) => {
    // Fuera lo de delante que es título, no nombre: «1. DATOS DEL TITULAR Ocio Cosmic» → «Ocio Cosmic».
    const words = m[1].trim().replace(/[,\s]+$/, '').split(/\s+/);
    while (words.length > 1 && (HEADING.test(words[0]) || /^[\d.]+$/.test(words[0]))) words.shift();
    const name = words.join(' ').replace(/^(?:de|del|la|las|los|y|e|i|&)\s+/i, '');
    const short = m[2].replace(/[\s.]/g, '').toUpperCase();
    const form = ({ SL: 'S.L.', SLU: 'S.L.U.', SLP: 'S.L.P.', SA: 'S.A.', SAU: 'S.A.U.', SCOOP: 'S.Coop.' } as Record<string, string>)[short] ?? m[2].replace(/\s+/g, ' ');
    return { full: `${name}, ${form}`.replace(/\s+/g, ' '), name, at: m.index ?? 0 };
  }).filter((n) => n.name.length >= 3 && n.name.length <= 120 && !NOT_OWNER.test(n.name) && /[A-Za-zÁÉÍÓÚÑ]{2}/.test(n.name));
  const owner = /(titular|raz[oó]n social|denominaci[oó]n|responsable|propietari|empresa|sociedad|entidad|gestionad[oa]|operad[oa]|explotad[oa]|perteneciente)[^.]{0,80}$/i;
  const pick = cif ? names.filter((n) => Math.abs(n.at - cif.at) < 300).sort((a, b) => Math.abs(a.at - cif.at) - Math.abs(b.at - cif.at))[0]
    : names.find((n) => owner.test(text.slice(Math.max(0, n.at - 100), n.at)));
  return { legalName: pick?.full.slice(0, 200) ?? null, taxId: cif?.id ?? null };
}

/** Enlaces de la portada a su aviso legal, privacidad, términos… (de su misma web), los más prometedores primero. */
export function legalLinks(html: string, base: URL): URL[] {
  const rank = (s: string) => /aviso[\s_-]*legal|legal[\s_-]*notice|nota[\s_-]*legal|informaci[oó]n[\s_-]*legal|^\/?legal\b|impressum/i.test(s) ? 0
    : /t[eé]rminos|condiciones|terms|conditions/i.test(s) ? 1 : /privacidad|privacy|protecci[oó]n[\s_-]*de[\s_-]*datos/i.test(s) ? 2 : /legal/i.test(s) ? 1 : /cookies/i.test(s) ? 3 : -1;
  const host = base.hostname.replace(/^www\./, '');
  const seen = new Map<string, { url: URL; rank: number }>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    let u: URL | null;
    try { u = safeUrl(new URL(m[1].replace(/&amp;/g, '&'), base).toString()); } catch { u = null; }
    if (!u || u.hostname.replace(/^www\./, '') !== host) continue;
    const r = Math.max(rank(decodeURIComponent(u.pathname).toLowerCase()), rank(pageText(m[2])));
    const key = u.origin + u.pathname;
    if (r >= 0 && key !== base.origin + base.pathname && (!seen.has(key) || seen.get(key)!.rank > r)) seen.set(key, { url: u, rank: r });
  }
  return [...seen.values()].sort((a, b) => a.rank - b.rank).map((x) => x.url);
}

/**
 * Abre la web (como mucho 3 redirecciones, 800 KB por página) y lee sus enlaces; si la portada no dice de quién es, mira
 * también hasta 2 de sus páginas legales (aviso legal, términos, privacidad). En total, 10 s. Si algo falla: nada, sin error.
 */
export function realWebsite(get: WebGet = nodeGet(), lookup: Lookup = dnsLookup): WebsiteApi {
  async function page(start: URL | null, signal: AbortSignal): Promise<{ url: URL; body: string } | null> {
    let url = start;
    for (let hop = 0; url && hop < 4; hop++) {
      // Primer filtro (barato); el de verdad va al conectar (nodeGet).
      const ips = await lookup(url.hostname).catch(() => []);
      if (!ips.length || ips.some(privateIp)) return null;
      const res = await get(url, signal);
      if (res.status >= 300 && res.status < 400) { url = res.location ? safeUrl(new URL(res.location, url).toString()) : null; continue; }
      return res.status >= 200 && res.status < 300 && res.body ? { url, body: res.body } : null;
    }
    return null;
  }
  return {
    async scan(raw) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10_000);
      try {
        const home = await page(safeUrl(raw), ctl.signal);
        if (!home) return NONE;
        const out: Socials = { ...parseSocials(home.body), ...parseLegal(home.body) };
        for (const u of legalLinks(home.body, home.url).slice(0, 2)) {
          if (out.legalName && out.taxId) break;
          const p = await page(u, ctl.signal).catch(() => null);
          if (!p) continue;
          const l = parseLegal(p.body);
          // El CIF y el nombre de la misma página van juntos; de otra, solo lo que falte.
          if (!out.taxId && l.taxId) { out.taxId = l.taxId; out.legalName = l.legalName ?? out.legalName; } else out.legalName ??= l.legalName;
        }
        return out;
      } catch { return NONE; } finally { clearTimeout(timer); }
    },
  };
}

/** Para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave de Google): la web de mentira de fixturePlaces «enlaza» sus redes. */
export function fixtureWebsite(): WebsiteApi {
  return {
    async scan(raw) {
      const slug = /^https:\/\/([a-z0-9]+)\.test\//.exec(raw)?.[1];
      if (!slug) return NONE;
      // Titular de mentira (§25): las de «cosmic…» comparten sociedad, como un grupo; las demás, cada una la suya.
      const owner = slug.startsWith('cosmic') ? 'cosmic' : slug;
      return { instagram: `https://www.instagram.com/${slug}/`, facebook: `https://www.facebook.com/${slug}`, linkedin: null, email: `hola@${slug}.test`,
        legalName: `${owner[0].toUpperCase()}${owner.slice(1)} Ocio, S.L.`, taxId: fixtureCif(owner) };
    },
  };
}
/** Un CIF que cuadra, siempre el mismo para el mismo texto. */
export function fixtureCif(seed: string): string {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 10_000_000;
  const digits = String(h).padStart(7, '0');
  for (let c = 0; c < 10; c++) if (validCif(`B${digits}${c}`)) return `B${digits}${c}`;
  return 'B00000000';
}
