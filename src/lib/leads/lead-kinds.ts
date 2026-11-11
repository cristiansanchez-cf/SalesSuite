/**
 * Qué tipos de solicitud enseñar en los ajustes de cada empresa. Los tipos del contrato (local, DJ, festival, boda…)
 * salieron de Enjoy; a otra empresa solo le salen «General» y los que de verdad le llegan o ya tiene personalizados.
 */
import { MEDIA_TYPES } from './templates';
import type { LeadSettings, QuestionKey } from './types';

export type MediaType = (typeof MEDIA_TYPES)[number];
const Q_ORDER: QuestionKey[] = ['general', 'venue', 'dj', 'festival', 'wedding', 'trial_ended', 'extra_venue'];

/**
 * `used`: lo que se ha visto en sus leads (el tipo, el `event_type` de los generales y el `intent` de la app).
 * Siempre va «General»; los demás, si se usan o si ya tienen vídeo, reserva o pregunta propios (para no esconder nada).
 */
export function shownKinds(used: readonly string[], s: Pick<LeadSettings, 'media' | 'templates'>) {
  const u = new Set(used);
  const mediaOwn = (t: MediaType) => Object.values(s.media?.[t] ?? {}).some((x) => !!(x?.video || x?.booking));
  const qOwn = (k: QuestionKey) => Object.values(s.templates ?? {}).some((lt) => !!lt?.questions?.[k]?.trim());
  return {
    media: MEDIA_TYPES.filter((t) => t === 'general' || u.has(t) || mediaOwn(t)),
    questions: Q_ORDER.filter((k) => k === 'general' || u.has(k) || qOwn(k)),
  };
}

const VENUE_SAMPLE = { name: 'Laura Gómez', type: 'venue' as const, fields: { venue_name: 'Sala Ejemplo', city: 'Valencia' } as Record<string, string> };
const GENERAL_SAMPLE = { name: 'Laura Gómez', type: 'general' as const, fields: { event_type: 'other' } as Record<string, string> };
export type SampleLead = typeof VENUE_SAMPLE | typeof GENERAL_SAMPLE;
/** El lead de ejemplo de las vistas previas: un local si le llegan locales; si no, uno general («tu proyecto»). */
export const sampleLead = (used: readonly string[]): SampleLead => (used.includes('venue') ? VENUE_SAMPLE : GENERAL_SAMPLE);
