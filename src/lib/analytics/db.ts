import type { DossierVisit } from './types';

/** Lectura de visitas. La escritura va por el repositorio público (RPC track_dossier_view). */
export interface AnalyticsDb {
  listVisits(tenantId: string, dossierIds: string[]): Promise<DossierVisit[]>;
}

export const emptyAnalyticsDb: AnalyticsDb = { async listVisits() { return []; } };
