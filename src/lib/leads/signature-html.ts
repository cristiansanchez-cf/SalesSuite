/**
 * La firma pegada desde Gmail u Outlook (Leads entrantes → Tus mensajes y tu firma). Llega como HTML del portapapeles y
 * acaba dentro de los emails y de la consola, así que se limpia aquí, en el servidor, con una lista de lo permitido:
 *  - Etiquetas de texto, enlaces, imágenes y tablas (las firmas van en tablas). Lo demás se desenvuelve (queda el texto)
 *    o se quita con su contenido (scripts, estilos, formularios, SVG…).
 *  - Atributos: los justos por etiqueta. Enlaces solo http(s), mailto y tel. Imágenes solo por https: las pegadas
 *    desde el ordenador (data:, cid:) no se ven en un email y se quitan (se cuentan para avisar).
 *  - Estilos en línea: solo propiedades de texto, color, caja y borde; nada con url(), expresiones ni etiquetas.
 */
import { parseFragment } from 'parse5';

type Node = { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };

export const SIGNATURE_HTML_MAX = 20_000;

const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'head', 'meta', 'link', 'title', 'noscript', 'template', 'video', 'audio', 'canvas', 'base']);
const KEEP = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img', 'hr', 'small', 'sup', 'sub', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4']);
const VOID = new Set(['br', 'img', 'hr']);
const ATTRS: Record<string, string[]> = {
  a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], table: ['cellpadding', 'cellspacing', 'border', 'width', 'role', 'align'],
  td: ['colspan', 'rowspan', 'width', 'height', 'valign', 'align'], th: ['colspan', 'rowspan', 'width', 'height', 'valign', 'align'], tr: ['valign', 'align'],
  p: ['align'], div: ['align'],
};
const STYLE_PROPS = new Set([
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-transform', 'line-height',
  'letter-spacing', 'text-align', 'vertical-align', 'white-space', 'display', 'width', 'height', 'max-width', 'min-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width', 'border-radius', 'border-collapse',
]);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

function cleanStyle(v: string): string {
  return v.split(';').map((d) => {
    const i = d.indexOf(':');
    if (i < 0) return '';
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop) || !val || val.length > 200) return '';
    if (/url\s*\(|expression|javascript:|behavior|@import|[<>\\]/i.test(val)) return '';
    return `${prop}:${val}`;
  }).filter(Boolean).join(';');
}

const safeHref = (v: string) => (/^(https?:|mailto:|tel:)/i.test(v.trim()) ? v.trim() : null);

export interface CleanSignature { html: string; droppedImages: number }

/** Limpia el HTML pegado. `html` vacío si no queda nada con contenido. */
export function sanitizeSignatureHtml(input: string): CleanSignature {
  let dropped = 0;
  const walk = (nodes: Node[] | undefined): string => (nodes ?? []).map((n) => {
    if (n.nodeName === '#text') return esc(n.value ?? '');
    if (n.nodeName === '#comment' || n.nodeName === '#documentType') return '';
    const tag = (n.tagName ?? n.nodeName).toLowerCase();
    if (DROP.has(tag)) return '';
    if (!KEEP.has(tag)) return walk(n.childNodes);
    const attrs: string[] = [];
    for (const a of n.attrs ?? []) {
      const name = a.name.toLowerCase();
      if (name === 'style') { const st = cleanStyle(a.value); if (st) attrs.push(`style="${escAttr(st)}"`); continue; }
      if (!(ATTRS[tag] ?? []).includes(name)) continue;
      if (name === 'href') { const h = safeHref(a.value); if (h) attrs.push(`href="${escAttr(h)}"`); continue; }
      if (name === 'src') continue;
      if (['width', 'height', 'cellpadding', 'cellspacing', 'border', 'colspan', 'rowspan'].includes(name) && !/^\d{1,4}%?$/.test(a.value.trim())) continue;
      attrs.push(`${name}="${escAttr(a.value.slice(0, 200))}"`);
    }
    if (tag === 'img') {
      const src = (n.attrs ?? []).find((a) => a.name.toLowerCase() === 'src')?.value.trim() ?? '';
      if (!/^https:\/\//i.test(src) || src.length > 1000) { dropped++; return ''; }
      attrs.unshift(`src="${escAttr(src)}"`);
    }
    if (tag === 'a' && !attrs.some((x) => x.startsWith('href='))) return walk(n.childNodes);
    const open = `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
    return VOID.has(tag) ? open : `${open}${walk(n.childNodes)}</${tag}>`;
  }).join('');

  const frag = parseFragment(String(input ?? '').slice(0, 200_000)) as unknown as Node;
  let html = walk(frag.childNodes).trim();
  // Lo vacío que deja Gmail al final (<div><br></div>) no cuenta.
  const hasContent = /<img\s/i.test(html) || signatureHtmlToText(html).trim().length > 0;
  if (!hasContent) html = '';
  return { html: html.slice(0, SIGNATURE_HTML_MAX), droppedImages: dropped };
}

const BLOCK = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'hr']);

/** La firma en texto, para la versión sin formato del email: líneas, y los enlaces con su dirección si no se ve. */
export function signatureHtmlToText(html: string): string {
  const frag = parseFragment(html) as unknown as Node;
  const walk = (nodes: Node[] | undefined): string => (nodes ?? []).map((n) => {
    if (n.nodeName === '#text') return (n.value ?? '').replace(/\s+/g, ' ');
    const tag = (n.tagName ?? n.nodeName).toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'img') return '';
    const inner = walk(n.childNodes);
    if (tag === 'a') {
      const href = (n.attrs ?? []).find((a) => a.name === 'href')?.value ?? '';
      const shown = inner.trim();
      const plain = href.replace(/^(mailto:|tel:)/i, '');
      return !href || shown.includes(plain) || plain.includes(shown) ? inner : `${inner} (${plain})`;
    }
    if (tag === 'td' || tag === 'th') return `${inner} `;
    return BLOCK.has(tag) ? `\n${inner}\n` : inner;
  }).join('');
  return walk(frag.childNodes).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim();
}
