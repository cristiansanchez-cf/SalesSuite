/** La nota de una empresa según la ficha de su tipo (§24): local (criterios configurables), promotora o DJ. */
import type { Profile } from '../accounts/types';
import { djPriority, promoterPriority } from './profiles';
import { priorityOf, type Priority, type Weights } from './priority';
import { diveScore, instructorScore } from './diving';
import type { QualPack } from './pack';

/**
 * Sin cualificación en el espacio (§45): una nota vacía que no ordena ni filtra (ni fuera, ni «sin cualificar», ni
 * caliente); solo «se enfría» sigue valiendo, que no depende de la nota.
 */
export const NO_PRIORITY: Priority = Object.freeze({ out: false, kills: [], score: 0, max: 0, parts: [], unknown: [], qualified: true, kind: null,
  fit: { screen: null, requests: null, photos: null, loyalty: null } }) as Priority;

const NO_FIT = { screen: null, requests: null, photos: null, loyalty: null } as const;
/** Buceo (§47) con la forma de siempre: la lista, el mapa, la ruta y personas la ordenan igual. */
export function divePriority(raw: object | null | undefined, profile: Profile): Priority {
  const q = (raw ?? {}) as Record<string, unknown>;
  if (profile === 'dj') {
    const s = instructorScore(q);
    return { out: false, kills: [], score: s.total, max: s.max, parts: [], unknown: s.unknown, qualified: s.qualified, kind: null, fit: { ...NO_FIT } };
  }
  const s = diveScore(q);
  const parts = (['a', 'b', 'c', 'd'] as const).map((key) => ({ key, weight: 0, points: s.blocks[key] }));
  return { out: s.level === 'out', kills: [], score: s.total, max: s.max, parts, unknown: s.unknown, qualified: s.qualified, kind: null, fit: { ...NO_FIT }, level: s.level, tags: s.tags };
}

export function priorityFor(q: object | null | undefined, profile: Profile, segmentKey: string | null | undefined, weights?: Weights, pack?: QualPack | null): Priority {
  const v = (q ?? {}) as Record<string, unknown>;
  if (pack === 'diving') return divePriority(v, profile);
  return profile === 'promoter' ? promoterPriority(v) : profile === 'dj' ? djPriority(v) : priorityOf(v, segmentKey, weights);
}
