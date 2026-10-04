import type { ResolvedPrice } from '~/lib/pricing';
import type { PriceMode } from '~/lib/types';

/** Contexto común que el renderer pasa a TODOS los módulos (además de sus props propias). */
export interface ModuleContext {
  itemId: string;
  locale: string;
  prospectName: string | null;
  prospectCompany: string | null;
  priceMode: PriceMode;
  /** Precio de este item (solo per_module). */
  price: ResolvedPrice | null;
  /** Total del dossier (total o suma per_module). */
  total: ResolvedPrice | null;
  /** Logo, fotos y vídeo del cliente (Personalizar). Los módulos que sepan usarlos los ponen en lugar de los de ejemplo. */
  media?: import('~/lib/types').ClientMedia;
  /** «Pagar»: enlace de pago de la tarifa elegida, ya con la propuesta y el cupón (null = sin botón). */
  payUrl?: string | null;
  /** Periodo de la tarifa elegida: once, event, month, year. */
  pricePeriod?: string | null;
}

export interface ModuleBaseProps {
  ctx: ModuleContext;
}
