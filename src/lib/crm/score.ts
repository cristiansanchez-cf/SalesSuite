/** La nota de una empresa según la ficha de su tipo (§24): local (criterios configurables), promotora o DJ. */
import type { Profile } from '../accounts/types';
import { djPriority, promoterPriority } from './profiles';
import { priorityOf, type Priority, type Weights } from './priority';

export function priorityFor(q: object | null | undefined, profile: Profile, segmentKey: string | null | undefined, weights?: Weights): Priority {
  const v = (q ?? {}) as Record<string, unknown>;
  return profile === 'promoter' ? promoterPriority(v) : profile === 'dj' ? djPriority(v) : priorityOf(v, segmentKey, weights);
}
