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
/** Lo personalizado del cliente en una propuesta (docs/PERSONALIZE.md). */
export interface ClientMedia {
  logo?: string | null; photos?: string[]; video?: string | null;
  /** Lo que el cliente tiene (lo que no, no se enseña). Sin definir = todo. */
  features?: { songs?: boolean; photos?: boolean; messages?: boolean; album?: boolean };
  /** Estilo musical de los ejemplos (clave de MUSIC_STYLES). */
  musicStyle?: string | null;
  /** Cómo se ve: diapositivas horizontales (por defecto, como una presentación) o todo hacia abajo. */
  layout?: 'slides' | 'scroll';
}

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
  /** Cupón aplicado (copia guardada al aplicarlo). */
  discount?: Discount | null;
  /** Logo, fotos y vídeo del cliente (los usa la pantalla en vivo). */
  media?: ClientMedia;
  /** «Pagar»: enlace de pago de la tarifa con la propuesta y el cupón ya puestos (docs/COMMISSIONS.md §Stripe). */
  payUrl?: string | null;
  /** Periodo de la tarifa elegida (para «/ mes», «/ evento» en la tarjeta de precio). */
  pricePeriod?: string | null;
  /** Solo items visibles, ordenados por position. */
  items: RenderItem[];
}

/** Cupón de descuento (docs/COMMISSIONS.md §6). percent: puntos básicos · fixed: céntimos · free_months: meses. */
export interface Discount { code: string; label: string; kind: 'percent' | 'fixed' | 'free_months'; value: number }
