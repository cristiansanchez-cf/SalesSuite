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
  decisor: 'bg-ink text-bg', pagador: 'bg-emerald-100 text-emerald-900', influenciador: 'bg-sky-100 text-sky-900',
  campeon: 'bg-violet-100 text-violet-900', usuario: 'bg-surface text-ink', guardian: 'bg-amber-100 text-amber-900',
};

export const STANCES = ['aliado', 'neutral', 'bloqueador', 'desconocido'] as const;
export type Stance = (typeof STANCES)[number];
export const STANCE_LABEL: Record<Stance, string> = { aliado: '🟢 Aliado', neutral: '⚪ Neutral', bloqueador: '🔴 Bloqueador', desconocido: '❔ Sin saber' };

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
}

export type PersonaView = Persona & { angles: Array<PersonaModule & { moduleName: string }> };
export type SegmentView = Segment & {
  personas: PersonaView[];
  modules: Array<SegmentModule & { moduleName: string }>;
};
