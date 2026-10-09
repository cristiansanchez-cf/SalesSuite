/**
 * Sesión de la consola.
 * - Supabase: @supabase/ssr con cookies httpOnly; el cliente lleva el JWT del usuario → RLS.
 * - Demo (sin Supabase): cookie con el id de un usuario de DEMO_USERS. Solo existe en modo demo.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { appMode } from '../mode';
import { demoDb } from '../data/store';
import { env } from '../env';

/** Umbral de cierres para ordenar por datos: 20 en producción; 0 en demo (sus 4 cierres de ejemplo enseñan la función). */
function minClosesFor(): number {
  const v = Number(env('EVIDENCE_MIN_CLOSES'));
  return Number.isFinite(v) && env('EVIDENCE_MIN_CLOSES') ? v : appMode() === 'supabase' ? 20 : 0;
}
import type { TenantContext } from '../types';
import type { AdminDb } from './db';
import type { AssetStore, Identity } from './db';
import { demoAdminDb, demoAssets, demoIdentity } from './db-demo';
import { supabaseAdminDb, supabaseAssets, supabaseIdentity } from './db-supabase';
import { resendMailer } from '../notify/mailer';
import { createAdminService, type AdminService } from './service';
import { createTenantAdminService, type TenantAdminService } from './tenant-service';
import type { PlaybookDb } from '../playbook/db';
import { demoPlaybookDb } from '../playbook/db-demo';
import { supabasePlaybookDb } from '../playbook/db-supabase';
import { createPlaybookService, type PlaybookService } from '../playbook/service';
import type { AdminSession } from './types';
import { scopeAdminDb, scopeEvidenceDb, scopePlaybookDb } from '../partner/scope';
import type { EvidenceDb } from '../evidence/db';
import { demoEvidenceDb } from '../evidence/db-demo';
import { supabaseEvidenceDb } from '../evidence/db-supabase';
import { createEvidenceService, type EvidenceService } from '../evidence/service';
import type { AccountsDb } from '../accounts/db';
import { demoAccountsDb } from '../accounts/db-demo';
import { supabaseAccountsDb } from '../accounts/db-supabase';
import { createAccountsService, emptyAccountsDb, type AccountsService } from '../accounts/service';
import { createCrmService, emptyCrmDb, type CrmService } from '../crm/service';
import type { CrmDb } from '../crm/db';
import { demoCrmDb } from '../crm/db-demo';
import { supabaseCrmDb } from '../crm/db-supabase';
import type { CommissionsDb } from '../commissions/db';
import { demoCommissionsDb } from '../commissions/db-demo';
import { supabaseCommissionsDb } from '../commissions/db-supabase';
import { createCommissionsService, emptyCommissionsDb, type CommissionsService } from '../commissions/service';
import type { NotifyDb } from '../notify/db';
import { demoNotifyDb } from '../notify/db-demo';
import { supabaseNotifyDb } from '../notify/db-supabase';
import { createNotifyService, emptyNotifyDb, type NotifyService } from '../notify/service';
import { createAnalyticsService, type AnalyticsService } from '../analytics/service';
import { emptyAnalyticsDb, type AnalyticsDb } from '../analytics/db';
import { demoAnalyticsDb } from '../analytics/db-demo';
import { supabaseAnalyticsDb } from '../analytics/db-supabase';
import type { OrgDb } from '../org/db';
import { demoOrgDb } from '../org/db-demo';
import { supabaseOrgDb } from '../org/db-supabase';
import { createOrgService, type OrgService } from '../org/service';
import { emptyOrgDb } from '../org/empty';
import { demoContentI18nDb, emptyContentI18nDb, supabaseContentI18nDb, type ContentI18nDb } from '../i18n/content-db';
import { translateAdminDb, translateEvidenceDb, translatePlaybookDb } from '../i18n/content-overlay';

export const DEMO_COOKIE = 'ss_demo_user';
/** Demo: espacio elegido en «Cambiar de espacio» (en producción el espacio lo decide el dominio). */
export const DEMO_TENANT_COOKIE = 'ss_demo_tenant';

export interface RequestLike {
  request: Request;
  cookies: AstroCookies;
  url: URL;
}

export interface AdminContext {
  mode: 'supabase' | 'demo';
  session: AdminSession;
  /** Idiomas a los que el espacio traduce su contenido, y sus traducciones (docs/I18N.md §Contenido). */
  content: ContentI18nDb;
  service: AdminService;
  /** Equipo, catálogo y marca (cada método exige rol admin). */
  tenantAdmin: TenantAdminService;
  /** Playbook de ventas (aprender, aportar; editar si admin). */
  playbook: PlaybookService;
  /** Qué ha funcionado: cierres documentados, situaciones y recomendaciones. */
  evidence: EvidenceService;
  /** Avisos de esta persona (campana, página y preferencia de email). */
  notifications: NotifyService;
  /** Cuentas del CRM y territorio (docs/ACCOUNTS.md). */
  accounts: AccountsService;
  crm: CrmService;
  /** Comisiones (docs/COMMISSIONS.md). */
  commissions: CommissionsService;
  /** Organigrama: delegaciones, gerentes y (superadmin) la plataforma (docs/ORG.md). */
  org: OrgService;
  /** Analítica de dossiers: aperturas, tiempo y secciones (docs/ANALYTICS.md). */
  analytics: AnalyticsService;
  /** Cliente Supabase con la sesión del usuario (solo modo supabase). */
  supabase: SupabaseClient | null;
}

