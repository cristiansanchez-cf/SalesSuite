/**
 * Prioridad de los leads (docs/CRM_DINAMICO.md §11). Criterio cerrado con Cristian (9-oct-2026):
 *  1. Eliminatorios: si se cumple uno, el lead sale del ranking (no es ponderación, es filtro).
 *  2. Sobre los que pasan, puntuación ponderada con pesos configurables (suman 100).
 *  3. Lo que no se sabe no puntúa 0: queda «desconocido» y se enseña el máximo posible si se cualifica.
 *  4. «Se enfría» (contestó y llevamos 3 días laborables sin hacer nada) es urgencia, no calidad: no toca la nota.
 * Una sola lógica, pura y probada, para la ficha, la lista y «Hoy».
 */
export const CRITERIA = ['recurrence', 'decider', 'screens', 'dynamics', 'scale'] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Weights = Record<Criterion, number>;
export const DEFAULT_WEIGHTS: Weights = { recurrence: 30, decider: 25, screens: 20, dynamics: 15, scale: 10 };

/** Cómo se mide la recurrencia según lo que es el lead. */
export type LeadKind = 'venue' | 'promoter' | 'concert';
/** Sector → tipo de lead (Enjoy). Lo que no está aquí se elige en la ficha con un clic. */
export const KIND_BY_SEGMENT: Record<string, LeadKind> = {
  'ocio-nocturno': 'venue', hoteles: 'venue', locales: 'venue',
  promotoras: 'promoter', festivales: 'promoter',
  conciertos: 'concert',
};

/** Las opciones de cada criterio y cuánto del peso valen (tramos fijos por ahora). */
export const OPTIONS = {
  nights: { '1': 0.1, '2': 0.4, '3': 0.75, '4+': 1 },
  events: { '1-2': 0.2, '3-5': 0.45, '6-11': 0.7, '12+': 1 },
  recurring: { yes: 1, single: 0.2 },
  decider: { onsite: 1, offsite: 0.35, manager: 0.2 },
  screens: { yes: 1, wants: 0.4, no: 0 },
  dynamics: { yes: 1, partly: 0.5, no: 0 },
  scale: { single: 0.2, few: 0.6, group: 1 },
} as const;
/** Tamaño del local: no es lo mismo que «Locales que tiene» (scale), y por ahora no entra en la puntuación. */
export const SIZES = ['small', 'medium', 'large'] as const;
/**
 * Cómo es el sitio (no puntúa por ahora; sirve para preparar la visita y para el encaje por paquete). El formato decide
 * cómo se mide la recurrencia (FORMAT_KIND): una promotora por eventos al año; un local por noches con fiesta.
 */
export const FORMATS = ['club', 'pub', 'cocktail', 'rooftop', 'restaurant', 'hall', 'hotel', 'promoter', 'concerts'] as const;
export const FORMAT_KIND: Record<(typeof FORMATS)[number], LeadKind> = {
  club: 'venue', pub: 'venue', cocktail: 'venue', rooftop: 'venue', restaurant: 'venue', hall: 'venue', hotel: 'venue', promoter: 'promoter', concerts: 'concert',
};
export const PARTY = ['core', 'some', 'none'] as const;
export const DJ = ['resident', 'guests', 'both', 'none'] as const;
/**
 * Eliminatorios: sacan del ranking. «Sin pantalla y sin intención» ya no (criterio de Cristian, 11-oct-2026): sin
 * pantalla puede encajarle otro paquete (peticiones, fotos, fidelización); solo pierde los puntos de pantalla.
 */
export const KILLS = ['coverage', 'validate', 'debt'] as const;
export type Kill = (typeof KILLS)[number];

