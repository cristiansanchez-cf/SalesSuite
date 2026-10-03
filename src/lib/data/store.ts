/**
 * Base de datos en memoria del modo DEMO (sin Supabase). Se clona de fixtures.json al arrancar y
 * es MUTABLE: lo que se edita en /admin se ve en /d/<token>. Se pierde al reiniciar el proceso.
 * Vive en globalThis para sobrevivir al HMR de `astro dev`.
 */
import fixtures from '../../../supabase/seed/fixtures.json';

export type Role = 'admin' | 'rep';
export type DossierStatus = 'draft' | 'published' | 'archived';
export type PriceModeRow = 'none' | 'total' | 'per_module';

export interface TenantRow { id: string; slug: string; name: string; status: string; default_locale: string; theme_tokens: unknown; brand: unknown }
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
  outcome?: 'open' | 'won' | 'lost'; outcome_note?: string | null; outcome_at?: string | null;
}
export interface DossierItemRow {
  id: string; dossier_id: string; module_version_id: string; position: number; visible: boolean;
  price_override: number | null; prop_overrides: Record<string, unknown>;
}
export interface ShareLinkRow { id: string; dossier_id: string; token: string; is_active: boolean; expires_at: string | null; created_at?: string; revoked_at?: string | null }
export interface PlayRow {
  id: string; tenant_id: string; module_id: string | null; key: string | null; kind: string; stage: string | null; objection: string | null;
  segments: string[]; title: string; body: string; when_to_use: string | null; why_it_works: string | null; technique_refs: unknown[];
  position: number; status: string; version: number; author_id: string | null; updated_by?: string | null; created_at?: string; updated_at?: string;
}
export interface PlayRevisionRow { id: string; tenant_id: string; play_id: string; version: number; snapshot: Record<string, unknown>; change_note: string | null; changed_by: string | null; contribution_id: string | null; created_at: string }
export interface ContributionRow {
  id: string; tenant_id: string; type: string; play_id: string | null; module_id: string | null; kind: string; title: string; body: string;
  status: string; author_id: string; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
}
export interface FeedbackRow { tenant_id: string; user_id: string; target_type: string; target_id: string; verdict: string; note: string | null; dossier_id: string | null; updated_at: string }
export interface ProgressRow { tenant_id: string; user_id: string; topic: string; completed_at: string }
export interface SeenRow { tenant_id: string; user_id: string; seen_at: string }
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
  play: PlayRow[];
  play_revision: PlayRevisionRow[];
  play_contribution: ContributionRow[];
  play_feedback: FeedbackRow[];
  learning_progress: ProgressRow[];
  playbook_seen: SeenRow[];
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
  const f = structuredClone(fixtures) as unknown as Pick<DemoDb, 'tenant' | 'domain' | 'module' | 'module_version' | 'dossier' | 'dossier_item' | 'share_link' | 'play'>;
  const now = new Date().toISOString();
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  f.dossier.forEach((d) => { d.created_at ??= now; d.updated_at ??= now; d.published_at ??= d.status === 'published' ? now : null; });
  f.share_link.forEach((l) => { l.created_at ??= now; });
  f.play.forEach((p) => { p.created_at ??= ago(30); p.updated_at ??= ago(30); });
  const REP = DEMO_USERS[0].id;
  const pricePlay = f.play.find((p) => p.key === 'empresa-obj-precio');
  const expPitch = f.play.find((p) => p.key === 'exp-pitch');
  return {
    ...f,
    users: structuredClone(DEMO_USERS),
    // Historia de ejemplo: una revisión reciente (aparece en "Novedades") y aportes del equipo.
    play_revision: expPitch ? [{
      id: '00000000-0000-4000-8000-0000009b0001', tenant_id: ENJOY, play_id: expPitch.id, version: 1,
      snapshot: { title: expPitch.title, body: expPitch.body }, change_note: 'Nuevo argumento tras las bodas de septiembre',
      changed_by: DEMO_USERS[1].id, contribution_id: null, created_at: ago(1),
    }] : [],
    play_contribution: [
      {
        id: '00000000-0000-4000-8000-0000009c0001', tenant_id: ENJOY, type: 'tip', play_id: null,
        module_id: '00000000-0000-4000-8000-00000000e102', kind: 'tip', title: 'Pide a la novia que pruebe la kiss-cam en la reunión',
        body: 'Cuando la novia la prueba en su móvil y se ve en la vista previa, la decisión cambia de "quizá" a "¿cuándo lo montamos?". Me ha funcionado en 3 de 4 reuniones.',
        status: 'shared', author_id: REP, review_note: null, reviewed_by: null, reviewed_at: null, created_at: ago(2),
      },
      ...(pricePlay ? [{
        id: '00000000-0000-4000-8000-0000009c0002', tenant_id: ENJOY, type: 'change', play_id: pricePlay.id, module_id: null, kind: 'objection',
        title: 'Añadir el coste por invitado',
        body: pricePlay.body + '\n\nCalcula delante de ellos el **coste por invitado** (precio ÷ invitados): suele quedar por debajo de 5 €.',
        status: 'pending', author_id: REP, review_note: null, reviewed_by: null, reviewed_at: null, created_at: ago(1),
      }] : []),
    ],
    play_feedback: [],
    learning_progress: [],
    playbook_seen: [],
  };
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
