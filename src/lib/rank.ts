/**
 * Rank fraccional para dossier_item.position (numeric en Postgres).
 * Reordenar = recalcular la posición de UN item entre sus vecinos; nunca se renumera la lista.
 * Si los huecos se agotan (diferencia < EPS) se pide un rebalanceo.
 */
export const STEP = 1024;
const EPS = 1e-6;

export function rankBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return STEP;
  if (before == null) return after! - STEP;
  if (after == null) return before + STEP;
  if (after <= before) throw new Error('rankBetween: after debe ser > before');
  return before + (after - before) / 2;
}

export function needsRebalance(positions: number[]): boolean {
  const s = [...positions].sort((a, b) => a - b);
  return s.some((p, i) => i > 0 && p - s[i - 1] < EPS);
}

export function rebalance(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * STEP);
}

/** Posición nueva al mover el item de `from` a `to` en una lista ya ordenada. */
export function rankForMove(sorted: number[], from: number, to: number): number {
  const rest = sorted.filter((_, i) => i !== from);
  return rankBetween(rest[to - 1] ?? null, rest[to] ?? null);
}
