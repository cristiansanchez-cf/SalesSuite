/**
 * Titular a dos tonos: si el título lleva coma, lo que va detrás sale atenuado («Tu pantalla, desde tu móvil»).
 * Solo cuando las dos partes tienen cuerpo (la cola, dos palabras o más); si no, el título va entero.
 */
export function splitHeadline(text: string): [string, string | null] {
  const i = text.indexOf(', ');
  if (i < 3) return [text, null];
  const head = text.slice(0, i + 1);
  const tail = text.slice(i + 1);
  return tail.trim().split(/\s+/).length >= 2 ? [head, tail] : [text, null];
}
