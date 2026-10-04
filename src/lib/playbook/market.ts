/** Mapa de mercado: sectores (cliente ideal), actores (stakeholders) y encaje de cada módulo. */
import type { Objection } from './types';

export const PERSONA_ROLES = ['decisor', 'pagador', 'influenciador', 'campeon', 'usuario', 'guardian'] as const;
export type PersonaRole = (typeof PERSONA_ROLES)[number];
export const ROLE_LABEL: Record<PersonaRole, string> = {
  decisor: 'Decide', pagador: 'Paga', influenciador: 'Influye', campeon: 'Aliado interno', usuario: 'Lo usa', guardian: 'Puede vetar',
};
export const ROLE_HINT: Record<PersonaRole, string> = {
  decisor: 'Firma la decisión.', pagador: 'Pone el presupuesto (puede no ser quien decide).',
  influenciador: 'Su opinión pesa en la decisión.', campeon: 'Te ayuda a vender por dentro.',
  usuario: 'Lo usará en el día a día.', guardian: 'No decide, pero puede tumbarlo.',
};
export const ROLE_CLASS: Record<PersonaRole, string> = {
  // Monocromo (design system Cofundo): el peso visual marca la importancia, no el color.
  decisor: 'co-badge co-badge--ink', pagador: 'co-badge co-badge--ink', influenciador: 'co-badge',
  campeon: 'co-badge co-badge--soft', usuario: 'co-badge', guardian: 'co-badge co-badge--attention',
};

export const STANCES = ['aliado', 'neutral', 'bloqueador', 'desconocido'] as const;
export type Stance = (typeof STANCES)[number];
export const STANCE_LABEL: Record<Stance, string> = { aliado: 'Aliado', neutral: 'Neutral', bloqueador: 'Bloqueador', desconocido: 'Sin saber' };

export interface Segment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  valueProp: string | null;
  icp: string | null;
  disqualifiers: string | null;
  buyingProcess: string | null;
  dealSize: string | null;
  salesCycle: string | null;
  position: number;
  status: 'draft' | 'official' | 'archived';
  /** Icono de línea (src/lib/ui/icons.ts). */
  icon: string | null;
  /** Foto del sector (fondo de su tarjeta y de su ficha). La pone el alta del espacio; el editor no la toca. */
  image: string | null;
  /** Aviso para quien vende este sector (p. ej. «aquí aún no hemos cerrado nada»). Lo pone el alta del espacio. */
  notice?: string | null;
}

export interface Persona {
  id: string;
  segmentId: string;
  key: string;
  name: string;
  role: PersonaRole;
  goals: string | null;
  pains: string | null;
  kpis: string | null;
  objections: Objection[];
  howToApproach: string | null;
  avoid: string | null;
  canHelp: string | null;
  canBlock: string | null;
  position: number;
}

export interface SegmentModule { segmentId: string; moduleId: string; fit: string | null; priority: number }
export interface PersonaModule { personaId: string; moduleId: string; angle: string }

export interface DossierContact {
  id: string;
  dossierId: string;
  personaId: string | null;
  name: string;
  stance: Stance;
  email: string | null;
  phone: string | null;
  notes: string | null;
  position: number;
  /** Rasgos de la persona según las facetas de ámbito «persona» (p. ej. tipo de personalidad). */
  traits: import('../evidence/types').Situation;
}

export type PersonaView = Persona & { angles: Array<PersonaModule & { moduleName: string }> };
export type SegmentView = Segment & {
  personas: PersonaView[];
  modules: Array<SegmentModule & { moduleName: string }>;
};

/**
 * Orden de los módulos según la prioridad de los sectores (el primero que lo usa, en el orden de los sectores):
 * lo del sector principal sale antes y lo de un sector despriorizado (p. ej. Bodas en Enjoy), al final.
 * Los módulos sin sector van detrás de todos. Desempate: el que ya trae el array (estable).
 */
export function sectorRank(segments: Array<{ modules: Array<string | { moduleId: string }> }>): (moduleId: string) => number {
  const rank = new Map<string, number>();
  segments.forEach((sg, i) => {
    for (const m of sg.modules) {
      const id = typeof m === 'string' ? m : m.moduleId;
      if (!rank.has(id)) rank.set(id, i);
    }
  });
  return (id) => rank.get(id) ?? segments.length;
}
