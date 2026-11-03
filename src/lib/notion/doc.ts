/**
 * El cuerpo de una página de Notion, normalizado (docs/CRM_DINAMICO.md §48): lo justo para enseñarlo con su formato
 * (encabezados, listas, tablas, desplegables, citas…), sacar su texto (la huella con la que se verifica que no falta
 * nada) y su Markdown (las notas de las interacciones). Nada de HTML de Notion: se pinta escapado (`renderDoc`).
 */
import { createHash } from 'node:crypto';

/** Un trozo de texto con su formato. */
export interface Span { t: string; b?: 1; i?: 1; s?: 1; u?: 1; c?: 1; href?: string }
export type DocBlockType =
  | 'paragraph' | 'heading' | 'bulleted' | 'numbered' | 'todo' | 'toggle' | 'quote' | 'callout' | 'code' | 'divider'
  | 'table' | 'link' | 'file' | 'equation' | 'unsupported';
export interface DocBlock {
  type: DocBlockType;
  text?: Span[];
  children?: DocBlock[];
  /** Encabezado: 1, 2 o 3 (y si en Notion se plegaba). */
  level?: 1 | 2 | 3; toggleable?: boolean;
  checked?: boolean; lang?: string; icon?: string;
  /** Tabla: filas → celdas → trozos; y si la primera fila es la cabecera. */
  rows?: Span[][][]; header?: boolean;
  /** Enlace, archivo o página enlazada: a dónde va y cómo se llama. */
  url?: string; label?: string;
  /** Tipo de Notion que no se sabe pintar (se cuenta en la verificación). */
  raw?: string;
}

// ---------------------------------------------------------------- de Notion al documento
/* eslint-disable @typescript-eslint/no-explicit-any */
type NRich = { type?: string; plain_text?: string; href?: string | null; annotations?: Record<string, unknown> };
export function spans(rich: NRich[] | undefined | null): Span[] {
  return (rich ?? []).map((r) => {
    const a = r.annotations ?? {};
    const s: Span = { t: String(r.plain_text ?? '') };
    if (a.bold) s.b = 1;
    if (a.italic) s.i = 1;
    if (a.strikethrough) s.s = 1;
    if (a.underline) s.u = 1;
    if (a.code) s.c = 1;
    if (r.href && /^(https?:|mailto:)/i.test(r.href)) s.href = r.href;
    return s;
  }).filter((s) => s.t !== '');
}
export const plain = (sp: Span[] | undefined) => (sp ?? []).map((s) => s.t).join('');

/** Un bloque de la API de Notion (con sus hijos ya leídos en `children`) → bloque del documento. */
export function fromNotion(b: any): DocBlock {
  const v = b?.[b?.type] ?? {};
  const kids = Array.isArray(b?.children) ? (b.children as any[]).map(fromNotion) : undefined;
  const withKids = (x: DocBlock): DocBlock => (kids?.length && x.type !== 'table' ? { ...x, children: kids } : x);
  const fileUrl = (f: any) => f?.external?.url ?? f?.file?.url ?? null;
  switch (b?.type) {
    case 'paragraph': return withKids({ type: 'paragraph', text: spans(v.rich_text) });
    case 'heading_1': case 'heading_2': case 'heading_3':
      return withKids({ type: 'heading', level: Number(b.type.slice(-1)) as 1 | 2 | 3, toggleable: !!v.is_toggleable, text: spans(v.rich_text) });
    case 'bulleted_list_item': return withKids({ type: 'bulleted', text: spans(v.rich_text) });
    case 'numbered_list_item': return withKids({ type: 'numbered', text: spans(v.rich_text) });
    case 'to_do': return withKids({ type: 'todo', checked: !!v.checked, text: spans(v.rich_text) });
    case 'toggle': return withKids({ type: 'toggle', text: spans(v.rich_text) });
    case 'quote': return withKids({ type: 'quote', text: spans(v.rich_text) });
    case 'callout': return withKids({ type: 'callout', icon: v.icon?.emoji ?? undefined, text: spans(v.rich_text) });
    case 'code': return { type: 'code', lang: v.language ?? undefined, text: spans(v.rich_text) };
    case 'divider': return { type: 'divider' };
    case 'equation': return { type: 'equation', text: [{ t: String(v.expression ?? '') }] };
    case 'table': return {
      type: 'table', header: !!v.has_column_header,
      rows: (kids ? (b.children as any[]) : []).filter((r) => r?.type === 'table_row').map((r) => ((r.table_row?.cells ?? []) as NRich[][]).map((c) => spans(c))),
    };
    case 'bookmark': case 'embed': case 'link_preview':
      return { type: 'link', url: v.url ?? undefined, label: plain(spans(v.caption)) || v.url || '' };
    case 'image': case 'file': case 'pdf': case 'video': case 'audio':
      return { type: 'file', url: fileUrl(v) ?? undefined, label: plain(spans(v.caption)) || v.name || b.type };
    case 'child_page': return { type: 'link', label: v.title ?? '', raw: 'child_page' };
    case 'child_database': return { type: 'link', label: v.title ?? '', raw: 'child_database' };
    case 'link_to_page': return { type: 'link', label: '', raw: 'link_to_page' };
    // Contenedores sin forma propia: sus hijos, tal cual.
    case 'column_list': case 'column': case 'synced_block': case 'template':
      return { type: 'paragraph', text: [], children: kids ?? [] };
    case 'table_of_contents': case 'breadcrumb': return { type: 'divider', raw: b.type };
    default: return withKids({ type: 'unsupported', raw: String(b?.type ?? 'desconocido'), text: spans(v.rich_text) });
  }
}

