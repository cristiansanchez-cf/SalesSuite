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
}

export interface ModuleBaseProps {
  ctx: ModuleContext;
}
