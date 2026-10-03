/** «45 s», «3,5 min», «1,2 h» en el idioma de quien lee. */
export function duration(ms: number, tag: string): string {
  const u = (unit: string, n: number) => new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (ms < 60_000) return u('second', Math.round(ms / 1000));
  if (ms < 3_600_000) return u('minute', Math.round(ms / 6_000) / 10);
  return u('hour', Math.round(ms / 360_000) / 10);
}
