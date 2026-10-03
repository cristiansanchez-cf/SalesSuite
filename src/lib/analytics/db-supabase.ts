import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsDb } from './db';

type Row = Record<string, any>;
/** La RLS de dossier_view decide qué se ve (las mismas reglas que el dossier). */
export function supabaseAnalyticsDb(sb: SupabaseClient): AnalyticsDb {
  return {
    async listVisits(tenantId, dossierIds) {
      if (!dossierIds.length) return [];
      const out: Row[] = [];
      // .in() con muchas ids rompe la URL: por tandas.
      for (let i = 0; i < dossierIds.length; i += 100) {
        const { data, error } = await sb.from('dossier_view')
          .select('id, dossier_id, visitor, device, started_at, last_seen_at, duration_ms, max_scroll, sections')
          .eq('tenant_id', tenantId).in('dossier_id', dossierIds.slice(i, i + 100)).order('started_at', { ascending: false }).limit(5000);
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out.map((r) => ({
        id: r.id, dossierId: r.dossier_id, visitor: r.visitor, device: r.device, startedAt: r.started_at, lastSeenAt: r.last_seen_at,
        durationMs: r.duration_ms, maxScroll: r.max_scroll, sections: r.sections ?? {},
      }));
    },
  };
}
