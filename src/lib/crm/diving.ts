/**
 * Cualificación de buceo (paquete `diving`, Oquea; docs/CRM_DINAMICO.md §47). Sale de «OQUEA · Criterios de
 * cualificación de leads» v1.0 (23-nov-2026), del agente de modelo de negocio de Oquea:
 *  · cada empresa tiene UN segmento (PREM, CENTRO, TOUR, ONG, CLUB, OTRO);
 *  · la nota (0–100) son cuatro bloques: A necesidad digital (común), B encaje con el segmento, C valor potencial (estos
 *    dos según el segmento) y D acceso al decisor (común); más los ajustes (mercado futuro −15, ya tiene software −10);
 *  · el nivel: A ≥ 70 · B 45–69 · C < 45 · CANAL (ONG o club con ≥ 40) · DESCARTADO (OTRO o «zombie»);
 *  · lo que no se sabe no suma (como en Enjoy): se enseña lo que podría llegar a tener.
 * Puro y probado (diving.test.ts): lo usan la ficha, la lista, «Hoy», la IA, el MCP y WhatsApp.
 *
 * Instructores (ficha de profesional): no se puntúan como cliente; su nota dice si puede ser «vendedor» de Oquea
 * (acuerdo de comisión), como las promotoras en Enjoy.
 */

export const DIVE_SEGMENTS = ['prem', 'centro', 'tour', 'ong', 'club', 'otro'] as const;
export type DiveSegment = (typeof DIVE_SEGMENTS)[number];
/** Los de cliente (pestaña principal) y los de organizador (ONGs y clubs). */
export const CLIENT_SEGMENTS: readonly DiveSegment[] = ['prem', 'centro', 'tour', 'otro'];
export const CHANNEL_SEGMENTS: readonly DiveSegment[] = ['ong', 'club'];
/** Si duda entre dos, el de más valor (regla del documento). */
export const SEGMENT_RANK: readonly DiveSegment[] = ['prem', 'tour', 'centro', 'ong', 'club', 'otro'];

export type Block = 'a' | 'b' | 'c' | 'd' | 'adj';
/** Una pregunta: sus opciones y lo que suma cada una (sin opción = no se sabe). */
export interface DiveQuestion {
  key: string;
  block: Block;
  /** Solo para esos segmentos (sin lista: todos). */
  segments?: readonly DiveSegment[];
  /** Valor → puntos. */
  options: Readonly<Record<string, number>>;
  /** Varios a la vez (solo las del instructor). */
  multi?: boolean;
}
const YES = (n: number) => ({ yes: n, no: 0 });
const PC: readonly DiveSegment[] = ['prem', 'centro'];

/**
 * Las señales del documento como preguntas de un toque. «yes» es siempre que la señal se cumple tal como la escribe el
 * documento (p. ej. `no_booking: yes` = no tiene reserva online, suma 8).
 */
