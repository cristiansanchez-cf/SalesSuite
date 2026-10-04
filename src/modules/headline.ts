/**
 * Titular a dos tonos: si el título lleva coma, lo que va detrás sale atenuado («Tu pantalla, desde tu móvil»).
 * Solo cuando las dos partes tienen cuerpo (la cola, dos palabras o más); si no, el título va entero.
 * Con `loose` (la portada): la cola tras la coma puede ser de una palabra («Tu pantalla, vendiendo») y, sin coma,
 * parte antes del último nexo («que», «cuando», «para»…) con dos palabras o más a cada lado y sin dejar un artículo
 * colgando («la hora en la | que…» no parte).
 */
const COLGANTES = new Set(['el', 'la', 'lo', 'los', 'las', 'un', 'una', 'en', 'de', 'a', 'al', 'del', 'the', 'a', 'an', 'in', 'of', 'to']);
const NEXOS = new Set(['que', 'cuando', 'para', 'con', 'sin', 'desde', 'mientras', 'donde', 'porque', 'that', 'when', 'for', 'with', 'without', 'while', 'where']);

export function splitHeadline(text: string, loose = false): [string, string | null] {
  const i = text.indexOf(', ');
  if (i >= 3) {
    const tail = text.slice(i + 1);
    if (tail.trim().split(/\s+/).length >= (loose ? 1 : 2)) return [text.slice(0, i + 1), tail];
  }
  if (!loose || i >= 0) return [text, null];
  const words = text.split(' ');
  for (let k = words.length - 2; k >= 2; k--) {
    if (NEXOS.has(words[k].toLowerCase()) && !COLGANTES.has(words[k - 1].toLowerCase())) return [words.slice(0, k).join(' '), ' ' + words.slice(k).join(' ')];
  }
  return [text, null];
}
