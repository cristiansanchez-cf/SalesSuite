/** Tiempos de una petición, por tramos, para la cabecera Server-Timing (y los avisos de página lenta). */
export function serverTiming(now: () => number = () => performance.now()) {
  const start = now();
  let last = start;
  const parts: Array<[string, number]> = [];
  return {
    mark(name: string) { const t = now(); parts.push([name, t - last]); last = t; },
    total: () => last - start,
    header: () => [...parts, ['total', last - start] as [string, number]].map(([n, d]) => `${n};dur=${d.toFixed(0)}`).join(', '),
  };
}
