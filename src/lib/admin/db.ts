import type {
  CatalogVersion, PriceOption, DossierRecord, ItemRecord, LinkRecord, MemberRecord, ModuleRecord, ModuleVersionRecord, PartnerAccount, PartnerProfile, Role, TenantSettings,
} from './types';
import type { DossierPatch } from './ops';

export interface NewDossier {
  tenantId: string;
  authorId: string;
  title: string;
  prospectName: string | null;
  prospectCompany: string | null;
  locale: string;
  priceMode: DossierRecord['priceMode'];
  totalPrice: number | null;
  currency: string;
  partnerAccountId?: string | null;
  accountId?: string | null;
}

export interface NewItem {
  dossierId: string;
  moduleVersionId: string;
  position: number;
  visible?: boolean;
  priceOverride?: number | null;
  propOverrides?: Record<string, unknown>;
}

export type ItemPatch = Partial<Pick<ItemRecord, 'position' | 'visible' | 'priceOverride' | 'propOverrides' | 'moduleVersionId'>>;
export type DossierDbPatch = DossierPatch & {
  status?: DossierRecord['status'];
  publishedAt?: string | null;
  outcome?: DossierRecord['outcome'];
  outcomeNote?: string | null;
  outcomeAt?: string | null;
  segmentId?: string | null;
  priceOptionId?: string | null;
  clientMedia?: import('../types').ClientMedia;
  nextStep?: string | null;
  nextStepAt?: string | null;
  situation?: import('../evidence/types').Situation;
  accountId?: string | null;
  couponId?: string | null;
};

export type ContactInput = Omit<import('../playbook/market').DossierContact, 'id' | 'dossierId' | 'position'>;

/**
 * Acceso a datos de la consola, ligado a UN usuario.
 * - Supabase: cliente con la sesión del usuario → RLS aplica de verdad.
 * - Demo: memoria. Los permisos los aplica el servicio (que también corre sobre Supabase).
 * Los métodos de escritura devuelven false/null si no se afectó ninguna fila (p. ej. RLS lo impidió).
 */
export interface AdminDb {
  membershipRole(userId: string, tenantId: string): Promise<Role | null>;
  userNames(ids: string[]): Promise<Map<string, string>>;

  listDossiers(tenantId: string): Promise<DossierRecord[]>;
  getDossier(id: string): Promise<DossierRecord | null>;
  insertDossier(row: NewDossier): Promise<DossierRecord>;
  updateDossier(id: string, patch: DossierDbPatch): Promise<DossierRecord | null>;
  deleteDossier(id: string): Promise<boolean>;

  listItems(dossierIds: string[]): Promise<ItemRecord[]>;
  insertItem(row: NewItem): Promise<string>;
  updateItem(id: string, patch: ItemPatch): Promise<boolean>;
  updateItemPositions(updates: Array<{ id: string; position: number }>): Promise<void>;
  deleteItem(id: string): Promise<boolean>;

  listCatalog(tenantId: string): Promise<CatalogVersion[]>;
  /** Tarifas (migración 20261022; sin ella, lista vacía). */
  listPriceOptions(tenantId: string): Promise<PriceOption[]>;
  savePriceOption(tenantId: string, row: Omit<PriceOption, 'id'>, id?: string): Promise<string>;

  listLinks(dossierIds: string[]): Promise<LinkRecord[]>;
  insertLink(dossierId: string, expiresAt: string | null): Promise<LinkRecord>;
  revokeLink(id: string): Promise<boolean>;

  // ---- cuenta del dossier
  listContacts(dossierIds: string[]): Promise<import('../playbook/market').DossierContact[]>;
  insertContact(dossierId: string, row: ContactInput & { position: number }): Promise<string>;
  updateContact(id: string, patch: Partial<ContactInput>): Promise<boolean>;
  deleteContact(id: string): Promise<boolean>;
  /** Existencia en el tenant (la demo no tiene FKs; en Supabase además lo garantizan las FKs compuestas). */
  segmentExists(tenantId: string, segmentId: string): Promise<boolean>;
  personaExists(tenantId: string, personaId: string): Promise<boolean>;

