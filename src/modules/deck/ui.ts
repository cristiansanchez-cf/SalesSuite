/**
 * Piezas comunes de los bloques de deck (docs/DECKS.md).
 *  · `rich`: texto con *acento* (sale en el color principal) y **negrita**. Sin HTML: se pinta con Rich.astro.
 *  · `countOf`: la cifra de un valor («47.500€», «~9,700», «24% de pago», «200+») para animarla contando, con su
 *    prefijo, sufijo y separadores tal cual. Sin cifra (o «—»): null y se enseña el texto sin animar.
 */
export interface Seg { text: string; bold?: boolean; accent?: boolean }

export function rich(text: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, accent: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Quita las marcas (para títulos de accesibilidad o textos planos). */
export const plain = (text: string) => rich(text).map((s) => s.text).join('');

export interface CountParts { prefix: string; target: number; decimals: number; group: string; dec: string; suffix: string }

export function countOf(value: string): CountParts | null {
  const m = /^(\D*?)(\d{1,3}(?:([.,])\d{3})+(?!\d)|\d+(?:([.,])(\d+))?)(.*)$/s.exec(value);
  if (!m) return null;
  const [, prefix, num, group, dec, decs, suffix] = m;
  if (group) return { prefix: prefix!, target: Number(num!.split(group).join('')), decimals: 0, group, dec: group === '.' ? ',' : '.', suffix: suffix! };
  if (dec) return { prefix: prefix!, target: Number(num!.replace(dec, '.')), decimals: decs!.length, group: dec === ',' ? '.' : ',', dec, suffix: suffix! };
  return { prefix: prefix!, target: Number(num), decimals: 0, group: '', dec: ',', suffix: suffix! };
}

/** Un número con los separadores del original («47.500», «9,700», «26,3»). */
export function formatCount(n: number, p: Pick<CountParts, 'decimals' | 'group' | 'dec'>): string {
  const [int, frac] = n.toFixed(p.decimals).split('.');
  const grouped = p.group && int!.length > 3 ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, p.group) : int!;
  return frac ? `${grouped}${p.dec}${frac}` : grouped;
}