/** Lo que el comercial marca (cada clave, un clic). Sin clave = no se sabe. */
export interface Qualification {
  /** Antiguo «Qué es»: se sigue leyendo; lo nuevo es el formato. */
  kind?: LeadKind;
  format?: (typeof FORMATS)[number];
  party?: (typeof PARTY)[number];
  dj?: (typeof DJ)[number];
  promoters?: 'yes' | 'no';
  nights?: keyof typeof OPTIONS.nights;
  events?: keyof typeof OPTIONS.events;
  recurring?: keyof typeof OPTIONS.recurring;
  decider?: keyof typeof OPTIONS.decider;
  screens?: keyof typeof OPTIONS.screens;
  dynamics?: keyof typeof OPTIONS.dynamics;
  scale?: keyof typeof OPTIONS.scale;
  /** Tamaño del local (pequeño, mediano, grande): dato para el comercial, no puntúa. */
  size?: (typeof SIZES)[number];
  /** Eliminatorios marcados a mano. «validate» solo si lo han dicho ellos (lo dice la ficha). */
  coverage?: boolean; validate?: boolean; debt?: boolean;
}
/** Claves que se pueden marcar y sus valores válidos (para validar lo que llega de la ficha). */
export const QUAL_VALUES: Record<string, readonly string[]> = {
  kind: ['venue', 'promoter', 'concert'], size: SIZES, format: FORMATS, party: PARTY, dj: DJ, promoters: ['yes', 'no'],
  nights: Object.keys(OPTIONS.nights), events: Object.keys(OPTIONS.events), recurring: Object.keys(OPTIONS.recurring),
  decider: Object.keys(OPTIONS.decider), screens: Object.keys(OPTIONS.screens), dynamics: Object.keys(OPTIONS.dynamics), scale: Object.keys(OPTIONS.scale),
  coverage: ['true'], validate: ['true'], debt: ['true'],
};

export interface Part { key: Criterion; weight: number; points: number | null }
export interface Priority {
  out: boolean;
  kills: Kill[];
  /** Puntos de lo que se sabe (0–100), redondeado. */
  score: number;
  /** Lo que podría llegar a tener si lo desconocido saliera al máximo. */
  max: number;
  parts: Part[];
  unknown: Criterion[];
  qualified: boolean;
  kind: LeadKind | null;
  /** Qué le encaja de lo que vendemos (el criterio «screens» puntúa el mejor). */
  fit: Record<Package, Fit>;
}

export function normalizeWeights(w: Partial<Weights> | null | undefined): Weights {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of CRITERIA) { const v = Number(w?.[k]); if (Number.isFinite(v) && v >= 0 && v <= 100) out[k] = Math.round(v); }
  return out;
}
export const kindOf = (q: Qualification, segmentKey: string | null | undefined): LeadKind | null =>
  (q.format ? FORMAT_KIND[q.format] : undefined) ?? q.kind ?? (segmentKey ? KIND_BY_SEGMENT[segmentKey] ?? null : null);

/** Parte del peso que vale la recurrencia, según el tipo de lead (null = no se sabe). */
function recurrenceFraction(q: Qualification, kind: LeadKind | null): number | null {
  if (kind === 'venue') return q.nights ? OPTIONS.nights[q.nights] : null;
  if (kind === 'promoter') return q.events ? OPTIONS.events[q.events] : null;
  if (kind === 'concert') return q.recurring ? OPTIONS.recurring[q.recurring] : null;
  return null;
}

// ------------------------------------------------------------------ encaje por paquete (§22)

/**
 * Qué le encaja de lo que vende Enjoy, sacado de «Cómo es» (criterio de Cristian, 11-oct-2026): un sitio sin pantalla
 * puede querer peticiones de canciones (tiene DJ o hay fiesta) o fotos (cuida sus redes). La Fidelización (sellos en
 * un pase: copas, chupitos o visitas) va en preventa y encaja donde la clientela repite.
 * yes = encaja · maybe = puede · no = no · null = no se sabe.
 */
