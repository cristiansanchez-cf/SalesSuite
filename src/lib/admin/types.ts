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
  /** Superadmin de la plataforma (docs/ORG.md): entra en todos los espacios como admin. */
  superadmin?: boolean;
  /** Su delegación (organigrama). Un gerente con delegación solo ve a su equipo. */
  delegationId?: string | null;
  /** Su nombre, para enseñarlo («Gerente · Levante»). */
  delegationName?: string | null;
  /** Gerente de delegación: las personas que ve (él incluido). null/undefined = todo el espacio. */
  team?: string[] | null;
  /** Solo si role === 'partner': su perfil y sus cuentas. */
  partner?: PartnerProfile & { accounts: PartnerAccount[] };
}

export interface DossierRecord {
  /** Logo, fotos y vídeo del cliente (migración 20261024). */
  clientMedia?: import('../types').ClientMedia;
  /** Lo que eligió el comercial al montar la propuesta del sector (modo y respuestas). Privado. */
  preset?: { mode?: 'full' | 'visual'; answers?: string[] };
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
  /** Cuándo se ganó o se perdió. */
  outcomeAt?: string | null;
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
  /** «Prueba»: las aperturas del enlace no cuentan ni avisan (para enviártelo a ti o a un compañero). «Real»: cuentan. */
  viewMode?: 'test' | 'live';
  /** Tarifa elegida (la fija la empresa); el precio sale de ella. */
  priceOptionId?: string | null;
}

export type PricePeriod = 'once' | 'event' | 'month' | 'year';
/** Tarifa que configura el admin: lo único que puede elegir un comercial como precio. */
export interface PriceOption {
  id: string;
  label: string;
  amount: number;
  currency: string;
  period: PricePeriod;
  /** Enlace de pago de Stripe (Payment Link). */
  paymentLink: string | null;
  segmentId: string | null;
  /** Tipo («Charanga u orquesta», «Sala de conciertos»): primer paso al elegir precio. */
  kind?: string | null;
  /** La más típica de su tipo: sale marcada al elegir el tipo. */
  isDefault?: boolean;
  /** A medida: se ve, con su aviso, pero no se elige en una propuesta. */
  quoteOnly?: boolean;
  /** Aviso que acompaña a la tarifa («no se cotiza sin prueba de carga»). */
  note?: string | null;
  position: number;
  active: boolean;
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

/** Combinación guardada («hazme un José María»): tipo, ángulo, preguntas, modo y tarifa con nombre. */
export interface ProposalTemplate {
  id: string; segmentId: string; name: string; mode: 'full' | 'visual'; answers: string[]; priceOptionId: string | null;
  createdBy: string | null; createdAt: string | null;
}

export interface BuilderState {
  dossier: DossierRecord;
  items: BuilderItem[];
  /** Combinaciones guardadas del sector de la propuesta. */
  templates?: Array<ProposalTemplate & { mine: boolean }>;
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
  /** Tarifas activas (las del sector de la propuesta, primero). */
  priceOptions: PriceOption[];
  /** Enlace de pago de la tarifa elegida, ya con la propuesta (vendedor) y el cupón. */
  payment: { url: string; label: string } | null;
  /** Solo admins escriben un precio a medida. */
  customPrices: boolean;
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
  /** Recorrido del producto para Aprende (jsonb; se valida al leer con tourOf). */
  tour?: unknown;
}
