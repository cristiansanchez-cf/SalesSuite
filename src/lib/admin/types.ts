import type { ResolvedPrice } from '../pricing';
import type { DossierStatus, PriceMode } from '../types';

export type Role = 'admin' | 'rep';

/** Usuario autenticado + su rol en el tenant del Host. */
export interface AdminSession {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  role: Role;
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
  /** Problemas que impiden publicar. */
  publishBlockers: string[];
}
