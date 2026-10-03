import type { Contribution, Feedback, Play, PlayRevision, Progress, TargetType } from './types';

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
}
