/**
 * Analítica de dossiers para la consola. Solo lee: las visitas se registran desde el enlace público.
 * Se ve lo de los dossiers que la persona puede ver (listDossiers ya aplica permisos; en Supabase, además, la RLS).
 */
import type { AdminService } from '../admin/service';
import type { AdminSession } from '../admin/types';
import type { AnalyticsDb } from './db';
import { overviewOf, sectionsOf, statsOf } from './stats';
import type { DossierVisit, InternalKind } from './types';

/** Solo cuenta el cliente: las visitas internas (prueba, tu navegador, tu red) se guardan pero no suman. */
const real = (vs: DossierVisit[]) => vs.filter((v) => !v.internal);

export function createAnalyticsService(db: AnalyticsDb, admin: AdminService, s: AdminSession) {
  return {
    /** `mine`: las mías; `authorId`: las de un comercial (para el admin). */
    async overview(opts: { mine?: boolean; authorId?: string } = {}) {
      const ds = (await admin.listDossiers()).filter((d) => (!opts.mine || d.authorId === s.userId) && (!opts.authorId || d.authorId === opts.authorId));
      const visits = await db.listVisits(s.tenantId, ds.filter((d) => d.status === 'published').map((d) => d.id));
      return overviewOf(ds, real(visits));
    },
    /** Resumen por dossier (para la lista y la cabecera del editor). Solo ids que la persona ve. */
    async statsFor(ids: string[]) {
      const visible = new Set((await admin.listDossiers()).map((d) => d.id));
      const ok = ids.filter((id) => visible.has(id));
      const visits = real(await db.listVisits(s.tenantId, ok));
      return new Map(ok.map((id) => [id, statsOf(visits.filter((v) => v.dossierId === id))]));
    },
    async forDossier(id: string) {
      const state = await admin.getState(id);
      const all = await db.listVisits(s.tenantId, [id]);
      const visits = real(all);
      const items = state.items.filter((i) => i.visible).sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, name: i.moduleName }));
      const internal: Record<InternalKind, number> = { test: 0, member: 0, team: 0 };
      for (const v of all) if (v.internal) internal[v.internal]++;
      return { dossier: state.dossier, stats: statsOf(visits), sections: sectionsOf(visits, items), visits, internal };
    },
  };
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
