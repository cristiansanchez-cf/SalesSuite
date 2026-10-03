import type { Facet, WinStory } from './types';

export type NewStory = Omit<WinStory, 'id' | 'createdAt'>;

/** Datos de «Qué ha funcionado», ligados a UN usuario (RLS en Supabase; reglas del servicio en demo). */
export interface EvidenceDb {
  listFacets(tenantId: string): Promise<Facet[]>;
  /** Inserta (sin id) o actualiza (con id). Devuelve el id. */
  saveFacet(tenantId: string, row: Omit<Facet, 'id'> & { id?: string }): Promise<string>;

  listStories(tenantId: string): Promise<WinStory[]>;
  /** Un cierre por dossier: si ya existe para ese dossier, se actualiza. */
  saveStory(tenantId: string, row: NewStory & { id?: string }): Promise<string>;
  setStoryStatus(id: string, status: WinStory['status']): Promise<boolean>;
}
