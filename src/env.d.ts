/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly TRUST_FORWARDED_HOST?: string;
  readonly DEV_TENANT_SLUG?: string;
}

declare namespace App {
  interface Locals {
    /** Tenant resuelto por Host (middleware). null = host no mapeado. */
    tenant: import('./lib/types').TenantContext | null;
    /** Sesión de consola (solo en /admin/*, tras el middleware). */
    admin: import('./lib/admin/auth').AdminContext | null;
    /** Email autenticado sin membership en este tenant (página 403). */
    forbiddenEmail?: string;
    /** Motivo explicable del 403 (p. ej. acceso de colaborador caducado). */
    forbiddenReason?: { kind: 'partner-expired'; expiresAt: string | null };
  }
}
