/**
 * Markdown mínimo y SEGURO para jugadas: se escapa todo el HTML y solo se interpretan
 * **negrita**, *cursiva*, listas "- " y párrafos. Nada de enlaces ni HTML crudo.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) {
      if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; }
      list.push(line.replace(/^\s*[-•]\s+/, ''));
    } else if (line.trim() === '') flush();
    else {
      if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; }
      para.push(line);
    }
  }
  flush();
  return out.join('');
}

/** Texto plano (para copiar el guion). */
export function stripMarkdown(src: string): string {
  return src.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2');
}

/**
 * Lo principal de un texto, en plano y para leer de un vistazo (tarjetas, listas): sin marcas de Markdown, en una línea,
 * y cortado en un final de frase (o de palabra, con «…») cerca de `max`. Nunca deja una lista en su «1.».
 */
export function summarize(src: string, max = 220): string {
  const plain = stripMarkdown(src)
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:>\s*|#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  // Sin partir un emoji (u otro carácter de dos unidades UTF-16) por la mitad.
  const at = (n: number) => (/[\uD800-\uDBFF]/.test(plain[n - 1] ?? '') ? n - 1 : n);
  const cut = plain.slice(0, at(max));
  // Un final de frase justo en `max` también cuenta (va seguido del espacio que queda fuera del corte).
  const look = plain.slice(0, max + 1);
  const end = Math.max(look.lastIndexOf('. '), look.lastIndexOf('! '), look.lastIndexOf('? '), look.lastIndexOf('» '));
  if (end >= max * 0.45) return look.slice(0, end + 1).trim();
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut.slice(0, at(cut.length - 1))).replace(/[,;:—–-]+$/, '')}…`;
}
