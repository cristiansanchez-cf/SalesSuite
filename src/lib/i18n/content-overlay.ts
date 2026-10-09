/**
 * Lecturas del contenido con su traducción encima (docs/I18N.md §Contenido): jugadas, sectores, actores, situaciones,
 * módulos del catálogo y recorrido de Aprende. Solo las lecturas: las escrituras van siempre al original. Si la
 * petición no tiene idioma de contenido (withContentLocale), devuelven el original tal cual.
 */
import type { AdminDb } from '../admin/db';
import type { PlaybookDb } from '../playbook/db';
import type { EvidenceDb } from '../evidence/db';
import { overlayList } from './content-db';

export function translatePlaybookDb(db: PlaybookDb): PlaybookDb {
  return {
    ...db,
    listPlays: async (t) => overlayList('play', await db.listPlays(t), (p) => p.id),
    listSegments: async (t) => overlayList('segment', await db.listSegments(t), (s) => s.id),
    listPersonas: async (t) => overlayList('persona', await db.listPersonas(t), (p) => p.id),
    listSegmentModules: async (t) => overlayList('segment_module', await db.listSegmentModules(t), (m) => `${m.segmentId}:${m.moduleId}`),
  };
}

export function translateEvidenceDb(db: EvidenceDb): EvidenceDb {
  return { ...db, listFacets: async (t) => overlayList('facet', await db.listFacets(t), (f) => f.id) };
}

export function translateAdminDb(db: AdminDb): AdminDb {
  return {
    ...db,
    listCatalog: async (t) => overlayList('module', await db.listCatalog(t), (c) => c.moduleId,
      (c) => ({ name: c.moduleName, description: c.description }), (c, v) => ({ ...c, moduleName: v.name as string, description: v.description as string | null })),
    listModuleVersions: async (t) => overlayList('module_version', await db.listModuleVersions(t), (v) => v.id,
      (v) => ({ props: v.defaultProps }), (v, x) => ({ ...v, defaultProps: x.props as Record<string, unknown> })),
    getTenant: async (id) => {
      const t = await db.getTenant(id);
      if (!t) return t;
      const [out] = await overlayList('tenant', [t], (x) => x.id, (x) => ({ tour: x.tour }), (x, v) => ({ ...x, tour: v.tour }));
      return out!;
    },
  };
}