export const DIVE_QUESTIONS: readonly DiveQuestion[] = [
  // A · necesidad digital (0–25)
  { key: 'dv_web', block: 'a', options: { ok: 0, improvable: 4, priority: 8, none: 8 } },
  { key: 'dv_no_booking', block: 'a', options: YES(8) },
  { key: 'dv_contact_basic', block: 'a', options: YES(4) },
  { key: 'dv_no_loyalty', block: 'a', options: YES(5) },
  // B · encaje con el segmento (0–40)
  { key: 'dv_ticket', block: 'b', segments: ['prem'], options: { high: 15, mid: 8, low: 0 } },
  { key: 'dv_full_packages', block: 'b', segments: ['prem'], options: YES(10) },
  { key: 'dv_intl_reviews', block: 'b', segments: ['prem'], options: YES(10) },
  { key: 'dv_no_installments', block: 'b', segments: ['prem'], options: YES(5) },
  { key: 'dv_agency', block: 'b', segments: ['centro'], options: YES(10) },
  { key: 'dv_courses_and_trips', block: 'b', segments: ['centro'], options: YES(10) },
  { key: 'dv_touristic', block: 'b', segments: ['centro'], options: YES(10) },
  { key: 'dv_boat_or_team', block: 'b', segments: ['centro'], options: YES(10) },
  { key: 'dv_closed_packages', block: 'b', segments: ['tour'], options: YES(15) },
  { key: 'dv_network_destinations', block: 'b', segments: ['tour'], options: YES(15) },
  { key: 'dv_eu_clients', block: 'b', segments: ['tour'], options: YES(10) },
  { key: 'dv_periodic_activities', block: 'b', segments: ['ong'], options: YES(15) },
  { key: 'dv_partner_centers', block: 'b', segments: ['ong'], options: YES(15) },
  { key: 'dv_citizen_science', block: 'b', segments: ['ong'], options: YES(10) },
  { key: 'dv_members', block: 'b', segments: ['club'], options: YES(10) },
  { key: 'dv_regular_trips', block: 'b', segments: ['club'], options: YES(5) },
  // C · valor potencial (0–25)
  { key: 'dv_reviews', block: 'c', segments: PC, options: { many: 15, some: 8, few: 3 } },
  { key: 'dv_social_active', block: 'c', segments: [...PC, 'tour'], options: YES(5) },
  { key: 'dv_network_country', block: 'c', segments: [...PC, 'ong'], options: YES(5) },
  { key: 'dv_destinations', block: 'c', segments: ['tour'], options: YES(15) },
  { key: 'dv_followers', block: 'c', segments: ['ong'], options: YES(10) },
  { key: 'dv_public_funding', block: 'c', segments: ['ong'], options: YES(10) },
  // D · acceso al decisor (0–10)
  { key: 'dv_owner_name', block: 'd', options: YES(5) },
  { key: 'dv_direct_contact', block: 'd', options: YES(5) },
  // Ajustes y etiquetas
  { key: 'dv_future_market', block: 'adj', options: { yes: -15, no: 0 } },
  { key: 'dv_has_software', block: 'adj', options: { yes: -10, no: 0 } },
  { key: 'dv_padi_adv', block: 'adj', options: YES(0) },
  { key: 'dv_zombie', block: 'adj', options: YES(0) },
];
/** En TOUR las redes valen 10 (no 5): el documento les da más peso. */
const OVERRIDE: Partial<Record<DiveSegment, Record<string, Record<string, number>>>> = { tour: { dv_social_active: { yes: 10, no: 0 } } };
/** Tope de cada bloque (el de B y C depende del segmento). */
const CAP: Record<'a' | 'd', number> = { a: 25, d: 10 };
const CAP_B: Record<DiveSegment, number> = { prem: 40, centro: 40, tour: 40, ong: 40, club: 15, otro: 0 };
const CAP_C: Record<DiveSegment, number> = { prem: 25, centro: 25, tour: 25, ong: 25, club: 0, otro: 0 };

export const DIVE_LEVELS = ['a', 'b', 'c', 'channel', 'out'] as const;
export type DiveLevel = (typeof DIVE_LEVELS)[number];
export const DIVE_TAGS = ['future_market', 'has_software', 'padi_adv', 'zombie'] as const;
export type DiveTag = (typeof DIVE_TAGS)[number];
/** Estado de la web según cuántas comprobaciones falla (punto 4 del documento; 12 comprobaciones). */
export const webStateOf = (problems: number, hasWeb = true): 'ok' | 'improvable' | 'priority' | 'none' =>
  !hasWeb ? 'none' : problems >= 7 ? 'priority' : problems >= 4 ? 'improvable' : 'ok';

/** Las respuestas: clave → valor (las del instructor, listas). Evidencias en `_ev` (clave → URL o fuente). */
export type DiveAnswers = Record<string, unknown>;

