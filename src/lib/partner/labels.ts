import type { PricePolicy } from '../admin/types';

/** Etiquetas de política de precio (cliente y servidor). */
export const PRICE_POLICY_LABEL: Record<PricePolicy, string> = {
  hidden: 'Sin precios (los gestiona la empresa)',
  list: 'Precio de tarifa',
  adjusted: 'Precio especial',
};

export const PRICE_POLICY_HELP: Record<PricePolicy, string> = {
  hidden: 'La propuesta se envía sin precios: el colaborador presenta y la empresa negocia.',
  list: 'Cada módulo muestra su precio de catálogo.',
  adjusted: 'Precio de catálogo con un ajuste (descuento o recargo) solo para esta cuenta. El colaborador no ve la tarifa.',
};
