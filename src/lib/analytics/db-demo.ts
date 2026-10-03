/**
 * Visitas en memoria (modo DEMO). trackDemoView replica public.track_dossier_view
 * (supabase/migrations/20261017000000_dossier_views.sql): mismas validaciones y límites.
 */
import { demoDb } from '../data/store';
import type { AnalyticsDb } from './db';
import type { DossierVisit, TrackInput } from './types';
import { notifyAuthorOpened } from '../notify/db-demo';

const MAX_MS = 14_400_000;
const clamp = (n: unknown, lo: number, hi: number) => Math.min(Math.max(Math.round(Number(n) || 0), lo), hi);
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

export function trackDemoView(token: string, tenantId: string, i: TrackInput, now = new Date()): boolean {
  const s = demoDb();
  const link = s.share_link.find((l) => l.token === token);
  if (!link || !link.is_active || (link.expires_at && new Date(link.expires_at) <= now)) return false;
  const d = s.dossier.find((x) => x.id === link.dossier_id);
  if (!d || d.status !== 'published' || d.tenant_id !== tenantId) return false;
  if (!i.viewId || !VISITOR.test(i.visitor ?? '')) return false;
  const itemIds = new Set(s.dossier_item.filter((x) => x.dossier_id === d.id).map((x) => x.id));
  const sections: Record<string, number> = {};
  for (const [k, v] of Object.entries(i.sections ?? {}).slice(0, 200)) {
    if (Object.keys(sections).length >= 60) break;
    if (typeof v === 'number' && itemIds.has(k)) sections[k] = clamp(v, 0, MAX_MS);
  }
  const t = now.toISOString();
  const cur = s.dossier_view.find((v) => v.id === i.viewId);
  if (cur) {
    if (cur.dossier_id !== d.id || cur.visitor !== i.visitor || Date.parse(cur.started_at) < now.getTime() - 4 * 3_600_000) return false;
    cur.last_seen_at = t;
    cur.duration_ms = Math.max(cur.duration_ms, clamp(i.durationMs, 0, MAX_MS));
    cur.max_scroll = Math.max(cur.max_scroll, clamp(i.scroll, 0, 100));
    for (const [k, v] of Object.entries(sections)) cur.sections[k] = Math.max(cur.sections[k] ?? 0, v);
    return true;
  }
  const recent = s.dossier_view.filter((v) => v.dossier_id === d.id && v.visitor === i.visitor && Date.parse(v.started_at) > now.getTime() - 3_600_000).length;
  if (recent >= 20) return false;
  s.dossier_view.push({
    id: i.viewId, tenant_id: d.tenant_id, dossier_id: d.id, link_id: link.id, visitor: i.visitor,
    device: (['mobile', 'tablet', 'desktop'] as const).includes(i.device) ? i.device : 'desktop',
    started_at: t, last_seen_at: t, duration_ms: clamp(i.durationMs, 0, MAX_MS), max_scroll: clamp(i.scroll, 0, 100), sections,
  });
  if (d.author_id) notifyAuthorOpened(d.tenant_id, d.author_id, d.id, { dossierId: d.id, title: d.title, company: d.prospect_company }, now);
  return true;
}

/** Lectura: el servicio ya filtra por los dossiers que la persona puede ver (= RLS de dossier_view). */
export function demoAnalyticsDb(): AnalyticsDb {
  return {
    async listVisits(tenantId, dossierIds) {
      const ids = new Set(dossierIds);
      return demoDb().dossier_view.filter((v) => v.tenant_id === tenantId && ids.has(v.dossier_id))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .map((v): DossierVisit => ({
          id: v.id, dossierId: v.dossier_id, visitor: v.visitor, device: v.device, startedAt: v.started_at, lastSeenAt: v.last_seen_at,
          durationMs: v.duration_ms, maxScroll: v.max_scroll, sections: structuredClone(v.sections),
        }));
    },
  };
}
