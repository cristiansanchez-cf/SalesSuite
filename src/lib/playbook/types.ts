/** Playbook de ventas (docs/PLAYBOOK.md). Taxonomía de etapa/objeción = la del Cerebro de Ventas. */

export const PLAY_KINDS = ['pitch', 'fit', 'discovery', 'objection', 'proof', 'monetization', 'script', 'tip'] as const;
export type PlayKind = (typeof PLAY_KINDS)[number];
export const KIND_LABEL: Record<PlayKind, string> = {
  pitch: 'Cómo presentarlo', fit: 'Para quién (y cuándo no)', discovery: 'Preguntas de descubrimiento',
  objection: 'Objeciones', proof: 'Pruebas y casos', monetization: 'Precio y monetización', script: 'Guiones', tip: 'Consejos',
};
/** Orden de lectura en una ficha de venta. */
export const KIND_ORDER: PlayKind[] = ['pitch', 'fit', 'discovery', 'proof', 'objection', 'monetization', 'script', 'tip'];

export const STAGES = ['prospeccion', 'primer_contacto', 'descubrimiento', 'pitch_demo', 'objeciones', 'negociacion', 'cierre', 'seguimiento', 'mentalidad'] as const;
export type Stage = (typeof STAGES)[number];
/** Etiquetas idénticas a los filtros de etapa del Cerebro de Ventas. */
export const STAGE_LABEL: Record<Stage, string> = {
  prospeccion: 'Prospección', primer_contacto: 'Primer contacto', descubrimiento: 'Descubrimiento', pitch_demo: 'Pitch / Demo',
  objeciones: 'Objeciones', negociacion: 'Negociación', cierre: 'Cierre', seguimiento: 'Seguimiento', mentalidad: 'Mentalidad',
};

export const OBJECTIONS = ['precio', 'tiempo', 'desconfianza', 'no_lo_necesito', 'no_decido_yo', 'comparar', 'ya_tengo_proveedor'] as const;
export type Objection = (typeof OBJECTIONS)[number];
/** Etiquetas idénticas a los filtros de objeción del Cerebro de Ventas. */
export const OBJECTION_LABEL: Record<Objection, string> = {
  precio: 'Precio', tiempo: 'Tiempo / me lo pienso', desconfianza: 'Desconfianza', no_lo_necesito: 'No lo necesito',
  no_decido_yo: 'No decido yo', comparar: 'Quiere comparar opciones', ya_tengo_proveedor: 'Ya tengo proveedor',
};

export type PlayStatus = 'draft' | 'official' | 'archived';
export type ContributionType = 'tip' | 'change';
export type ContributionStatus = 'shared' | 'pending' | 'accepted' | 'rejected' | 'hidden';
export type Verdict = 'worked' | 'didnt';
export type TargetType = 'play' | 'contribution';
/** 'general' o el id de un módulo. */
export type Topic = string;

/** Referencia a una ficha del Cerebro de Ventas: se enlaza y atribuye, nunca se copia su guion. */
export interface TechniqueRef {
  source: 'cerebro';
  id: number;
  title: string;
  creator?: string;
  url?: string;
}

export interface Play {
  id: string;
  tenantId: string;
  moduleId: string | null;
  key: string | null;
  kind: PlayKind;
  stage: Stage | null;
  objection: Objection | null;
  segments: string[];
  /** Claves de actores a los que va dirigida (vacío = cualquiera). */
  personas: string[];
  title: string;
  body: string;
  whenToUse: string | null;
  whyItWorks: string | null;
  techniqueRefs: TechniqueRef[];
  position: number;
  status: PlayStatus;
  version: number;
  authorId: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlayRevision {
  id: string;
  playId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changeNote: string | null;
  changedBy: string | null;
  contributionId: string | null;
  createdAt: string;
}

export interface Contribution {
  id: string;
  type: ContributionType;
  playId: string | null;
  moduleId: string | null;
  kind: PlayKind;
  title: string;
  body: string;
  status: ContributionStatus;
  authorId: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Feedback {
  userId: string;
  targetType: TargetType;
  targetId: string;
  verdict: Verdict;
  note: string | null;
  dossierId: string | null;
  updatedAt: string;
}

export interface Progress {
  userId: string;
  topic: Topic;
  completedAt: string;
}

export interface Score {
  worked: number;
  didnt: number;
  mine: Verdict | null;
}

export type PlayView = Play & { score: Score };
export type ContributionView = Contribution & { score: Score; authorName: string | null; playTitle: string | null };
