/**
 * Base de datos en memoria del modo DEMO (sin Supabase). Se clona de fixtures.json al arrancar y
 * es MUTABLE: lo que se edita en /admin se ve en /d/<token>. Se pierde al reiniciar el proceso.
 * Vive en globalThis para sobrevivir al HMR de `astro dev`.
 */
import fixtures from '../../../supabase/seed/fixtures.json';

export type Role = 'admin' | 'rep';
export type DossierStatus = 'draft' | 'published' | 'archived';
export type PriceModeRow = 'none' | 'total' | 'per_module';

export interface TenantRow { id: string; slug: string; name: string; status: string; default_locale: string; theme_tokens: unknown }
export interface DomainRow { id: string; tenant_id: string; hostname: string; is_primary: boolean; ssl_status: string }
export interface ModuleRow { id: string; tenant_id: string; key: string; block_type: string; name: string; description: string | null; is_catalog: boolean }
export interface ModuleVersionRow {
  id: string; module_id: string; version: number; status: 'draft' | 'published' | 'archived';
  default_props: Record<string, unknown>; default_price: number | null; default_currency: string;
}
export interface DossierRow {
  id: string; tenant_id: string; author_id: string | null; title: string;
  prospect_name: string | null; prospect_company: string | null; prospect_meta: Record<string, unknown>;
  status: DossierStatus; locale: string; price_mode: PriceModeRow; total_price: number | null; currency: string;
  theme_override: unknown; published_at?: string | null; created_at?: string; updated_at?: string;
}
export interface DossierItemRow {
  id: string; dossier_id: string; module_version_id: string; position: number; visible: boolean;
  price_override: number | null; prop_overrides: Record<string, unknown>;
}
export interface ShareLinkRow { id: string; dossier_id: string; token: string; is_active: boolean; expires_at: string | null; created_at?: string; revoked_at?: string | null }
export interface DemoUser { id: string; email: string; display_name: string; memberships: Array<{ tenant_id: string; role: Role }> }

export interface DemoDb {
  tenant: TenantRow[];
  domain: DomainRow[];
  module: ModuleRow[];
  module_version: ModuleVersionRow[];
  dossier: DossierRow[];
  dossier_item: DossierItemRow[];
  share_link: ShareLinkRow[];
  users: DemoUser[];
}

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';

/** Usuarios de demo (equivalen a los de supabase/tests/20_rls.test.sql). */
export const DEMO_USERS: DemoUser[] = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test', display_name: 'Comercial Enjoy', memberships: [{ tenant_id: ENJOY, role: 'rep' }] },
  { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test', display_name: 'Admin Enjoy', memberships: [{ tenant_id: ENJOY, role: 'admin' }] },
  { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test', display_name: 'Comercial Re-tema', memberships: [{ tenant_id: ALT, role: 'rep' }] },
];

export function freshDemoDb(): DemoDb {
  const f = structuredClone(fixtures) as unknown as Omit<DemoDb, 'users'>;
  const now = new Date().toISOString();
  f.dossier.forEach((d) => { d.created_at ??= now; d.updated_at ??= now; d.published_at ??= d.status === 'published' ? now : null; });
  f.share_link.forEach((l) => { l.created_at ??= now; });
  return { ...f, users: structuredClone(DEMO_USERS) };
}

const KEY = Symbol.for('salessuite.demoDb');
type G = typeof globalThis & { [KEY]?: DemoDb };

export function demoDb(): DemoDb {
  const g = globalThis as G;
  return (g[KEY] ??= freshDemoDb());
}

/** Solo tests. */
export function resetDemoDb(): DemoDb {
  const g = globalThis as G;
  g[KEY] = freshDemoDb();
  return g[KEY];
}
