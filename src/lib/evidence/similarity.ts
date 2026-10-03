/**
 * Parecido entre situaciones de venta. Puro y determinista (se prueba sin BD).
 * Puntos: mismo sector +3 · cada actor en común +2 · cada opción de faceta en común +peso de la faceta.
 * Una faceta que ambos describen pero no coincide resta la mitad de su peso y se explica como diferencia
 * («Otra región: Barcelona»): lo que funcionó en Brasil se enseña en Corea, pero avisando.
 */
import type { Facet, MatchReason, Situation, SituationQuery, WinStory } from './types';

export interface Names {
  segment: (id: string) => string | null;
  persona: (id: string) => string | null;
  facets: Facet[];
}

export function compare(q: SituationQuery, s: Pick<WinStory, 'segmentId' | 'personaIds' | 'situation'>, n: Names) {
  let score = 0;
  const matches: MatchReason[] = [];
  const differs: MatchReason[] = [];
  if (q.segmentId && s.segmentId) {
    if (q.segmentId === s.segmentId) { score += 3; matches.push({ kind: 'segment', label: n.segment(s.segmentId) ?? 'Mismo sector', same: true }); }
    else differs.push({ kind: 'segment', label: `Otro sector: ${n.segment(s.segmentId) ?? '—'}`, same: false });
  }
  for (const p of q.personaIds) {
    if (s.personaIds.includes(p)) { score += 2; matches.push({ kind: 'persona', label: n.persona(p) ?? 'Mismo actor', same: true }); }
  }
  for (const f of n.facets) {
    const a = q.situation[f.key] ?? [];
    const b = s.situation[f.key] ?? [];
    if (!a.length || !b.length) continue;
    const label = (k: string) => f.options.find((o) => o.key === k)?.label ?? k;
    const common = a.filter((x) => b.includes(x));
    if (common.length) {
      score += f.weight * common.length;
      for (const c of common) matches.push({ kind: 'facet', label: label(c), same: true });
    } else {
      score -= f.weight / 2;
      differs.push({ kind: 'facet', label: `${f.label}: ${b.map(label).join(', ')}`, same: false });
    }
  }
  return { score, matches, differs };
}

/** Une la situación de la cuenta y los rasgos de sus personas en una sola situación. */
export function mergeSituation(...parts: Situation[]): Situation {
  const out: Situation = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = [...new Set([...(out[k] ?? []), ...v])];
  return out;
}

/**
 * Quita claves y opciones que ya no existen en las facetas del tenant.
 * Una faceta de opción única se queda con una opción, salvo en consultas (`keepAll`): en una cuenta
 * puede haber una persona analítica y otra expresiva.
 */
export function cleanSituation(s: Situation, facets: Facet[], opts: { keepAll?: boolean } = {}): Situation {
  const out: Situation = {};
  for (const f of facets) {
    const v = [...new Set((s[f.key] ?? []).filter((x) => f.options.some((o) => o.key === x)))];
    if (v.length) out[f.key] = f.multi || opts.keepAll ? v : [v[0]];
  }
  return out;
}

/** Tasa de acierto suavizada (Laplace): con pocos casos no se exagera. */
export const winRate = (won: number, used: number) => (won + 1) / (used + 2);