export const segmentOf = (q: DiveAnswers | null | undefined): DiveSegment | null =>
  (DIVE_SEGMENTS as readonly string[]).includes(String(q?.dv_segment)) ? (q!.dv_segment as DiveSegment) : null;

/** Las preguntas que tocan a una empresa de ese segmento (sin segmento: las comunes). */
export function questionsFor(seg: DiveSegment | null): DiveQuestion[] {
  if (seg === 'otro') return [];
  return DIVE_QUESTIONS.filter((x) => !x.segments || (seg !== null && x.segments.includes(seg)));
}
const pointsOf = (x: DiveQuestion, seg: DiveSegment | null, v: unknown): number | null => {
  const opts = (seg && OVERRIDE[seg]?.[x.key]) || x.options;
  return typeof v === 'string' && v in opts ? opts[v]! : null;
};

export interface DiveScore {
  segment: DiveSegment | null;
  /** Puntos de lo que se sabe por bloque (ya con su tope) y los ajustes. */
  blocks: Record<'a' | 'b' | 'c' | 'd', number>;
  adjust: number;
  /** 0–100, redondeado. */
  total: number;
  /** Lo que podría llegar a tener si lo que falta saliera bien. */
  max: number;
  level: DiveLevel | null;
  tags: DiveTag[];
  /** Preguntas que faltan (sin el segmento, la primera es esa). */
  unknown: string[];
  qualified: boolean;
}

/** La nota de una empresa (cliente u ONG/club) con lo que se sabe. Sin segmento: solo A y D, y sin nivel. */
export function diveScore(q: DiveAnswers | null | undefined): DiveScore {
  const v = q ?? {};
  const seg = segmentOf(v);
  const qs = questionsFor(seg);
  const blocks = { a: 0, b: 0, c: 0, d: 0 };
  const room = { a: 0, b: 0, c: 0, d: 0 };
  let adjust = 0;
  const unknown: string[] = seg ? [] : ['dv_segment'];
  for (const x of qs) {
    const p = pointsOf(x, seg, v[x.key]);
    if (x.block === 'adj') { if (p !== null) adjust += p; continue; }
    const best = Math.max(...Object.values((seg && OVERRIDE[seg]?.[x.key]) || x.options));
    if (p === null) { unknown.push(x.key); room[x.block] += best; } else blocks[x.block] += p;
  }
  const cap = { a: CAP.a, b: seg ? CAP_B[seg] : 0, c: seg ? CAP_C[seg] : 0, d: CAP.d };
  const capped = { a: Math.min(blocks.a, cap.a), b: Math.min(blocks.b, cap.b), c: Math.min(blocks.c, cap.c), d: Math.min(blocks.d, cap.d) };
  const known = capped.a + capped.b + capped.c + capped.d;
  const maxRaw = (['a', 'b', 'c', 'd'] as const).reduce((s, k) => s + Math.min(blocks[k] + room[k], cap[k]), 0);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const total = clamp(known + adjust);
  const tags = DIVE_TAGS.filter((t) => v[`dv_${t}`] === 'yes');
  const zombie = tags.includes('zombie');
  // Sin segmento no hay nivel (salvo que ya se sepa que está muerta).
  const level: DiveLevel | null = zombie || seg === 'otro' ? 'out'
    : !seg ? null
    : CHANNEL_SEGMENTS.includes(seg) ? (total >= 40 ? 'channel' : 'c')
    : total >= 70 ? 'a' : total >= 45 ? 'b' : 'c';
  // Las etiquetas que no son ajuste (PADI Adventures, zombie) no son «lo que falta».
  const pending = unknown.filter((k) => k !== 'dv_padi_adv' && k !== 'dv_zombie');
  return { segment: seg, blocks: capped, adjust, total: level === 'out' ? 0 : total, max: level === 'out' ? 0 : clamp(maxRaw + adjust), level, tags, unknown: pending, qualified: !!seg && pending.length === 0 };
}

