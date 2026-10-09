/**
 * Base de datos en memoria del modo DEMO (sin Supabase). Se clona de fixtures.json al arrancar y
 * es MUTABLE: lo que se edita en /admin se ve en /d/<token>. Se pierde al reiniciar el proceso.
 * Vive en globalThis para sobrevivir al HMR de `astro dev`.
 */
import fixtures from '../../../supabase/seed/fixtures.json';

export type Role = 'admin' | 'lead' | 'rep' | 'partner';
export type DossierStatus = 'draft' | 'published' | 'archived';
export type PriceModeRow = 'none' | 'total' | 'per_module';

export interface TenantRow { id: string; slug: string; name: string; status: string; default_locale: string; theme_tokens: unknown; brand: unknown; tour?: unknown }
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
  view_mode?: 'test' | 'live';
  price_option_id?: string | null;
  client_media?: import('../types').ClientMedia;
  preset?: { mode?: 'full' | 'visual'; answers?: string[] };
  situation?: Record<string, string[]>;
  account_id?: string | null; account_eligibility?: string | null; account_decision?: 'approved' | 'rejected' | null;
  account_decided_by?: string | null; account_decided_at?: string | null;
  coupon_id?: string | null; discount?: { code: string; label: string; kind: 'percent' | 'fixed' | 'free_months'; value: number } | null;
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
  audience?: 'all' | 'team' | 'partners'; about?: boolean; pinned?: number | null;
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
  icon?: string | null; image?: string | null; notice?: string | null; proposal?: unknown;
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
  can_invite?: boolean;
}
export interface PartnerAccountRow {
  id: string; tenant_id: string; user_id: string; name: string; segment_id: string | null;
  price_policy: 'hidden' | 'list' | 'adjusted'; price_adjust_pct: number; notes: string | null; position: number;
}
export interface DemoUser { id: string; email: string; display_name: string; memberships: Array<{ tenant_id: string; role: Role; invited_by?: string | null; created_at?: string; delegation_id?: string | null }>; platform_admin?: boolean; locale?: string; phone?: string | null; notify_email?: boolean; digest_sent_at?: string | null; daily_digest?: boolean; timezone?: string; onboarding?: Record<string, string> }
export interface ZoneRow { id: string; tenant_id: string; parent_id: string | null; name: string; kind: string; position: number; delegation_id?: string | null }
export interface DelegationRow { id: string; tenant_id: string; name: string; manager_id: string | null; position: number }
export interface MembershipZoneRow { tenant_id: string; user_id: string; zone_id: string }
export interface AccountRulesRow { tenant_id: string; claim_days: number; strict_zones: boolean; require_account: boolean }
export interface AccountRow {
  id: string; tenant_id: string; name: string; zone_id: string | null; segment_id: string | null; address: string | null; external_ref: string | null;
  notes: string | null; status: 'open' | 'customer' | 'blocked'; blocked_reason: string | null; owner_id: string | null; claimed_until: string | null;
  last_touch_at: string | null; last_touch_by: string | null; won_at: string | null; won_by: string | null; won_dossier_id: string | null;
  created_by: string | null; created_at: string;
  /** Valores de los campos del CRM (docs/CRM_DINAMICO.md). */
  fields?: Record<string, unknown>;
  /** Grupo (otra empresa), listas e importación de origen (fase 2). */
  parent_id?: string | null; tags?: string[]; import_id?: string | null;
  phone?: string | null; email?: string | null; instagram?: string | null; linkedin?: string | null; website?: string | null; maps_url?: string | null;
  next_step?: string | null; next_step_at?: string | null; next_contact_id?: string | null; next_channel?: string | null;
}
export interface CrmActivityRow {
  id: string; tenant_id: string; account_id: string; contact_id: string | null; user_id: string | null; channel: string; outcome: string; note: string | null;
  happened_at: string; created_at: string;
}
export interface CrmFieldRow {
  id: string; tenant_id: string; key: string; label: string; type: string; options: Array<{ key: string; label: string }>; grp: string | null;
  position: number; help: string | null; required: boolean; in_list: boolean; filterable: boolean; segments: string[]; archived_at: string | null; created_at: string;
  target?: 'account' | 'contact'; tags?: string[]; is_stage?: boolean;
}
export interface CrmContactRow {
  id: string; tenant_id: string; name: string; email: string | null; phone: string | null; instagram: string | null; linkedin: string | null; city: string | null; notes: string | null;
  fields: Record<string, unknown>; tags: string[]; owner_id: string | null; import_id: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface CrmContactAccountRow { tenant_id: string; contact_id: string; account_id: string; role: string | null; created_at: string }
export interface CrmImportRow {
  id: string; tenant_id: string; created_by: string | null; file_name: string; target: 'account' | 'contact'; headers: string[]; rows: string[][];
  mapping: Record<string, unknown>; status: 'draft' | 'done' | 'undone'; stats: Record<string, unknown>; created_at: string; done_at: string | null;
}
export interface AccountTouchRow { id: string; tenant_id: string; account_id: string; user_id: string | null; kind: string; note: string | null; created_at: string }
export interface RevenueEventRow {
  id: string; tenant_id: string; source: string; external_id: string; kind: string; status: string; occurred_at: string; amount_cents: number;
  revenue_cents: number; currency: string; account_id: string | null; dossier_id: string | null; seller_id: string | null; offer: string | null;
  metric: string | null; quantity: number | null; refunds_event_id: string | null; note: string | null; created_by: string | null; created_at: string;
  confirmed_by: string | null; confirmed_at: string | null;
}
export interface CommissionPlanRow { id: string; tenant_id: string; name: string; is_default: boolean; rules: unknown[]; referral: unknown; updated_at: string }
export interface CommissionEntryRow {
  id: string; tenant_id: string; user_id: string; event_id: string | null; dedupe_key: string; kind: string; rule_id: string | null; rule_label: string | null;
  base_cents: number; amount_cents: number; currency: string; period: string; status: string; reason: string | null; account_id: string | null;
  payout_id: string | null; created_by: string | null; created_at: string; approved_by: string | null; approved_at: string | null;
}
export interface PayoutRow { id: string; tenant_id: string; user_id: string; period: string; total_cents: number; currency: string; status: 'open' | 'paid'; paid_at: string | null; created_by: string | null; created_at: string }
export interface ApiKeyRow { id: string; tenant_id: string; name: string; key_hash: string; prefix: string; created_by: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }
export interface CouponRow {
  id: string; tenant_id: string; code: string; label: string; kind: 'percent' | 'fixed' | 'free_months'; value: number; max_uses: number | null;
  valid_until: string | null; active: boolean; note: string | null; created_at: string;
}
export interface ConnectorRow { id: string; tenant_id: string; key: string; name: string; mapping: Record<string, unknown>; active: boolean }
export interface NotificationRow {
  id: string; tenant_id: string; user_id: string; kind: string; severity: 'action' | 'info'; entity_key: string; params: Record<string, unknown>;
  created_at: string; read_at: string | null; dismissed_at: string | null; emailed_at: string | null; resolved_at: string | null;
}

export interface DossierViewRow {
  id: string; tenant_id: string; dossier_id: string; link_id: string | null; visitor: string; device: 'mobile' | 'tablet' | 'desktop';
  started_at: string; last_seen_at: string; duration_ms: number; max_scroll: number; sections: Record<string, number>;
  internal?: 'test' | 'member' | 'team' | null;
}
export interface PriceOptionRow {
  id: string; tenant_id: string; label: string; amount: number; currency: string; period: 'once' | 'event' | 'month' | 'year';
  payment_link: string | null; segment_id: string | null; position: number; active: boolean;
  kind?: string | null; is_default?: boolean; quote_only?: boolean; note?: string | null;
}
export interface TeamIpRow { tenant_id: string; ip_hash: string; last_seen_at: string }

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
  notification: NotificationRow[];
  zone: ZoneRow[];
  delegation: DelegationRow[];
  membership_zone: MembershipZoneRow[];
  account_rules: AccountRulesRow[];
  account: AccountRow[];
  crm_field: CrmFieldRow[];
  crm_contact: CrmContactRow[];
  crm_contact_account: CrmContactAccountRow[];
  crm_import: CrmImportRow[];
  crm_activity: CrmActivityRow[];
  account_touch: AccountTouchRow[];
  revenue_event: RevenueEventRow[];
  commission_plan: CommissionPlanRow[];
  commission_plan_member: Array<{ tenant_id: string; user_id: string; plan_id: string }>;
  commission_entry: CommissionEntryRow[];
  payout: PayoutRow[];
  api_key: ApiKeyRow[];
  connector: ConnectorRow[];
  coupon: CouponRow[];
  price_option: PriceOptionRow[];
  proposal_template?: Array<{ id: string; tenant_id: string; segment_id: string; name: string; mode: 'full' | 'visual'; answers: string[]; price_option_id: string | null; created_by: string | null; created_at: string }>;
  member_conditions: Array<{ tenant_id: string; user_id: string; visible: boolean; note: string | null; agreed_at: string | null }>;
  dossier_view: DossierViewRow[];
  team_ip: TeamIpRow[];
  daily_digest_log: Array<{ user_id: string; tenant_id: string; day: string; emailed: boolean; sent_at: string }>;
  member_conditions_history: Array<{ tenant_id: string; user_id: string; visible: boolean; note: string | null; plan: import('../commissions/types').ConditionsChange['plan']; changed_by: string | null; changed_at: string; seq: number }>;
}

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';

