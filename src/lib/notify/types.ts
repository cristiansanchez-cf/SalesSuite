/**
 * Avisos (docs/NOTIFICATIONS.md). Los crean los triggers de Postgres (o su réplica en la demo) a partir
 * de hechos; aquí solo se leen, se marcan y se envían por email.
 */
export type Severity = 'action' | 'info';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  kind: string;
  severity: Severity;
  entityKey: string;
  params: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  emailedAt: string | null;
  resolvedAt: string | null;
}

/** Aviso listo para pintar: texto y enlace salen del tipo (render.ts). */
export interface NotificationView extends Notification {
  title: string;
  detail: string | null;
  href: string;
  icon: string;
  /** Sigue pidiendo algo: acción sin resolver (o sin leer, si se resuelve al verla) y no descartada. */
  open: boolean;
}