export const PACKAGES = ['screen', 'requests', 'photos', 'loyalty'] as const;
export type Package = (typeof PACKAGES)[number];
export type Fit = 'yes' | 'maybe' | 'no' | null;
export function fitOf(q: Qualification, kind: LeadKind | null): Record<Package, Fit> {
  const screen: Fit = q.screens === 'yes' ? 'yes' : q.screens === 'wants' ? 'maybe' : q.screens === 'no' ? 'no' : null;
  const requests: Fit = q.dj && q.dj !== 'none' ? 'yes' : q.party === 'core' || q.party === 'some' ? 'maybe' : q.dj === 'none' && q.party === 'none' ? 'no' : null;
  const photos: Fit = q.dynamics === 'yes' ? 'yes' : q.dynamics === 'partly' ? 'maybe' : q.dynamics === 'no' ? 'no' : null;
  const loyalty: Fit = kind !== 'venue' ? null
    : q.nights === '2' || q.nights === '3' || q.nights === '4+' || q.party === 'core' ? 'yes' : q.nights === '1' ? 'maybe' : null;
  return { screen, requests, photos, loyalty };
}
const FIT_VALUE: Record<'yes' | 'maybe' | 'no', number> = { yes: 1, maybe: 0.5, no: 0 };
/** En preventa (aún no se puede instalar): cuenta la mitad en la nota, aunque la etiqueta diga que encaja. */
export const PRESALE: readonly Package[] = ['loyalty'];
/** El mejor encaje (0–1) y cuánto podría subir si se supiera lo que falta; null si no se sabe nada. */
function bestFit(f: Record<Package, Fit>): { value: number | null; room: number } {
  const known = PACKAGES.filter((k) => f[k] !== null).map((k) => FIT_VALUE[f[k]!] * (PRESALE.includes(k) ? 0.5 : 1));
  if (!known.length) return { value: null, room: 1 };
  const value = Math.max(...known);
  return { value, room: known.length < PACKAGES.length ? 1 - value : 0 };
}

export function priorityOf(q: Qualification | null | undefined, segmentKey: string | null | undefined, weights: Weights = DEFAULT_WEIGHTS): Priority {
  const v = q ?? {};
  const kind = kindOf(v, segmentKey);
  const kills: Kill[] = [];
  if (v.coverage) kills.push('coverage');
  if (v.validate) kills.push('validate');
  if (v.debt) kills.push('debt');
  const fit = bestFit(fitOf(v, kind));
  const fraction: Record<Criterion, number | null> = {
    recurrence: recurrenceFraction(v, kind),
    decider: v.decider ? OPTIONS.decider[v.decider] : null,
    screens: fit.value,
    dynamics: v.dynamics ? OPTIONS.dynamics[v.dynamics] : null,
    scale: v.scale ? OPTIONS.scale[v.scale] : null,
  };
  const parts: Part[] = CRITERIA.map((key) => ({ key, weight: weights[key], points: fraction[key] === null ? null : Math.round(fraction[key]! * weights[key] * 10) / 10 }));
  const unknown = parts.filter((p) => p.points === null).map((p) => p.key);
  const known = parts.reduce((s, p) => s + (p.points ?? 0), 0);
  // Lo que falta suma su peso entero; el encaje, además, lo que podría subir si se supieran los paquetes que faltan.
  const max = known + parts.filter((p) => p.points === null).reduce((s, p) => s + p.weight, 0) + (fit.value !== null ? fit.room * weights.screens : 0);
  const out = kills.length > 0;
  return { out, kills, score: out ? 0 : Math.round(known), max: out ? 0 : Math.round(max), parts, unknown, qualified: unknown.length === 0, kind, fit: fitOf(v, kind) };
}

/** Orden del ranking: los que pasan el filtro por puntuación actual (no por máximo); los de fuera, al final. */
export function compareLeads(a: Priority, b: Priority): number {
  if (a.out !== b.out) return a.out ? 1 : -1;
  return b.score - a.score || b.max - a.max;
}

// ------------------------------------------------------------------ «se enfría»

/** Días laborables (lunes a viernes) entre dos fechas: el fin de semana no cuenta (el sector trabaja el finde). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  let n = 0;
  while (d < end) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
export const COOLING_DAYS = 3;
/**
 * Contestó o mostró interés y desde entonces no hemos hecho nada: días laborables que lleva esperando (null si no
 * aplica). Las notas de investigación no cuentan como hacer algo con él.
 */
export function coolingDays(acts: Array<{ outcome: string; happenedAt: string }>, now: Date): number | null {
  const real = acts.filter((a) => a.outcome !== 'note').sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  const last = real[0];
  if (!last || !['replied', 'interested'].includes(last.outcome)) return null;
  const days = businessDaysBetween(new Date(last.happenedAt), now);
  return days >= COOLING_DAYS ? days : null;
}
