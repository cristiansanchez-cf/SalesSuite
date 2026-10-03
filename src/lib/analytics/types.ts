/** Analítica de dossiers (docs/ANALYTICS.md). */
export type Device = 'mobile' | 'tablet' | 'desktop';

/** Una visita al enlace público: tiempo con la pestaña visible, hasta dónde bajó y ms por sección (id de item). */
export interface DossierVisit {
  id: string;
  dossierId: string;
  visitor: string;
  device: Device;
  startedAt: string;
  lastSeenAt: string;
  durationMs: number;
  maxScroll: number;
  sections: Record<string, number>;
  /** Interna (no cuenta): modo prueba, navegador con sesión de la consola o red del equipo. */
  internal?: InternalKind | null;
}

export type InternalKind = 'test' | 'member' | 'team';

/** Lo que manda el navegador (se llama varias veces por visita; la base de datos solo deja subir los valores). */
export interface TrackInput {
  viewId: string;
  visitor: string;
  device: Device;
  durationMs: number;
  scroll: number;
  sections: Record<string, number>;
  /** Lo pone el servidor, no el navegador: hash de la IP (con sal) y si hay sesión de la consola en este navegador. */
  ipHash?: string | null;
  member?: boolean;
}

export interface DossierStats {
  opens: number;
  visitors: number;
  totalMs: number;
  /** Duración media por visita (ms). */
  avgMs: number;
  maxScroll: number;
  firstAt: string | null;
  lastAt: string | null;
  mobileShare: number;
}
