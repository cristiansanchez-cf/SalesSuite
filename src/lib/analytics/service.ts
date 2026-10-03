/**
 * Analítica de dossiers para la consola. Solo lee: las visitas se registran desde el enlace público.
 * Se ve lo de los dossiers que la persona puede ver (listDossiers ya aplica permisos; en Supabase, además, la RLS).
 */
import type { AdminService } from '../admin/service';
import type { AdminSession } from '../admin/types';
import type { AnalyticsDb } from './db';
import { overviewOf, sectionsOf, statsOf } from './stats';

export function createAnalyticsService(db: AnalyticsDb, admin: AdminService, s: AdminSession) {
  return {
    async overview(opts: { mine?: boolean } = {}) {
      const ds = (await admin.listDossiers()).filter((d) => !opts.mine || d.authorId === s.userId);
      const visits = await db.listVisits(s.tenantId, ds.filter((d) => d.status === 'published').map((d) => d.id));
      return overviewOf(ds, visits);
    },
    /** Resumen por dossier (para la lista y la cabecera del editor). Solo ids que la persona ve. */
    async statsFor(ids: string[]) {
      const visible = new Set((await admin.listDossiers()).map((d) => d.id));
      const ok = ids.filter((id) => visible.has(id));
      const visits = await db.listVisits(s.tenantId, ok);
      return new Map(ok.map((id) => [id, statsOf(visits.filter((v) => v.dossierId === id))]));
    },
    async forDossier(id: string) {
      const state = await admin.getState(id);
      const visits = await db.listVisits(s.tenantId, [id]);
      const items = state.items.filter((i) => i.visible).sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, name: i.moduleName }));
      return { dossier: state.dossier, stats: statsOf(visits), sections: sectionsOf(visits, items), visits };
    },
  };
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
