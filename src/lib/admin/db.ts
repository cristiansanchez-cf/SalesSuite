import type { CatalogVersion, DossierRecord, ItemRecord, LinkRecord, Role } from './types';
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
export type DossierDbPatch = DossierPatch & { status?: DossierRecord['status']; publishedAt?: string | null };

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
}