/** Usuarios de demo (equivalen a los de supabase/tests/20_rls.test.sql). */
export const DEMO_USERS: DemoUser[] = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test', display_name: 'Comercial Enjoy', memberships: [{ tenant_id: ENJOY, role: 'rep' }] },
  { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test', display_name: 'Admin Enjoy', memberships: [{ tenant_id: ENJOY, role: 'admin' }] },
  { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test', display_name: 'Comercial Re-tema', memberships: [{ tenant_id: ALT, role: 'rep' }] },
  { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test', display_name: 'DJ Dani (colaborador)', memberships: [{ tenant_id: ENJOY, role: 'partner' }] },
  // Superadmin de la plataforma (docs/ORG.md): sin membresía, entra en todos los espacios como admin.
  { id: '99999999-9999-4999-8999-0000000000aa', email: 'super@cofundo.test', display_name: 'Superadmin Cofundo', memberships: [], platform_admin: true },
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

const Z = {
  es: '00000000-0000-4000-8000-0000000a0001', cv: '00000000-0000-4000-8000-0000000a0002', vlc: '00000000-0000-4000-8000-0000000a0003',
  cs: '00000000-0000-4000-8000-0000000a0004', cat: '00000000-0000-4000-8000-0000000a0005', bcn: '00000000-0000-4000-8000-0000000a0006',
  mad: '00000000-0000-4000-8000-0000000a0007',
};
const DEMO_ZONES: ZoneRow[] = [
  { id: Z.es, tenant_id: ENJOY, parent_id: null, name: 'España', kind: 'country', position: 0 },
  { id: Z.cv, tenant_id: ENJOY, parent_id: Z.es, name: 'Comunidad Valenciana', kind: 'region', position: 0 },
  { id: Z.vlc, tenant_id: ENJOY, parent_id: Z.cv, name: 'Valencia', kind: 'city', position: 0 },
  { id: Z.cs, tenant_id: ENJOY, parent_id: Z.cv, name: 'Castellón', kind: 'city', position: 1 },
  { id: Z.cat, tenant_id: ENJOY, parent_id: Z.es, name: 'Cataluña', kind: 'region', position: 1 },
  { id: Z.bcn, tenant_id: ENJOY, parent_id: Z.cat, name: 'Barcelona', kind: 'city', position: 0 },
  { id: Z.mad, tenant_id: ENJOY, parent_id: Z.es, name: 'Madrid', kind: 'city', position: 2 },
];
function demoAccount(id: string, name: string, zone: string, p: Partial<AccountRow>): AccountRow {
  return {
    id, tenant_id: ENJOY, name, zone_id: zone, segment_id: NIGHTLIFE, address: null, external_ref: null, notes: null, status: 'open', blocked_reason: null,
    owner_id: null, claimed_until: null, last_touch_at: null, last_touch_by: null, won_at: null, won_by: null, won_dossier_id: null,
    created_by: null, created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(), ...p,
  };
}

// Analítica de ejemplo (docs/ANALYTICS.md): dos propuestas más del comercial y visitas realistas.
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const CLUB_SOL = '00000000-0000-4000-8000-000000d05511';
const MAR_AZUL = '00000000-0000-4000-8000-000000d05512';
function demoAnalyticsDossiers(f: { dossier: DossierRow[]; dossier_item: DossierItemRow[]; share_link: ShareLinkRow[] }, rep: string, ago: (days: number) => string) {
  const base = f.dossier.find((d) => d.id === SALA_X);
  if (!base) return;
  const items = f.dossier_item.filter((i) => i.dossier_id === SALA_X && i.visible);
  const add = (id: string, n: number, title: string, company: string, contact: string, publishedDaysAgo: number, token: string) => {
    f.dossier.push({ ...structuredClone(base), id, author_id: rep, title, prospect_company: company, prospect_name: contact, status: 'published',
      published_at: ago(publishedDaysAgo), created_at: ago(publishedDaysAgo + 1), updated_at: ago(publishedDaysAgo), next_step: null, next_step_at: null, outcome: 'open' });
    items.forEach((i, k) => f.dossier_item.push({ ...structuredClone(i), id: `00000000-0000-4000-8000-0000001${n}e00${k + 1}`, dossier_id: id }));
    f.share_link.push({ id: `00000000-0000-4000-8000-0000005a010${n}`, dossier_id: id, token, is_active: true, expires_at: null, created_at: ago(publishedDaysAgo) });
  };
  add(CLUB_SOL, 1, 'Club Sol · Fiesta de verano', 'Club Sol', 'Marta', 4, 'demo-club-sol-4Hq8');
  add(MAR_AZUL, 2, 'Hotel Mar Azul · Eventos de empresa', 'Hotel Mar Azul', 'Jorge', 6, 'demo-mar-azul-9Lw2');
}
function demoVisits(items: DossierItemRow[]): DossierViewRow[] {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const secs = (dossier: string, ms: number[]) => Object.fromEntries(items.filter((i) => i.dossier_id === dossier && i.visible).map((i, k) => [i.id, ms[k] ?? 0]));
  const v = (n: number, dossier: string, visitor: string, device: DossierViewRow['device'], h: number, dur: number, scroll: number, ms: number[]): DossierViewRow => ({
    id: `00000000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`, tenant_id: ENJOY, dossier_id: dossier, link_id: null, visitor, device,
    started_at: hoursAgo(h), last_seen_at: hoursAgo(h - dur / 3_600_000), duration_ms: dur, max_scroll: scroll, sections: secs(dossier, ms),
  });
  return [
    // Sala X: la novia lo abre en el móvil, vuelve dos días después y lo reenvía (segundo visitante, en ordenador).
    v(1, SALA_X, 'demo-visitor-laura', 'mobile', 140, 95_000, 70, [20_000, 45_000, 18_000, 12_000]),
    v(2, SALA_X, 'demo-visitor-laura', 'mobile', 92, 210_000, 100, [15_000, 60_000, 30_000, 105_000]),
    v(3, SALA_X, 'demo-visitor-padre', 'desktop', 30, 160_000, 100, [10_000, 40_000, 25_000, 85_000]),
    v(4, SALA_X, 'demo-visitor-laura', 'mobile', 5, 45_000, 100, [3_000, 4_000, 3_000, 35_000]),
    // Club Sol: abierta tres veces, la última hace 3 h, y sin próximo paso apuntado.
    v(5, CLUB_SOL, 'demo-visitor-marta', 'desktop', 70, 120_000, 90, [25_000, 50_000, 30_000, 15_000]),
    v(6, CLUB_SOL, 'demo-visitor-marta', 'mobile', 26, 60_000, 100, [5_000, 20_000, 10_000, 25_000]),
    v(7, CLUB_SOL, 'demo-visitor-socio', 'desktop', 3, 180_000, 100, [10_000, 70_000, 40_000, 60_000]),
  ];
}

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
  demoAnalyticsDossiers(f, REP, ago);
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
    // El aporte pendiente de ejemplo ya avisó al admin (lo haría el trigger notify_contribution).
    notification: pricePlay ? [{
      id: '00000000-0000-4000-8000-0000009d0001', tenant_id: ENJOY, user_id: DEMO_USERS[1].id, kind: 'contribution_pending', severity: 'action',
      entity_key: '00000000-0000-4000-8000-0000009c0002', params: { title: 'Añadir el coste por invitado', type: 'change', author: DEMO_USERS[0].display_name },
      created_at: ago(1), read_at: null, dismissed_at: null, emailed_at: ago(1), resolved_at: null,
    }] : [],
    // Territorio y cuentas de ejemplo (docs/ACCOUNTS.md).
    zone: DEMO_ZONES.map((z) => ({ ...z })),
    delegation: [],
    membership_zone: [{ tenant_id: ENJOY, user_id: REP, zone_id: Z.cv }],
    account_rules: [],
    account: [
      demoAccount('00000000-0000-4000-8000-0000000ac001', 'Club Sol', Z.vlc, { owner_id: REP, claimed_until: ago(-20), last_touch_at: ago(10), last_touch_by: REP, notes: 'Tiene DJ residente los viernes.', fields: { 'tiene-pantalla': true, aforo: 450 },
        instagram: 'https://www.instagram.com/clubsol/', next_step: 'Proponer una cita el jueves', next_step_at: ago(0), next_channel: 'whatsapp', next_contact_id: '00000000-0000-4000-8000-0000000cc501' }),
      demoAccount('00000000-0000-4000-8000-0000000ac002', 'Sala Marina', Z.vlc, {}),
      demoAccount('00000000-0000-4000-8000-0000000ac003', 'Terraza Azahar', Z.cs, {}),
      demoAccount('00000000-0000-4000-8000-0000000ac004', 'Discoteca Faro', Z.bcn, {}),
      demoAccount('00000000-0000-4000-8000-0000000ac005', 'Sala Gran Vía', Z.mad, { status: 'blocked', blocked_reason: 'El dueño ha pedido no recibir más comerciales.' }),
    ],
    account_touch: [],
    // Personas de ejemplo (fase 2): Marta lleva Club Sol.
    crm_contact: [
      { id: '00000000-0000-4000-8000-0000000cc501', tenant_id: ENJOY, name: 'Marta Ruiz', email: null, phone: '+34 611 222 333', instagram: null, linkedin: null, city: 'Valencia',
        notes: null, fields: {}, tags: [], owner_id: REP, import_id: null, created_by: REP, created_at: ago(10), updated_at: ago(10) },
    ],
    crm_contact_account: [
      { tenant_id: ENJOY, contact_id: '00000000-0000-4000-8000-0000000cc501', account_id: '00000000-0000-4000-8000-0000000ac001', role: 'Gerente', created_at: ago(10) },
    ],
    crm_import: [],
    crm_activity: [
      { id: '00000000-0000-4000-8000-0000000ca001', tenant_id: ENJOY, account_id: '00000000-0000-4000-8000-0000000ac001', contact_id: '00000000-0000-4000-8000-0000000cc501',
        user_id: REP, channel: 'instagram', outcome: 'replied', note: 'Le interesa para los viernes; pide verlo en persona.', happened_at: ago(2), created_at: ago(2) },
    ],
    // Campos del CRM de ejemplo (docs/CRM_DINAMICO.md): los define cada espacio.
    crm_field: [
      { id: '00000000-0000-4000-8000-0000000cf001', tenant_id: ENJOY, key: 'tiene-pantalla', label: '¿Tiene pantalla?', type: 'checkbox', options: [], grp: 'El local',
        position: 0, help: 'Pantalla propia en la sala.', required: false, in_list: true, filterable: true, segments: [], archived_at: null, created_at: ago(30) },
      { id: '00000000-0000-4000-8000-0000000cf002', tenant_id: ENJOY, key: 'aforo', label: 'Aforo', type: 'number', options: [], grp: 'El local',
        position: 1, help: null, required: false, in_list: true, filterable: false, segments: [], archived_at: null, created_at: ago(30) },
    ],
    // Comisiones de ejemplo (docs/COMMISSIONS.md): «todo igual, 30 %».
    commission_plan: [{ id: '00000000-0000-4000-8000-0000000cc001', tenant_id: ENJOY, name: 'General', is_default: true, updated_at: ago(30),
      rules: [{ id: 'todo-igual', label: 'Todo igual: 30 %', when: {}, pay: { type: 'percent', bps: 3000 } }], referral: null }],
    commission_plan_member: [],
    revenue_event: [],
    commission_entry: [],
    payout: [],
    api_key: [],
    connector: [],
    member_conditions: [],
    member_conditions_history: [],
    dossier_view: demoVisits(f.dossier_item),
    team_ip: [],
    daily_digest_log: [],
    coupon: [
      { id: '00000000-0000-4000-8000-0000000cd001', tenant_id: ENJOY, code: 'LANZA30', label: '30 % de lanzamiento', kind: 'percent', value: 3000, max_uses: 20, valid_until: null, active: true, note: 'Para cerrar antes de fin de mes', created_at: ago(10) },
      { id: '00000000-0000-4000-8000-0000000cd002', tenant_id: ENJOY, code: 'MESGRATIS', label: 'Primer mes gratis', kind: 'free_months', value: 1, max_uses: null, valid_until: null, active: true, note: null, created_at: ago(10) },
    ],
    // Tarifas de ejemplo (docs/COMMISSIONS.md §Tarifas); los enlaces son de prueba de Stripe.
    price_option: [
      { id: '00000000-0000-4000-8000-0000000f0001', tenant_id: ENJOY, label: 'Boda completa', amount: 700, currency: 'EUR', period: 'event', payment_link: 'https://buy.stripe.com/test_boda', segment_id: '00000000-0000-4000-8000-0000005e0001', position: 1, active: true, kind: 'Boda', is_default: true },
      { id: '00000000-0000-4000-8000-0000000f0002', tenant_id: ENJOY, label: 'Local mediano', amount: 249, currency: 'EUR', period: 'month', payment_link: 'https://buy.stripe.com/test_mediano', segment_id: '00000000-0000-4000-8000-0000005e0002', position: 2, active: true, kind: 'Local', is_default: true },
      { id: '00000000-0000-4000-8000-0000000f0003', tenant_id: ENJOY, label: 'Evento suelto', amount: 150, currency: 'EUR', period: 'event', payment_link: null, segment_id: null, position: 3, active: true },
      // A medida: se ve con su aviso, no se elige (docs/COMMISSIONS.md §Tarifas).
      { id: '00000000-0000-4000-8000-0000000f0004', tenant_id: ENJOY, label: 'Festival +20.000', amount: 0, currency: 'EUR', period: 'event', payment_link: null, segment_id: null, position: 4, active: true, kind: 'Festival', quote_only: true, note: 'A medida · no se cotiza sin prueba de carga' },
    ],
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
