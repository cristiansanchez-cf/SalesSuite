/**
 * Revisar la web de una empresa (docs/CRM_DINAMICO.md §13 «Qué mirar»): la app abre su portada (con las protecciones de
 * src/lib/crm/website.ts) y comprueba, sin IA, lo que se ve en el código: si va por HTTPS, si está hecha para el móvil,
 * el año del copyright, con qué está hecha, señales de web antigua, enlaces a aviso legal, privacidad, cookies y
 * términos, si se ve un banner de cookies y qué analítica o píxeles carga. Es un hecho comprobado: la IA lo recibe
 * como tal y la ficha lo enseña con ✓ / ✗. Puro (se prueba con HTML de ejemplo).
 */
export interface WebAudit {
  /** La dirección a la que se ha llegado (tras redirecciones), o la que se intentó si no se pudo abrir. */
  url: string;
  /** false = no se ha podido abrir (caída, sin respuesta, bloquea): lo demás no vale. */
  ok: boolean;
  https: boolean;
  /** Tiene <meta name="viewport">: hecha para verse en el móvil. */
  mobile: boolean;
  /** El año más reciente del copyright («© 2016»), o null si no lo pone. */
  year: number | null;
  /** Con qué está hecha («WordPress 4.9», «Wix»…), o null. */
  platform: string | null;
  /** Señales de web antigua que se ven en el código («jQuery 1.12», «Flash»…). */
  old: string[];
  legal: { notice: boolean; privacy: boolean; cookies: boolean; terms: boolean };
  /** Se ve un aviso o gestor de cookies; null = no se puede saber (lo pone la plataforma o carga después). */
  cookieBanner: boolean | null;
  /** Analítica y píxeles que carga («Google Analytics», «Meta Pixel»…). */
  trackers: string[];
  /**
   * SEO básico de la portada (criterio de Cristian: «ver si el SEO está mal… lo básico para saber que necesitan ayuda»):
   * título, descripción, un H1, idioma, vista previa para redes (Open Graph), imágenes sin texto alternativo y si pide
   * no salir en buscadores. Opcional: lo guardado antes de tenerlo no lo trae.
   */
  seo?: { title: string | null; description: boolean; h1: number; lang: boolean; og: boolean; images: number; noAlt: number; noindex: boolean };
}

export const unreachable = (url: string): WebAudit => ({ url, ok: false, https: url.startsWith('https:'), mobile: false, year: null, platform: null, old: [], legal: { notice: false, privacy: false, cookies: false, terms: false }, cookieBanner: null, trackers: [] });

