import type { ResolvedPrice } from '../pricing';
import type { DossierStatus, PriceMode } from '../types';

/** admin y rep = equipo interno; partner = colaborador puntual invitado (docs/PARTNERS.md). */
export type Role = 'admin' | 'lead' | 'rep' | 'partner';
export type TeamRole = Exclude<Role, 'partner'>;

/** Cómo se cotiza una cuenta de colaborador: lo decide el admin, nunca el colaborador. */
export type PricePolicy = 'hidden' | 'list' | 'adjusted';

export interface PartnerProfile {
  tenantId: string;
  userId: string;
  /** Módulos que puede ver, aprender y vender. */
  moduleIds: string[];
  /** ¿Ve los trucos que comparte el equipo interno? */
  seeTeamTips: boolean;
  /** Guía solo para él (markdown). */
  welcomeNote: string | null;
  /** null = sin caducidad. */
  expiresAt: string | null;
  /** Puede invitar a otros colaboradores (red de referidos). */
  canInvite: boolean;
}

/** Cuenta (local, centro…) que el admin asigna a un colaborador, con su política de precio. */
export interface PartnerAccount {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  segmentId: string | null;
  pricePolicy: PricePolicy;
  /** Solo con 'adjusted': −90 … +200 sobre la tarifa. */
  priceAdjustPct: number;
  /** Indicaciones del admin para esta cuenta (solo las ve el colaborador y el equipo admin). */
  notes: string | null;
  position: number;
}

/** Usuario autenticado + su rol en el tenant del Host. */
export interface AdminSession {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  role: Role;
  /** Solo si role === 'partner': su perfil y sus cuentas. */
  partner?: PartnerProfile & { accounts: PartnerAccount[] };
}

export interface DossierRecord {
  id: string;
  tenantId: string;
  authorId: string | null;
  title: string;
  prospectName: string | null;
  prospectCompany: string | null;
  status: DossierStatus;
  locale: string;
  priceMode: PriceMode;
  totalPrice: number | null;
  currency: string;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Resultado comercial (para medir qué jugadas funcionan). */
  outcome: 'open' | 'won' | 'lost';
  outcomeNote: string | null;
  /** Sector del prospecto (mapa de mercado). */
  segmentId: string | null;
  /** Seguimiento: próximo paso acordado y cuándo. */
  nextStep: string | null;
  nextStepAt: string | null;
  /** Cuenta de colaborador a la que pertenece (fija la política de precio). */
  partnerAccountId: string | null;
  /** Situación de la cuenta según las facetas del tenant (región, rasgos…). */
  situation: import('../evidence/types').Situation;
  /** Cuenta del CRM (docs/ACCOUNTS.md) y si la venta genera comisión (lo calcula la base de datos al ganarla). */
  accountId: string | null;
  accountEligibility: import('../accounts/types').Eligibility | null;
  accountDecision: import('../accounts/types').AccountDecision | null;
  accountDecidedAt: string | null;
  /** Cupón aplicado y su copia (docs/COMMISSIONS.md §6). */
  couponId: string | null;
  discount: import('../types').Discount | null;
}

export interface DossierSummary extends DossierRecord {
  authorName: string | null;
  itemCount: number;
  activeLinks: number;
}

/** Item con su versión fijada y la identidad del módulo. */
export interface ItemRecord {
  id: string;
  dossierId: string;
  position: number;
  visible: boolean;
  priceOverride: number | null;
  propOverrides: Record<string, unknown>;
  moduleVersionId: string;
  version: number;
  defaultProps: Record<string, unknown>;
  defaultPrice: number | null;
  currency: string;
  moduleId: string;
  moduleKey: string;
  moduleName: string;
  blockType: string;
}

/** Versión publicada de un módulo del catálogo. */
export interface CatalogVersion {
  moduleId: string;
  moduleKey: string;
  moduleName: string;
  description: string | null;
  blockType: string;
  versionId: string;
  version: number;
  defaultPrice: number | null;
  currency: string;
}

export interface LinkRecord {
  id: string;
  dossierId: string;
  token: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface BuilderItem extends ItemRecord {
  /** Última versión publicada del módulo si es más nueva que la fijada. */
  upgradeTo: { versionId: string; version: number } | null;
  /** Precio efectivo mostrado (solo per_module). */
  price: ResolvedPrice | null;
  /** Error de props si el item no se renderizaría. */
  error: string | null;
}

export interface BuilderState {
  dossier: DossierRecord;
  items: BuilderItem[];
  /** Una entrada por módulo: su última versión publicada. */
  catalog: CatalogVersion[];
  links: Array<LinkRecord & { state: 'active' | 'revoked' | 'expired' }>;
  total: ResolvedPrice | null;
  canEdit: boolean;
  /** Mapa de poder de la cuenta. */
  contacts: import('../playbook/market').DossierContact[];
  /** Problemas que impiden publicar. */
  publishBlockers: string[];
  /** Dossier de una cuenta de colaborador: quién, qué cuenta y cómo se cotiza. */
  partnerAccount: { id: string; name: string; pricePolicy: PricePolicy; priceAdjustPct: number | null; notes: string | null } | null;
  /** true para el colaborador: no ve la tarifa ni toca precios. */
  pricesLocked: boolean;
}

// ---------------------------------------------------------------- gestión del tenant (admins)

export interface MemberRecord {
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  /** Quién le invitó (trazabilidad de la red de colaboradores). */
  invitedBy: string | null;
  joinedAt: string | null;
  /** Para que los compañeros de zona puedan llamarle o escribirle por WhatsApp. */
  phone?: string | null;
}

export interface PartnerView extends MemberRecord {
  profile: PartnerProfile | null;
  accounts: PartnerAccount[];
  dossierCount: number;
  expired: boolean;
}

export interface ModuleRecord {
  id: string;
  tenantId: string;
  key: string;
  blockType: string;
  name: string;
  description: string | null;
  isCatalog: boolean;
}

export type VersionStatus = 'draft' | 'published' | 'archived';

export interface ModuleVersionRecord {
  id: string;
  moduleId: string;
  version: number;
  status: VersionStatus;
  defaultProps: Record<string, unknown>;
  defaultPrice: number | null;
  currency: string;
}

export interface CatalogModuleView extends ModuleRecord {
  blockLabel: string;
  versions: Array<ModuleVersionRecord & { usage: number; error: string | null }>;
}

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  defaultLocale: string;
  themeTokens: unknown;
  brand: unknown;
}
