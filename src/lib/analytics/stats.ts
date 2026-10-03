/** Cálculos puros de la analítica de dossiers (sin base de datos: se prueban solos). */
import type { DossierStats, DossierVisit } from './types';

export function statsOf(visits: DossierVisit[]): DossierStats {
  const opens = visits.length;
  const totalMs = visits.reduce((a, v) => a + v.durationMs, 0);
  const times = visits.map((v) => v.startedAt).sort();
  return {
    opens,
    visitors: new Set(visits.map((v) => v.visitor)).size,
    totalMs,
    avgMs: opens ? Math.round(totalMs / opens) : 0,
    maxScroll: visits.reduce((a, v) => Math.max(a, v.maxScroll), 0),
    firstAt: times[0] ?? null,
    lastAt: visits.map((v) => v.lastSeenAt).sort().at(-1) ?? null,
    mobileShare: opens ? visits.filter((v) => v.device !== 'desktop').length / opens : 0,
  };
}

/** Tiempo por sección sumando todas las visitas, en el orden del dossier; share = parte del total (0–1). */
export function sectionsOf(visits: DossierVisit[], items: Array<{ id: string; name: string }>) {
  const ms = new Map<string, number>();
  for (const v of visits) for (const [k, n] of Object.entries(v.sections)) ms.set(k, (ms.get(k) ?? 0) + n);
  const total = [...ms.values()].reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...ms.values());
  return items.map((i) => ({ ...i, ms: ms.get(i.id) ?? 0, share: total ? (ms.get(i.id) ?? 0) / total : 0, top: max > 0 && ms.get(i.id) === max }));
}

export interface DossierLike { id: string; status: string; outcome: 'open' | 'won' | 'lost'; publishedAt: string | null; nextStepAt: string | null }

/**
 * Resumen del equipo y las tres listas que importan para el seguimiento:
 * - hot: abiertas en las últimas 48 h;
 * - noFollowUp: abiertas, siguen en juego y sin próximo paso (o vencido) → «escríbele hoy»;
 * - neverOpened: publicadas hace más de 2 días y nadie las ha abierto → «¿le llegó el enlace?».
 */
export function overviewOf<D extends DossierLike>(dossiers: D[], visits: DossierVisit[], now = new Date()) {
  const byDossier = new Map<string, DossierVisit[]>();
  for (const v of visits) byDossier.set(v.dossierId, [...(byDossier.get(v.dossierId) ?? []), v]);
  const published = dossiers.filter((d) => d.status === 'published' && d.publishedAt);
  const rows = published.map((d) => ({ dossier: d, stats: statsOf(byDossier.get(d.id) ?? []) }))
    .sort((a, b) => (b.stats.lastAt ?? '').localeCompare(a.stats.lastAt ?? '') || (b.dossier.publishedAt ?? '').localeCompare(a.dossier.publishedAt ?? ''));
  const t = now.getTime();
  const opened = rows.filter((r) => r.stats.opens > 0);
  const firstOpenHours = opened
    .map((r) => (Date.parse(r.stats.firstAt!) - Date.parse(r.dossier.publishedAt!)) / 3_600_000)
    .filter((h) => h >= 0).sort((a, b) => a - b);
  const median = firstOpenHours.length ? firstOpenHours[Math.floor((firstOpenHours.length - 1) / 2)] : null;
  return {
    rows,
    summary: {
      published: rows.length,
      opened: opened.length,
      openRate: rows.length ? opened.length / rows.length : 0,
      medianHoursToOpen: median,
      avgMs: opened.length ? Math.round(opened.reduce((a, r) => a + r.stats.avgMs, 0) / opened.length) : 0,
    },
    hot: opened.filter((r) => t - Date.parse(r.stats.lastAt!) < 48 * 3_600_000),
    noFollowUp: opened.filter((r) => r.dossier.outcome === 'open' && (!r.dossier.nextStepAt || Date.parse(r.dossier.nextStepAt) < t)),
    neverOpened: rows.filter((r) => r.stats.opens === 0 && t - Date.parse(r.dossier.publishedAt!) > 48 * 3_600_000),
  };
}