const PLATFORMS: Array<[RegExp, string]> = [
  [/wp-content|wp-includes/i, 'WordPress'], [/static\.wixstatic\.com|wix\.com|_wixCssImports/i, 'Wix'], [/squarespace/i, 'Squarespace'],
  [/cdn\.shopify\.com|Shopify\.theme/i, 'Shopify'], [/webflow/i, 'Webflow'], [/\/media\/jui\/|joomla/i, 'Joomla'], [/drupal/i, 'Drupal'],
  [/prestashop/i, 'PrestaShop'], [/jimdo/i, 'Jimdo'], [/weebly/i, 'Weebly'], [/img1\.wsimg\.com/i, 'GoDaddy'], [/mobirise/i, 'Mobirise'], [/framer\.(com|app)/i, 'Framer'],
];
// Gestores de cookies conocidos (el script o sus clases).
const CMP = /cookiebot|cookieyes|cdn-cookieyes|complianz|cmplz|onetrust|optanon|cookie-law-info|cookielawinfo|iubenda|didomi|usercentrics|termly|osano|quantcast|cookie-notice|cookieconsent|cookie-consent|moove_gdpr|borlabs|real-cookie-banner|axeptio|tarteaucitron|klaro|cookiefirst|consentmanager|cookie-script|cookiehub|gdpr-cookie/i;
const COOKIE_TEXT = /(aceptar|acepto|accept|rechazar|configurar)\s+(todas\s+)?(las\s+)?cookies|usamos cookies|utilizamos cookies|utiliza cookies|we use cookies|uses cookies|este sitio (web )?(usa|utiliza) cookies/i;
const TRACKERS: Array<[RegExp, string]> = [
  [/googletagmanager\.com\/gtag|google-analytics\.com|gtag\(\s*['"]config['"]\s*,\s*['"](G|UA)-/i, 'Google Analytics'], [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i, 'Google Tag Manager'],
  [/connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/i, 'Meta Pixel'], [/static\.hotjar\.com|hotjar/i, 'Hotjar'], [/analytics\.tiktok\.com|ttq\.load/i, 'TikTok Pixel'],
  [/snap\.licdn\.com|_linkedin_partner_id/i, 'LinkedIn Insight'], [/googleadservices\.com|AW-\d{6,}/i, 'Google Ads'],
];

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;
const text = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&copy;|&#169;/gi, '©').replace(/\s+/g, ' ');

/** Lo que se ve en el código de la portada. `now` para no dar por antiguo el año que viene. */
export function auditHtml(html: string, url: URL, now = new Date()): WebAudit {
  const plain = text(html);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (name: string) => metas.find((m) => (attr(m, 'name') ?? attr(m, 'property') ?? '').toLowerCase() === name);
  // Año: el más alto que acompañe a ©/copyright, sin pasarse del año que viene (los «© 2099» de plantilla).
  const years = [...plain.matchAll(/(?:©|\(c\)|copyright)\s*(?:[a-z.]+\s+)?(?:(?:19|20)\d{2}\s*[-–—]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1])).filter((y) => y <= now.getFullYear() + 1);
  const gen = meta('generator') ? attr(meta('generator')!, 'content') : null;
  const platform = (gen && gen.trim().slice(0, 40)) || PLATFORMS.find(([re]) => re.test(html))?.[1] || null;
  const old: string[] = [];
  const jq = /jquery[.-]?(1\.\d+(?:\.\d+)?)(?:\.min)?\.js/i.exec(html) ?? /jquery(?:\.min)?\.js\?ver=(1\.\d+(?:\.\d+)?)/i.exec(html);
  if (jq) old.push(`jQuery ${jq[1]}`);
  const wp = /WordPress\s+(\d+)\.(\d+)/i.exec(gen ?? '');
  if (wp && Number(wp[1]) < 5) old.push(`WordPress ${wp[1]}.${wp[2]}`);
  if (/\.swf\b|x-shockwave-flash/i.test(html)) old.push('Flash');
  if (/<(frameset|frame)\b/i.test(html)) old.push('Frames');
  if (/<(font|marquee|center)\b/i.test(html)) old.push('HTML antiguo (<font>, <center>…)');
  if (/<!DOCTYPE\s+html\s+PUBLIC\s+"-\/\/W3C\/\/DTD\s+(X?HTML)\s+(4|1\.0)/i.test(html)) old.push('HTML 4 / XHTML 1.0');
  if (/<!--\[if\s+(lt\s+)?IE/i.test(html)) old.push('Código para Internet Explorer');
  // Enlaces legales: por el texto del enlace o su dirección (también a otro dominio, p. ej. iubenda).
  const links = [...html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]*)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)].map((m) => `${decodeSafe(m[1])} ${text(m[2])}`.toLowerCase());
  const has = (re: RegExp) => links.some((l) => re.test(l));
  const legal = {
    notice: has(/aviso[\s_-]*legal|legal[\s_-]*notice|nota[\s_-]*legal|informaci[oó]n[\s_-]*legal|impressum|\/legal\b/),
    privacy: has(/privacidad|privacy|protecci[oó]n[\s_-]*de[\s_-]*datos|rgpd|gdpr/),
    cookies: has(/cookie/),
    terms: has(/t[eé]rminos|condiciones|terms|conditions/),
  };
  const builtIn = platform && /^(Wix|Squarespace|Shopify|Webflow|Framer)/i.test(platform);
  const cookieBanner = CMP.test(html) || COOKIE_TEXT.test(plain) ? true : builtIn ? null : false;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const titleText = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const seo = {
    title: titleText ? text(titleText).trim().slice(0, 120) || null : null,
    description: !!(meta('description') && (attr(meta('description')!, 'content') ?? '').trim().length >= 30),
    h1: (html.match(/<h1\b/gi) ?? []).length,
    lang: /<html\b[^>]*\blang\s*=\s*["'][a-z]{2}/i.test(html),
    og: !!(meta('og:title') || meta('og:image')),
    images: imgs.length,
    noAlt: imgs.filter((t) => !(attr(t, 'alt') ?? '').trim()).length,
    noindex: /noindex/i.test(attr(meta('robots') ?? '', 'content') ?? ''),
  };
  return {
    seo,
    url: url.toString(), ok: true, https: url.protocol === 'https:', mobile: !!meta('viewport'),
    year: years.length ? Math.max(...years) : null, platform, old, legal, cookieBanner,
    trackers: TRACKERS.filter(([re]) => re.test(html)).map(([, n]) => n),
  };
}
function decodeSafe(s: string) { try { return decodeURIComponent(s); } catch { return s; } }

/** Lo que falla, para contar «N cosas a mejorar» y para la IA. Con el año, «antigua» si tiene 3 años o más. */
export function auditProblems(a: WebAudit, now = new Date()): string[] {
  if (!a.ok) return ['unreachable'];
  const p: string[] = [];
  if (!a.https) p.push('https');
  if (!a.mobile) p.push('mobile');
  if (a.year != null && a.year <= now.getFullYear() - 3) p.push('year');
  if (a.old.length) p.push('old');
  if (!a.legal.notice) p.push('notice');
  if (!a.legal.privacy) p.push('privacy');
  if (!a.legal.cookies) p.push('cookies');
  if (a.cookieBanner === false) p.push('banner');
  if (a.cookieBanner === false && a.trackers.length) p.push('trackersNoConsent');
  for (const k of seoProblems(a)) p.push(k);
  return p;
}

/**
 * Lo que falla del SEO básico: sin título o con uno que no dice nada (menos de 10 letras o más de 70), sin descripción,
 * sin H1, sin idioma, sin vista previa para redes, la mitad o más de las imágenes sin texto alternativo, o pide no salir
 * en buscadores.
 */
export function seoProblems(a: WebAudit): string[] {
  const s = a.seo;
  if (!a.ok || !s) return [];
  const p: string[] = [];
  if (!s.title || s.title.length < 10 || s.title.length > 70) p.push('seoTitle');
  if (!s.description) p.push('seoDescription');
  if (s.h1 === 0) p.push('seoH1');
  if (!s.lang) p.push('seoLang');
  if (!s.og) p.push('seoOg');
  if (s.images >= 2 && s.noAlt * 2 >= s.images) p.push('seoAlt');
  if (s.noindex) p.push('seoNoindex');
  return p;
}

/** En texto, para la IA (en español: es para el modelo, no para la persona). */
export function auditText(a: WebAudit): string {
  if (!a.ok) return `No se ha podido abrir su web (${a.url}): puede estar caída.`;
  const yn = (b: boolean) => (b ? 'sí' : 'no');
  return [
    `Web: ${a.url}`, `HTTPS: ${yn(a.https)}`, `Hecha para el móvil (viewport): ${yn(a.mobile)}`,
    `Año del copyright: ${a.year ?? 'no lo pone'}`, `Plataforma: ${a.platform ?? 'no se sabe'}`,
    `Señales de web antigua: ${a.old.join(', ') || 'ninguna en el código'}`,
    `Enlaces en la portada → aviso legal: ${yn(a.legal.notice)}, privacidad: ${yn(a.legal.privacy)}, cookies: ${yn(a.legal.cookies)}, términos: ${yn(a.legal.terms)}`,
    `Banner o gestor de cookies: ${a.cookieBanner === null ? 'no se puede saber (lo pone la plataforma)' : yn(a.cookieBanner)}`,
    `Analítica y píxeles: ${a.trackers.join(', ') || 'ninguno visible'}`,
    ...(a.seo ? [`SEO básico → título: ${a.seo.title ? `«${a.seo.title}»` : 'no tiene'}, meta descripción: ${yn(a.seo.description)}, H1: ${a.seo.h1}, idioma declarado: ${yn(a.seo.lang)}, vista previa para redes (Open Graph): ${yn(a.seo.og)}, imágenes sin texto alternativo: ${a.seo.noAlt} de ${a.seo.images}, pide no salir en buscadores (noindex): ${yn(a.seo.noindex)}`] : []),
  ].join('\n');
}

/** Lo guardado (jsonb) → WebAudit, o null si no hay o está roto. */
export function readAudit(v: unknown): WebAudit | null {
  const a = v as WebAudit | null;
  if (!a || typeof a !== 'object' || typeof a.url !== 'string' || typeof a.ok !== 'boolean' || !a.legal || typeof a.legal !== 'object') return null;
  return {
    url: a.url.slice(0, 500), ok: a.ok, https: !!a.https, mobile: !!a.mobile, year: typeof a.year === 'number' ? a.year : null,
    platform: typeof a.platform === 'string' ? a.platform.slice(0, 40) : null, old: Array.isArray(a.old) ? a.old.filter((x) => typeof x === 'string').slice(0, 8) : [],
    legal: { notice: !!a.legal.notice, privacy: !!a.legal.privacy, cookies: !!a.legal.cookies, terms: !!a.legal.terms },
    cookieBanner: typeof a.cookieBanner === 'boolean' ? a.cookieBanner : null, trackers: Array.isArray(a.trackers) ? a.trackers.filter((x) => typeof x === 'string').slice(0, 8) : [],
    ...(a.seo && typeof a.seo === 'object' ? { seo: {
      title: typeof a.seo.title === 'string' ? a.seo.title.slice(0, 120) : null, description: !!a.seo.description, h1: Number(a.seo.h1) || 0, lang: !!a.seo.lang, og: !!a.seo.og,
      images: Number(a.seo.images) || 0, noAlt: Number(a.seo.noAlt) || 0, noindex: !!a.seo.noindex,
    } } : {}),
  };
}