  // ---- gestión del tenant (la RLS exige admin en Supabase; el servicio también)
  getTenant(id: string): Promise<TenantSettings | null>;
  updateTenant(id: string, patch: Partial<Pick<TenantSettings, 'name' | 'defaultLocale' | 'themeTokens' | 'brand'>>): Promise<boolean>;

  listMembers(tenantId: string): Promise<MemberRecord[]>;
  /** inviter: quién invita (en Supabase lo fija el trigger con la sesión). */
  addMember(tenantId: string, userId: string, role: Role, inviter?: string): Promise<boolean>;
  setMemberRole(tenantId: string, userId: string, role: Role): Promise<boolean>;
  removeMember(tenantId: string, userId: string): Promise<boolean>;

  listModules(tenantId: string): Promise<ModuleRecord[]>;
  listModuleVersions(tenantId: string): Promise<ModuleVersionRecord[]>;
  /** versionId → nº de items de dossier que la fijan. */
  versionUsage(tenantId: string): Promise<Map<string, number>>;
  insertModule(row: Omit<ModuleRecord, 'id'>): Promise<string>;
  updateModule(id: string, patch: Partial<Pick<ModuleRecord, 'name' | 'description' | 'isCatalog'>>): Promise<boolean>;
  insertModuleVersion(row: Omit<ModuleVersionRecord, 'id'>): Promise<string>;
  updateModuleVersion(id: string, patch: Partial<Pick<ModuleVersionRecord, 'defaultProps' | 'defaultPrice' | 'currency' | 'status'>>): Promise<boolean>;

  // ---- colaboradores (escritura: admins; el propio colaborador solo lee lo suyo)
  getPartnerProfile(tenantId: string, userId: string): Promise<PartnerProfile | null>;
  listPartnerProfiles(tenantId: string): Promise<PartnerProfile[]>;
  upsertPartnerProfile(row: PartnerProfile): Promise<boolean>;
  /** userId omitido = todas las del tenant (admin). */
  listPartnerAccounts(tenantId: string, userId?: string): Promise<PartnerAccount[]>;
  /** Inserta (sin id) o actualiza (con id). Devuelve el id. */
  savePartnerAccount(row: Omit<PartnerAccount, 'id'> & { id?: string }): Promise<string>;
  deletePartnerAccount(id: string): Promise<boolean>;
  /** Un colaborador con permiso invita a otro (hereda módulos y caducidad). */
  partnerInvitePartner(tenantId: string, inviterId: string, userId: string): Promise<void>;
}

/**
 * Identidad (Auth). Separado de AdminDb porque invitar usuarios requiere privilegios de plataforma
 * (service role en Supabase) que NUNCA se usan para leer/escribir datos del tenant.
 */
export interface Identity {
  /** Devuelve el usuario existente o lo invita por email (sin crear membership). */
  findOrInvite(email: string, opts: { redirectTo: string }): Promise<{ userId: string; invited: boolean }>;
}

/** Subida de assets (logos, fuentes, imágenes) al almacenamiento del tenant. */
export interface AssetStore {
  upload(tenantId: string, file: { name: string; type: string; bytes: Uint8Array }, kind: string): Promise<{ url: string }>;
  /**
   * Subida directa del navegador a Storage (vídeos de hasta 30 MB: no caben por el servidor de Vercel).
   * Devuelve dónde subir y la URL pública que tendrá. La RLS de Storage decide si esta persona puede.
   */
  signUpload?(tenantId: string, path: string, type: string): Promise<{ uploadUrl: string; publicUrl: string; headers?: Record<string, string> }>;
  /** Prefijo público de los archivos del espacio (para aceptar solo URLs nuestras al adjuntar). */
  publicPrefix?(tenantId: string): string;
}
