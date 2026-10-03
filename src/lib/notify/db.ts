import type { Notification } from './types';

/** Lo que hace cada persona con SUS avisos (RLS: solo los propios; solo leído/descartado). */
export interface NotifyDb {
  list(tenantId: string, userId: string, opts: { limit: number }): Promise<Notification[]>;
  /** Marca como leídos (ids = null → todos los suyos sin leer). */
  markRead(tenantId: string, userId: string, ids: string[] | null): Promise<void>;
  dismiss(tenantId: string, userId: string, id: string): Promise<boolean>;
  getEmailPref(userId: string): Promise<boolean>;
  setEmailPref(userId: string, on: boolean): Promise<void>;
  /** Idioma preferido (docs/I18N.md). */
  getLocale(userId: string): Promise<string | null>;
  setLocale(userId: string, locale: string | null): Promise<void>;
}

/** Destinatario de un email, con el contexto del espacio de trabajo. */
export interface Recipient { userId: string; email: string; name: string | null; notifyEmail: boolean; digestSentAt: string | null; locale?: string | null }
export interface TenantInfo { id: string; name: string; hostname: string | null }

/**
 * Envío de emails (cron con service role, docs/NOTIFICATIONS.md). Ve todos los tenants: NUNCA se
 * construye con la sesión de un usuario.
 */
export interface NotifyJobDb {
  /** Avisos de acción sin enviar, creados antes de `before` (margen para agrupar). */
  unsent(before: string): Promise<Notification[]>;
  /** Avisos de las personas indicadas creados desde `since` o sin cerrar (para el resumen). */
  forDigest(userIds: string[], since: string): Promise<Notification[]>;
  recipients(userIds: string[]): Promise<Recipient[]>;
  /** Personas con avisos y sin resumen desde `before`. */
  digestDue(before: string): Promise<string[]>;
  tenants(ids: string[]): Promise<TenantInfo[]>;
  markEmailed(ids: string[], at: string): Promise<void>;
  markDigest(userId: string, at: string): Promise<void>;
}