/** Qué hacer según el nivel (punto 7 del documento). */
export const NEXT_BY_LEVEL: Record<DiveLevel, 'sales_48h' | 'sequence' | 'nurture' | 'alliances' | 'none'> = {
  a: 'sales_48h', b: 'sequence', c: 'nurture', channel: 'alliances', out: 'none',
};

/** Orden: por nivel (A, B, CANAL, C, sin nivel, descartadas) y luego por nota. */
const LEVEL_ORDER: Record<string, number> = { a: 0, b: 1, channel: 2, c: 3, none: 4, out: 5 };
export function compareDive(x: DiveScore, y: DiveScore): number {
  return (LEVEL_ORDER[x.level ?? 'none']! - LEVEL_ORDER[y.level ?? 'none']!) || y.total - x.total || y.max - x.max;
}

// ------------------------------------------------------------------ instructores

export const INSTRUCTOR_SPECIALTIES = ['recreational', 'technical', 'freediving', 'cave', 'wreck', 'sidemount', 'rebreather', 'photo', 'kids', 'adaptive', 'science'] as const;
export const INSTRUCTOR_AGENCIES = ['padi', 'ssi', 'cmas', 'fedas', 'naui', 'sdi_tdi', 'gue', 'raid', 'iantd', 'other'] as const;
export const INSTRUCTOR_QUESTIONS: readonly DiveQuestion[] = [
  { key: 'dv_specialty', block: 'b', multi: true, options: Object.fromEntries(INSTRUCTOR_SPECIALTIES.map((k) => [k, 0])) },
  { key: 'dv_agencies', block: 'b', multi: true, options: Object.fromEntries(INSTRUCTOR_AGENCIES.map((k) => [k, 0])) },
  // Lo que puntúa (suma 100): ¿nos vendería?, a cuánta gente llega, nivel y si es dueño de algo.
  { key: 'dv_seller', block: 'b', options: { yes: 40, maybe: 20, no: 0 } },
  { key: 'dv_reach', block: 'c', options: { large: 25, medium: 15, small: 5 } },
  { key: 'dv_level', block: 'c', options: { trainer: 20, instructor: 14, divemaster: 6 } },
  { key: 'dv_owns', block: 'd', options: { yes: 15, no: 0 } },
];
export interface InstructorScore { total: number; max: number; unknown: string[]; qualified: boolean }
export function instructorScore(q: DiveAnswers | null | undefined): InstructorScore {
  const v = q ?? {};
  let total = 0, max = 0;
  const unknown: string[] = [];
  for (const x of INSTRUCTOR_QUESTIONS) {
    if (x.multi) { if (!Array.isArray(v[x.key]) || !(v[x.key] as unknown[]).length) unknown.push(x.key); continue; }
    const best = Math.max(...Object.values(x.options));
    const p = pointsOf(x, null, v[x.key]);
    if (p === null) { unknown.push(x.key); max += best; } else { total += p; max += p; }
  }
  return { total, max, unknown, qualified: unknown.length === 0 };
}

/** Dónde trabaja un instructor (el papel del enlace con cada centro). */
export const INSTRUCTOR_ROLES = ['staff', 'freelance', 'owner'] as const;

// ------------------------------------------------------------------ validar lo que llega (ficha, IA, MCP, WhatsApp)

const ALL = [...DIVE_QUESTIONS, ...INSTRUCTOR_QUESTIONS];
export const DIVE_KEYS: readonly string[] = ['dv_segment', ...ALL.map((x) => x.key)];
export const DIVE_MULTI: readonly string[] = ALL.filter((x) => x.multi).map((x) => x.key);
export const DIVE_VALUES: Record<string, readonly string[]> = {
  dv_segment: DIVE_SEGMENTS,
  ...Object.fromEntries(ALL.map((x) => [x.key, Object.keys(x.options)])),
};
export const validDive = (key: string, value: string): boolean => !!DIVE_VALUES[key]?.includes(value);