export type AuthResult =
  | { kind: 'ok'; admin: AdminContext }
  | { kind: 'anonymous' }
  | { kind: 'forbidden'; email: string; reason?: 'partner-expired'; expiresAt?: string | null };

export const authMode = (): 'supabase' | 'demo' => (appMode() === 'supabase' ? 'supabase' : 'demo');

export const cookieBase = (url: URL) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: url.protocol === 'https:' });

export function supabaseServerClient(ctx: RequestLike): SupabaseClient {
  return createServerClient(env('PUBLIC_SUPABASE_URL')!, env('PUBLIC_SUPABASE_ANON_KEY')!, {
    cookies: {
      getAll: () => parseCookieHeader(ctx.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (list) => list.forEach(({ name, value, options }) => ctx.cookies.set(name, value, { ...options, ...cookieBase(ctx.url) })),
    },
  });
}

export interface Deps {
  identity: Identity | null; assets: AssetStore; supabase: SupabaseClient | null; playbookDb: PlaybookDb; evidenceDb: EvidenceDb;
  /** AdminDb para colaboradores (en Supabase: catálogo e items por RPC, sin tarifa). */
  partnerDb: () => AdminDb;
  /** Avisos (opcional: los contratos de otros módulos no los necesitan). */
  notifyDb?: NotifyDb;
  /** Cuentas (opcional, igual que los avisos). Recibe el usuario: en demo replica auth.uid(). */
  accountsDb?: (userId: string) => AccountsDb;
  crmDb?: (userId: string) => CrmDb;
  /** Comisiones (opcional). Recibe el usuario: en demo replica auth.uid(). */
  commissionsDb?: (userId: string) => CommissionsDb;
  /** Visitas a dossiers (opcional). */
  analyticsDb?: AnalyticsDb;
  /** Organigrama y superadmin (opcional). */
  orgDb?: OrgDb;
  /** Contenido traducido (opcional: sin él, todo en el idioma original). */
  contentDb?: ContentI18nDb;
}

/** Rol → contexto de consola. Exportado para los tests de contrato (mismo cableado que producción). */
export async function buildAdminContext(baseDb: AdminDb, user: { id: string; email: string; name: string | null }, tenant: TenantContext, mode: AdminContext['mode'], deps: Deps): Promise<AuthResult> {
  const org = deps.orgDb ?? emptyOrgDb;
  const [member, superadmin] = await Promise.all([baseDb.membershipRole(user.id, tenant.id), org.isSuperadmin(user.id).catch(() => false)]);
  // El superadmin entra en cualquier espacio como admin (aunque no sea miembro).
  const role = superadmin ? 'admin' : member;
  if (!role) return { kind: 'forbidden', email: user.email };
  const session: AdminSession = { userId: user.id, email: user.email, displayName: user.name, tenantId: tenant.id, role, superadmin };
  if (role === 'lead' || role === 'rep') {
    const byUser = await org.memberDelegations(tenant.id).catch(() => new Map<string, string>());
    session.delegationId = byUser.get(user.id) ?? null;
    // Gerente de delegación: ve a los suyos (y a sí mismo). El global (sin delegación) ve todo.
    if (role === 'lead' && session.delegationId) {
      session.team = [...byUser].filter(([, d]) => d === session.delegationId).map(([u]) => u).concat(user.id);
      session.delegationName = (await org.listDelegations(tenant.id).catch(() => [])).find((d) => d.id === session.delegationId)?.name ?? null;
    }
  }
  let db = baseDb;
  let playbookDb = deps.playbookDb;
  let evidenceDb = deps.evidenceDb;
  if (role === 'partner') {
    const profile = await baseDb.getPartnerProfile(tenant.id, user.id);
    if (!profile) return { kind: 'forbidden', email: user.email };
    if (profile.expiresAt && new Date(profile.expiresAt).getTime() <= Date.now()) {
      return { kind: 'forbidden', email: user.email, reason: 'partner-expired', expiresAt: profile.expiresAt };
    }
    const pdb = deps.partnerDb();
    const accounts = (await pdb.listPartnerAccounts(tenant.id, user.id)).sort((a, b) => a.position - b.position);
    const scoped = { ...session, partner: { ...profile, accounts } };
    session.partner = scoped.partner;
    db = scopeAdminDb(pdb, scoped);
    playbookDb = scopePlaybookDb(deps.playbookDb, scoped);
    evidenceDb = scopeEvidenceDb(deps.evidenceDb, scoped);
  }
  // Lo que se lee del contenido lleva su traducción encima cuando la petición tiene idioma de contenido (middleware).
  db = translateAdminDb(db);
  playbookDb = translatePlaybookDb(playbookDb);
  evidenceDb = translateEvidenceDb(evidenceDb);
  const service = createAdminService(db, session, { defaultLocale: tenant.defaultLocale, assets: deps.assets });
  return {
    kind: 'ok',
    admin: {
      mode, session, supabase: deps.supabase, service, content: deps.contentDb ?? emptyContentI18nDb,
      tenantAdmin: createTenantAdminService(db, session, { identity: deps.identity, assets: deps.assets }),
      playbook: createPlaybookService(playbookDb, db, session, { admin: service, evidence: evidenceDb, minCloses: minClosesFor() }),
      evidence: createEvidenceService(evidenceDb, playbookDb, db, session, { admin: service, minCloses: minClosesFor() }),
      notifications: createNotifyService(deps.notifyDb ?? emptyNotifyDb, session),
      accounts: createAccountsService(deps.accountsDb?.(user.id) ?? emptyAccountsDb, db, session),
      crm: createCrmService(deps.crmDb?.(user.id) ?? emptyCrmDb, deps.accountsDb?.(user.id) ?? emptyAccountsDb, db, session),
      commissions: createCommissionsService(deps.commissionsDb?.(user.id) ?? emptyCommissionsDb,
        { admin: db, accounts: deps.accountsDb?.(user.id) ?? emptyAccountsDb }, session),
      analytics: createAnalyticsService(deps.analyticsDb ?? emptyAnalyticsDb, service, session),
      org: createOrgService(org, db, session, { zones: async () => (await (deps.accountsDb?.(user.id) ?? emptyAccountsDb).listZones(tenant.id)).map((z) => ({ id: z.id, name: z.name, parentId: z.parentId })) }),
    },
  };
}

/** Service role SOLO para invitar usuarios. Si falta, invitar devuelve un 503 explicativo. */
/** Último código pedido por email (un envío cada 45 s por servidor; ver login.astro). */
export const codeSentAt: Map<string, number> = ((globalThis as { __codeSentAt?: Map<string, number> }).__codeSentAt ??= new Map());

export function serviceIdentity(): Identity | null {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const mail = env('RESEND_API_KEY') && env('RESEND_FROM') ? resendMailer(env('RESEND_API_KEY')!, env('RESEND_FROM')!) : null;
  return key ? supabaseIdentity(env('PUBLIC_SUPABASE_URL')!, key, mail) : null;
}

export async function authenticate(ctx: RequestLike, tenant: TenantContext): Promise<AuthResult> {
  if (authMode() === 'demo') {
    const u = demoDb().users.find((x) => x.id === ctx.cookies.get(DEMO_COOKIE)?.value);
    if (!u) return { kind: 'anonymous' };
    return buildAdminContext(demoAdminDb(), { id: u.id, email: u.email, name: u.display_name || null }, tenant, 'demo',
      { identity: demoIdentity(), assets: demoAssets, supabase: null, playbookDb: demoPlaybookDb(), evidenceDb: demoEvidenceDb(), partnerDb: () => demoAdminDb(), notifyDb: demoNotifyDb(), accountsDb: demoAccountsDb, crmDb: demoCrmDb, commissionsDb: demoCommissionsDb, analyticsDb: demoAnalyticsDb(), orgDb: demoOrgDb(), contentDb: demoContentI18nDb() });
  }
  const sb = supabaseServerClient(ctx);
  // getUser() valida el JWT contra Supabase Auth (getSession() solo lee la cookie).
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { kind: 'anonymous' };
  return buildAdminContext(supabaseAdminDb(sb), { id: data.user.id, email: data.user.email ?? '', name: (data.user.user_metadata?.name as string) ?? null }, tenant, 'supabase',
    { identity: serviceIdentity(), assets: supabaseAssets(sb), supabase: sb, playbookDb: supabasePlaybookDb(sb), evidenceDb: supabaseEvidenceDb(sb), partnerDb: () => supabaseAdminDb(sb, { partner: true }), notifyDb: supabaseNotifyDb(sb), accountsDb: () => supabaseAccountsDb(sb), crmDb: () => supabaseCrmDb(sb), commissionsDb: () => supabaseCommissionsDb(sb), analyticsDb: supabaseAnalyticsDb(sb), orgDb: supabaseOrgDb(sb), contentDb: supabaseContentI18nDb(sb) });
}

export function demoLogin(ctx: RequestLike, userId: string): boolean {
  if (authMode() !== 'demo' || !demoDb().users.some((u) => u.id === userId)) return false;
  ctx.cookies.set(DEMO_COOKIE, userId, { ...cookieBase(ctx.url), maxAge: 60 * 60 * 8 });
  return true;
}

export async function logout(ctx: RequestLike): Promise<void> {
  ctx.cookies.delete(DEMO_COOKIE, { path: '/' });
  if (authMode() === 'supabase') await supabaseServerClient(ctx).auth.signOut();
}

/** Solo rutas internas de la consola (evita open redirect). */
export function safeNext(raw: string | null | undefined): string {
  return raw && /^\/admin(\/[\w\-/.]*)?(\?[\w\-=&%.]*)?$/.test(raw) && !raw.includes('//') ? raw : '/admin';
}
