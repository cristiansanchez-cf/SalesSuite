import type { Contribution, Feedback, Play, PlayRevision, Progress, TargetType } from './types';
import type { Persona, PersonaModule, Segment, SegmentModule } from './market';

export type NewPlay = Omit<Play, 'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt'> & { version?: number };
export type PlayPatch = Partial<Omit<Play, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

/**
 * Datos del playbook, ligados a UN usuario (como AdminDb). En Supabase la RLS filtra:
 * los no-admin no ven borradores ni aportes pendientes ajenos.
 */
export interface PlaybookDb {
  listPlays(tenantId: string): Promise<Play[]>;
  insertPlay(tenantId: string, row: NewPlay): Promise<string>;
  updatePlay(id: string, patch: PlayPatch): Promise<boolean>;

  listRevisions(tenantId: string, opts?: { playId?: string; since?: string | null; limit?: number }): Promise<PlayRevision[]>;
  insertRevision(tenantId: string, row: Omit<PlayRevision, 'id' | 'createdAt'>): Promise<void>;

  listContributions(tenantId: string): Promise<Contribution[]>;
  insertContribution(tenantId: string, row: Omit<Contribution, 'id' | 'createdAt' | 'reviewNote' | 'reviewedBy' | 'reviewedAt'>): Promise<string>;
  updateContribution(id: string, patch: Partial<Pick<Contribution, 'status' | 'reviewNote' | 'reviewedBy' | 'reviewedAt'>>): Promise<boolean>;
  deleteContribution(id: string): Promise<boolean>;

  listFeedback(tenantId: string): Promise<Feedback[]>;
  upsertFeedback(tenantId: string, row: Omit<Feedback, 'updatedAt'>): Promise<void>;
  deleteFeedback(userId: string, targetType: TargetType, targetId: string): Promise<void>;

  listProgress(tenantId: string): Promise<Progress[]>;
  setProgress(tenantId: string, userId: string, topic: string, done: boolean): Promise<void>;

  getSeen(tenantId: string, userId: string): Promise<string | null>;
  setSeen(tenantId: string, userId: string, at: string): Promise<void>;

  // ---- mapa de mercado (lectura: miembros; escritura: admins vía RLS)
  listSegments(tenantId: string): Promise<Segment[]>;
  /** Inserta (sin id) o actualiza (con id). Devuelve el id. */
  saveSegment(tenantId: string, row: Omit<Segment, 'id' | 'image'> & { id?: string }): Promise<string>;
  listPersonas(tenantId: string): Promise<Persona[]>;
  savePersona(tenantId: string, row: Omit<Persona, 'id'> & { id?: string }): Promise<string>;
  deletePersona(id: string): Promise<boolean>;
  listSegmentModules(tenantId: string): Promise<SegmentModule[]>;
  /** fit === null y priority === null → elimina el encaje. */
  setSegmentModule(tenantId: string, row: SegmentModule | { segmentId: string; moduleId: string; remove: true }): Promise<void>;
  listPersonaModules(tenantId: string): Promise<PersonaModule[]>;
  setPersonaModule(tenantId: string, row: PersonaModule | { personaId: string; moduleId: string; remove: true }): Promise<void>;
}
