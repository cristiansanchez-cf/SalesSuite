/**
 * QR de mentira para las pantallas recreadas: siempre el mismo para el mismo texto, con sus tres esquinas y un hueco
 * en el centro para el isotipo. No se puede escanear (no lleva a ningún sitio): es dibujo.
 */
export function fakeQr(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const n = 25; const cells: string[] = [];
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    h = Math.imul(h ^ (x * 31 + y), 2246822519) >>> 0;
    if (h % 100 < 47 && !(x > 9 && x < 15 && y > 9 && y < 15)) cells.push(`M${x} ${y}h1v1h-1z`);
  }
  const f = (x: number, y: number) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${f(0, 0)}${f(n - 7, 0)}${f(0, n - 7)}${cells.join('')}"/></svg>`;
}
