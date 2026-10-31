/**
 * Propuesta desde una empresa (docs/PROPOSAL_PRESETS.md §Desde la ficha): lo que ya se evaluó en el CRM rellena la
 * receta del sector, para no empezar de cero. El emparejamiento es de cada espacio (receta → `fromAccount`):
 *   - `match`: si la empresa no tiene sector, el que mejor encaja con su ficha (gana el que cumple más condiciones).
 *   - `answers`: cada respuesta de la receta («dj», «tipo:grupo») que se marca si la ficha cumple sus condiciones.
 *   - `musicStyle`: de qué dato salen sus estilos de música y a qué estilo de canciones de ejemplo va cada uno.
 * Una condición es «dato → valores» y se cumple si el dato tiene alguno; todas las de una regla, a la vez. Los datos son
 * la cualificación de la ficha más `profile` (perfil del tipo: venue, promoter, dj…) y `accountKind` (el tipo en sí).
 * Puro y determinista; lo que la ficha no sabe, lo marca el comercial.
 */
import type { Proposal } from './preset';
import { effectiveAnswers } from './preset';

export interface AccountFacts {
  segmentId: string | null;
  profile: string | null;
  kind: string | null;
  qualification: Record<string, unknown>;
}

/** Valores de un dato de la ficha como lista de textos (sí/no para los marcados). */
export function factValues(f: AccountFacts, key: string): string[] {
  const v = key === 'profile' ? f.profile : key === 'accountKind' ? f.kind : f.qualification[key];
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'boolean') return [v ? 'yes' : 'no'];
  return [String(v)];
}

type Cond = Record<string, string[]>;
const meets = (f: AccountFacts, c: Cond) => Object.entries(c).every(([k, vs]) => factValues(f, k).some((x) => vs.includes(x)));

/** Su sector; si no tiene, el de la receta cuyo `match` cumple con más condiciones (empate: el primero). */
export function pickSegment(f: AccountFacts, recipes: Array<{ id: string; proposal: Proposal | null }>): string | null {
  if (f.segmentId) return f.segmentId;
  let best: { id: string; n: number } | null = null;
  for (const r of recipes) {
    const m = r.proposal?.fromAccount?.match;
    if (!m || !Object.keys(m).length || !meets(f, m)) continue;
    const n = Object.keys(m).length;
    if (!best || n > best.n) best = { id: r.id, n };
  }
  return best?.id ?? null;
}

/** Las respuestas de la receta que la ficha ya contesta (válidas para esa receta). */
export function inheritedAnswers(p: Proposal, f: AccountFacts): string[] {
  const raw = (p.fromAccount?.answers ?? []).filter((r) => meets(f, r.if)).map((r) => r.answer);
  // Solo las que existen en la receta: las elecciones con la opción tal cual, las preguntas si están.
  const ok = new Set(effectiveAnswers(p, raw));
  return [...new Set(raw)].filter((a) => ok.has(a));
}

/** Estilo de las canciones de ejemplo: el primero de sus estilos que tenga equivalente. */
export function inheritedStyle(p: Proposal, f: AccountFacts): string | null {
  const ms = p.fromAccount?.musicStyle;
  if (!ms) return null;
  // hasOwn: un valor de la ficha como «constructor» no puede devolver lo que hereda el objeto.
  for (const k of ms.from) for (const v of factValues(f, k)) if (Object.hasOwn(ms.map, v) && ms.map[v]) return ms.map[v];
  return null;
}
