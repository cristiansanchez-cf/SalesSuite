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
  }
}
