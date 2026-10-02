import type { Brand } from './brand';
import type { ThemeTokens } from './theme';

export type PriceMode = 'none' | 'total' | 'per_module';
export type DossierStatus = 'draft' | 'published' | 'archived';

/** Tenant tal y como lo ve el renderer/middleware (solo campos seguros). */
export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  defaultLocale: string;
  themeTokens: ThemeTokens;
  brand: Brand;
}

/** Item de dossier ya resuelto contra su module_version fijada. */
export interface RenderItem {
  id: string;
  position: number;
  blockType: string;
  moduleKey: string;
  defaultProps: Record<string, unknown>;
  propOverrides: Record<string, unknown>;
  defaultPrice: number | null;
  priceOverride: number | null;
  currency: string;
}

/** Payload público del dossier (lo que devuelve el RPC token-gated). */
export interface PublicDossier {
  id: string;
  tenantId: string;
  title: string;
  prospectName: string | null;
  prospectCompany: string | null;
  locale: string;
  priceMode: PriceMode;
  totalPrice: number | null;
  currency: string;
  themeOverride: ThemeTokens | null;
  /** Solo items visibles, ordenados por position. */
  items: RenderItem[];
}
