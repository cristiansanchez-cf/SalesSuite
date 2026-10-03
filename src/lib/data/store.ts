/**
 * Base de datos en memoria del modo DEMO (sin Supabase). Se clona de fixtures.json al arrancar y
 * es MUTABLE: lo que se edita en /admin se ve en /d/<token>. Se pierde al reiniciar el proceso.
 * Vive en globalThis para sobrevivir al HMR de `astro dev`.
 */
import fixtures from '../../../supabase/seed/fixtures.json';

export type Role = 'admin' | 'rep' | 'partner';
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
  segment_id?: string | null; next_step?: string | null; next_step_at?: string | null;
  partner_account_id?: string | null;
  situation?: Record<string, string[]>;
}
export interface DossierItemRow {
  id: string; dossier_id: string; module_version_id: string; position: number; visible: boolean;
  price_override: number | null; prop_overrides: Record<string, unknown>;
}
export interface ShareLinkRow { id: string; dossier_id: string; token: string; is_active: boolean; expires_at: string | null; created_at?: string; revoked_at?: string | null }
export interface PlayRow {
  id: string; tenant_id: string; module_id: string | null; key: string | null; kind: string; stage: string | null; objection: string | null;
  segments: string[]; personas?: string[]; title: string; body: string; when_to_use: string | null; why_it_works: string | null; technique_refs: unknown[];
  position: number; status: string; version: number; author_id: string | null; updated_by?: string | null; created_at?: string; updated_at?: string;
  audience?: 'all' | 'team' | 'partners';
}
export interface PlayRevisionRow { id: string; tenant_id: string; play_id: string; version: number; snapshot: Record<string, unknown>; change_note: string | null; changed_by: string | null; contribution_id: string | null; created_at: string }
export interface ContributionRow {
  id: string; tenant_id: string; type: string; play_id: string | null; module_id: string | null; kind: string; title: string; body: string;
  status: string; author_id: string; review_note: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
}
export interface FeedbackRow { tenant_id: string; user_id: string; target_type: string; target_id: string; verdict: string; note: string | null; dossier_id: string | null; updated_at: string }
export interface ProgressRow { tenant_id: string; user_id: string; topic: string; completed_at: string }
export interface SeenRow { tenant_id: string; user_id: string; seen_at: string }
export interface SegmentRow {
  id: string; tenant_id: string; key: string; name: string; description: string | null; value_prop: string | null; icp: string | null;
  disqualifiers: string | null; buying_process: string | null; deal_size: string | null; sales_cycle: string | null; position: number; status: string;
  icon?: string | null;
}
export interface PersonaRow {
  id: string; tenant_id: string; segment_id: string; key: string; name: string; role: string; goals: string | null; pains: string | null;
  kpis: string | null; objections: string[]; how_to_approach: string | null; avoid: string | null; can_help: string | null; can_block: string | null; position: number;
}
export interface SegmentModuleRow { tenant_id: string; segment_id: string; module_id: string; fit: string | null; priority: number }
export interface PersonaModuleRow { tenant_id: string; persona_id: string; module_id: string; angle: string }
export interface DossierContactRow {
  id: string; tenant_id: string; dossier_id: string; persona_id: string | null; name: string; stance: string;
  email: string | null; phone: string | null; notes: string | null; position: number;
  traits?: Record<string, string[]>;
}
export interface SituationFacetRow {
  id: string; tenant_id: string; key: string; label: string; question: string | null; icon: string | null; scope: 'account' | 'contact';
  multi: boolean; weight: number; options: Array<{ key: string; label: string; icon?: string; hint?: string }>; position: number; status: string;
}
export interface WinStoryRow {
  id: string; tenant_id: string; dossier_id: string | null; author_id: string | null; outcome: 'won' | 'lost'; segment_id: string | null;
  persona_ids: string[]; situation: Record<string, string[]>; play_ids: string[]; what_worked: string | null; what_failed: string | null;
  key_stage: string | null; objection: string | null; title: string; status: 'shared' | 'hidden'; created_at?: string; updated_at?: string;
}
export interface PartnerProfileRow {
  tenant_id: string; user_id: string; module_ids: string[]; see_team_tips: boolean; welcome_note: string | null; expires_at: string | null;
}
export interface PartnerAccountRow {
  id: string; tenant_id: string; user_id: string; name: string; segment_id: string | null;
  price_policy: 'hidden' | 'list' | 'adjusted'; price_adjust_pct: number; notes: string | null; position: number;
}
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
  segment: SegmentRow[];
  persona: PersonaRow[];
  segment_module: SegmentModuleRow[];
  persona_module: PersonaModuleRow[];
  dossier_contact: DossierContactRow[];
  partner_profile: PartnerProfileRow[];
  partner_account: PartnerAccountRow[];
  situation_facet: SituationFacetRow[];
  win_story: WinStoryRow[];
}

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';

