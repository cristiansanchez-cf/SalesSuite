/**
 * Qué ha funcionado (docs/EVIDENCE.md). Tipos compartidos.
 * La situación de una venta se describe con FACETAS que define cada tenant (no hay nada de Enjoy escrito aquí).
 */

/** { clave de faceta: [claves de opción] }. Faceta ausente o vacía = «no lo sé». */
export type Situation = Record<string, string[]>;

export interface FacetOption { key: string; label: string; icon?: string; hint?: string }

export interface Facet {
  id: string;
  key: string;
  label: string;
  /** Pregunta del asistente: «¿Cómo es la persona con la que hablas?» */
  question: string | null;
  icon: string | null;
  /** account: de la cuenta (región, rasgos). contact: de una persona (tipo de personalidad). */
  scope: 'account' | 'contact';
  multi: boolean;
  /** Cuánto pesa al comparar situaciones (1–5). */
  weight: number;
  options: FacetOption[];
  position: number;
  status: 'draft' | 'official' | 'archived';
}

export type StoryOutcome = 'won' | 'lost';

/** Cierre documentado: la unidad de evidencia. */
export interface WinStory {
  id: string;
  dossierId: string | null;
  authorId: string | null;
  outcome: StoryOutcome;
  segmentId: string | null;
  personaIds: string[];
  situation: Situation;
  playIds: string[];
  whatWorked: string | null;
  whatFailed: string | null;
  keyStage: import('../playbook/types').Stage | null;
  objection: import('../playbook/types').Objection | null;
  title: string;
  status: 'shared' | 'hidden';
  createdAt: string;
}

/** La situación a comparar: sector, actores implicados y facetas. */
export interface SituationQuery {
  segmentId: string | null;
  personaIds: string[];
  situation: Situation;
}

/** Por qué un cierre se parece (o no) a tu situación, en palabras. */
export interface MatchReason { kind: 'segment' | 'persona' | 'facet'; label: string; same: boolean }

export interface StoryMatch {
  story: WinStory;
  score: number;
  /** Coincidencias («Ocio nocturno», «DJ residente», «Analítico»). */
  matches: MatchReason[];
  /** Diferencias que importan («Otra región: Barcelona»). */
  differs: MatchReason[];
  authorName: string | null;
  segmentName: string | null;
}

/** Jugada recomendada por la evidencia de cierres parecidos. */
export interface PlayRecommendation {
  playId: string;
  title: string;
  moduleId: string | null;
  /** Cierres ganados parecidos en los que se usó. */
  wonIn: number;
  /** Cierres perdidos parecidos en los que se usó. */
  lostIn: number;
  score: number;
}

/** Evidencia global de una jugada (sustituye a los «me gusta»). */
export interface PlayEvidence { used: number; won: number; lost: number }