// ---------------------------------------------------------------- texto, huella y recuento
/** El texto del documento, bloque a bloque (lo que se compara con Notion: si falta algo, la huella cambia). */
export function docText(blocks: DocBlock[]): string {
  const out: string[] = [];
  const walk = (bs: DocBlock[]) => {
    for (const b of bs) {
      if (b.type === 'table') for (const r of b.rows ?? []) out.push(r.map((c) => plain(c)).join(' | '));
      else if (b.type === 'link' || b.type === 'file') out.push([b.label, b.url].filter(Boolean).join(' '));
      else if (b.text?.length) out.push(plain(b.text));
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out.join('\n');
}
/** Huella del texto (espacios normalizados: Notion y la copia pueden partir las líneas distinto). */
export const textHash = (text: string) => `sha256:${createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex')}`;
/** Cuántos bloques de cada tipo (otra comprobación de que no falta nada). */
export function blockCounts(blocks: DocBlock[]): Record<string, number> {
  const c: Record<string, number> = {};
  const walk = (bs: DocBlock[]) => { for (const b of bs) { c[b.type] = (c[b.type] ?? 0) + 1; if (b.children?.length) walk(b.children); } };
  walk(blocks);
  return c;
}

// ---------------------------------------------------------------- Markdown (notas de las interacciones)
const mdEsc = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1');
export function spansMd(sp: Span[] | undefined): string {
  return (sp ?? []).map((s) => {
    if (s.c) return `\`${s.t.replace(/`/g, "'")}\``;
    let t = mdEsc(s.t);
    // El formato no puede abarcar espacios de los bordes en Markdown: se dejan fuera.
    const lead = t.match(/^\s*/)![0], tail = t.match(/\s*$/)![0];
    t = t.trim();
    if (!t) return lead + tail;
    if (s.b) t = `**${t}**`;
    if (s.i) t = `*${t}*`;
    if (s.s) t = `~~${t}~~`;
    if (s.href) t = `[${t}](${s.href})`;
    return lead + t + tail;
  }).join('');
}
export function docMarkdown(blocks: DocBlock[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  let n = 0;
  for (const b of blocks) {
    n = b.type === 'numbered' ? n + 1 : 0;
    const txt = spansMd(b.text).replace(/\n/g, `\n${pad}  `);
    const sub = b.children?.length ? docMarkdown(b.children, depth + 1) : '';
    switch (b.type) {
      case 'heading': lines.push(`${pad}${'#'.repeat(b.level ?? 2)} ${txt}`); if (sub) lines.push(sub); break;
      case 'bulleted': lines.push(`${pad}- ${txt}`); if (sub) lines.push(sub); break;
      case 'numbered': lines.push(`${pad}${n}. ${txt}`); if (sub) lines.push(sub); break;
      case 'todo': lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${txt}`); if (sub) lines.push(sub); break;
      case 'toggle': lines.push(`${pad}▸ ${txt}`); if (sub) lines.push(sub); break;
      case 'quote': case 'callout': lines.push(`${pad}> ${b.icon ? `${b.icon} ` : ''}${txt.replace(/\n/g, `\n${pad}> `)}`); if (sub) lines.push(sub); break;
      case 'code': lines.push(`${pad}\`\`\`${b.lang ?? ''}\n${plain(b.text)}\n${pad}\`\`\``); break;
      case 'divider': lines.push(`${pad}---`); break;
      case 'equation': lines.push(`${pad}$${plain(b.text)}$`); break;
      case 'table': {
        const rows = (b.rows ?? []).map((r) => `${pad}| ${r.map((c) => spansMd(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
        if (rows.length) rows.splice(1, 0, `${pad}|${' --- |'.repeat((b.rows ?? [])[0]?.length ?? 1)}`);
        lines.push(rows.join('\n'));
        break;
      }
      case 'link': case 'file': lines.push(`${pad}${b.url ? `[${mdEsc(b.label || b.url)}](${b.url})` : mdEsc(b.label ?? '')}`); break;
      default: if (txt) lines.push(`${pad}${txt}`); if (sub) lines.push(sub);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- HTML (la ficha)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (u: string | undefined) => (u && /^(https?:\/\/|mailto:)/i.test(u) ? u : null);
export function spansHtml(sp: Span[] | undefined): string {
  return (sp ?? []).map((s) => {
    let h = esc(s.t).replace(/\n/g, '<br>');
    if (s.c) h = `<code>${h}</code>`;
    if (s.b) h = `<strong>${h}</strong>`;
    if (s.i) h = `<em>${h}</em>`;
    if (s.s) h = `<s>${h}</s>`;
    if (s.u) h = `<u>${h}</u>`;
    const href = safeHref(s.href);
    if (href) h = `<a href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${h}</a>`;
    return h;
  }).join('');
}
/** El documento en HTML: todo escapado; los enlaces, solo http(s) y mailto. */
export function renderDoc(blocks: DocBlock[]): string {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const kids = b.children?.length ? renderDoc(b.children) : '';
    // Listas seguidas del mismo tipo: una sola lista.
    if (b.type === 'bulleted' || b.type === 'numbered' || b.type === 'todo') {
      const tag = b.type === 'numbered' ? 'ol' : 'ul';
      const items: string[] = [];
      let j = i;
      for (; j < blocks.length && blocks[j].type === b.type; j++) {
        const x = blocks[j];
        const box = x.type === 'todo' ? `<input type="checkbox" disabled${x.checked ? ' checked' : ''}> ` : '';
        items.push(`<li>${box}${spansHtml(x.text)}${x.children?.length ? renderDoc(x.children) : ''}</li>`);
      }
      out.push(`<${tag}${b.type === 'todo' ? ' class="doc-todo"' : ''}>${items.join('')}</${tag}>`);
      i = j - 1;
      continue;
    }
    switch (b.type) {
      case 'heading': {
        const tag = `h${(b.level ?? 2) + 2}`;
        out.push(b.toggleable ? `<details class="doc-toggle"><summary><${tag}>${spansHtml(b.text)}</${tag}></summary>${kids}</details>` : `<${tag}>${spansHtml(b.text)}</${tag}>${kids}`);
        break;
      }
      case 'toggle': out.push(`<details class="doc-toggle"><summary>${spansHtml(b.text)}</summary>${kids}</details>`); break;
      case 'quote': out.push(`<blockquote>${spansHtml(b.text)}${kids}</blockquote>`); break;
      case 'callout': out.push(`<aside class="doc-callout">${b.icon ? `<span>${esc(b.icon)}</span> ` : ''}${spansHtml(b.text)}${kids}</aside>`); break;
      case 'code': out.push(`<pre><code>${esc(plain(b.text))}</code></pre>`); break;
      case 'divider': if (!b.raw) out.push('<hr>'); break;
      case 'equation': out.push(`<p><code>${esc(plain(b.text))}</code></p>`); break;
      case 'table': {
        const rows = b.rows ?? [];
        const head = b.header && rows.length ? `<thead><tr>${rows[0].map((c) => `<th>${spansHtml(c)}</th>`).join('')}</tr></thead>` : '';
        const body = (b.header ? rows.slice(1) : rows).map((r) => `<tr>${r.map((c) => `<td>${spansHtml(c)}</td>`).join('')}</tr>`).join('');
        out.push(`<div class="doc-table"><table>${head}<tbody>${body}</tbody></table></div>`);
        break;
      }
      case 'link': case 'file': {
        const href = safeHref(b.url);
        out.push(`<p>${href ? `<a href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${esc(b.label || href)}</a>` : esc(b.label || '')}</p>`);
        break;
      }
      default: {
        const t = spansHtml(b.text);
        if (t) out.push(`<p>${t}</p>`);
        if (kids) out.push(kids);
      }
    }
  }
  return out.join('');
}
