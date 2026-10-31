/** La nota de una empresa según la ficha de su tipo (§24): local (criterios configurables), promotora o DJ. */
import type { Profile } from '../accounts/types';
import { djPriority, promoterPriority } from './profiles';
import { priorityOf, type Priority, type Weights } from './priority';

/**
 * Sin cualificación en el espacio (§45): una nota vacía que no ordena ni filtra (ni fuera, ni «sin cualificar», ni
 * caliente); solo «se enfría» sigue valiendo, que no depende de la nota.
 */
export const NO_PRIORITY: Priority = Object.freeze({ out: false, kills: [], score: 0, max: 0, parts: [], unknown: [], qualified: true, kind: null,
  fit: { screen: null, requests: null, photos: null, loyalty: null } }) as Priority;

export function priorityFor(q: object | null | undefined, profile: Profile, segmentKey: string | null | undefined, weights?: Weights): Priority {
  const v = (q ?? {}) as Record<string, unknown>;
  return profile === 'promoter' ? promoterPriority(v) : profile === 'dj' ? djPriority(v) : priorityOf(v, segmentKey, weights);
}