/** Usuarios de demo (equivalen a los de supabase/tests/20_rls.test.sql). */
export const DEMO_USERS: DemoUser[] = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test', display_name: 'Comercial Enjoy', memberships: [{ tenant_id: ENJOY, role: 'rep' }] },
  { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test', display_name: 'Admin Enjoy', memberships: [{ tenant_id: ENJOY, role: 'admin' }] },
  { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test', display_name: 'Comercial Re-tema', memberships: [{ tenant_id: ALT, role: 'rep' }] },
  { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test', display_name: 'DJ Dani (colaborador)', memberships: [{ tenant_id: ENJOY, role: 'partner' }] },
];

/** Colaborador de demo: DJ que vende en sus tres locales (docs/PARTNERS.md). */
const NIGHTLIFE = '00000000-0000-4000-8000-0000005e0002';
export const DEMO_PARTNER = {
  profile: {
    tenant_id: ENJOY, user_id: '55555555-5555-4555-8555-555555555555',
    module_ids: ['00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000e103'],
    see_team_tips: false, expires_at: null,
    welcome_note: '¡Hola, Dani! Aquí tienes tus tres locales.\n\n- Ofrece **Experiencias** y **Locales**; el resto lo llevamos nosotros.\n- Los precios los fijamos desde Enjoy: tú no tienes que negociarlos.\n- Si el dueño quiere hablar de dinero, pásale el enlace y avísanos.',
  } satisfies PartnerProfileRow,
  accounts: [
    { id: '00000000-0000-4000-8000-0000009a0001', tenant_id: ENJOY, user_id: '55555555-5555-4555-8555-555555555555', name: 'Sala Luna', segment_id: NIGHTLIFE,
      price_policy: 'hidden', price_adjust_pct: 0, notes: 'El dueño (Marcos) negocia directamente con Enjoy: presenta la experiencia y deja el precio para nosotros.', position: 1024 },
    { id: '00000000-0000-4000-8000-0000009a0002', tenant_id: ENJOY, user_id: '55555555-5555-4555-8555-555555555555', name: 'Club Neón', segment_id: NIGHTLIFE,
      price_policy: 'adjusted', price_adjust_pct: -10, notes: 'Precio especial de lanzamiento. Habla con la jefa de sala.', position: 2048 },
    { id: '00000000-0000-4000-8000-0000009a0003', tenant_id: ENJOY, user_id: '55555555-5555-4555-8555-555555555555', name: 'Terraza Sur', segment_id: NIGHTLIFE,
      price_policy: 'list', price_adjust_pct: 0, notes: null, position: 3072 },
  ] satisfies PartnerAccountRow[],
};

export function freshDemoDb(): DemoDb {
  const f = structuredClone(fixtures) as unknown as Pick<DemoDb, 'tenant' | 'domain' | 'module' | 'module_version' | 'dossier' | 'dossier_item' | 'share_link' | 'play'
    | 'segment' | 'persona' | 'segment_module' | 'persona_module' | 'dossier_contact' | 'situation_facet' | 'win_story'>;
  const now = new Date().toISOString();
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  f.dossier.forEach((d) => { d.created_at ??= now; d.updated_at ??= now; d.published_at ??= d.status === 'published' ? now : null; });
  f.share_link.forEach((l) => { l.created_at ??= now; });
  f.play.forEach((p) => { p.created_at ??= ago(30); p.updated_at ??= ago(30); });
  f.win_story.forEach((w, i) => { w.created_at ??= ago(40 - i * 6); w.updated_at ??= w.created_at; });
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
    partner_profile: [structuredClone(DEMO_PARTNER.profile)],
    partner_account: structuredClone(DEMO_PARTNER.accounts),
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
