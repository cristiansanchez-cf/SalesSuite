import type {
  CatalogVersion, DossierRecord, ItemRecord, LinkRecord, MemberRecord, ModuleRecord, ModuleVersionRecord, Role, TenantSettings,
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
};

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

  listLinks(dossierIds: string[]): Promise<LinkRecord[]>;
  insertLink(dossierId: string, expiresAt: string | null): Promise<LinkRecord>;
  revokeLink(id: string): Promise<boolean>;

  // ---- gestión del tenant (la RLS exige admin en Supabase; el servicio también)
  getTenant(id: string): Promise<TenantSettings | null>;
  updateTenant(id: string, patch: Partial<Pick<TenantSettings, 'name' | 'defaultLocale' | 'themeTokens' | 'brand'>>): Promise<boolean>;

  listMembers(tenantId: string): Promise<MemberRecord[]>;
  addMember(tenantId: string, userId: string, role: Role): Promise<boolean>;
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
}
