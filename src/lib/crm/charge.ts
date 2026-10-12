/**
 * «Generar pago» desde la ficha (docs/CRM_DINAMICO.md §35). Lógica pura: qué tarifa sale marcada y cuánto queda con el
 * cupón. El precio lo fija la empresa (tarifas del admin); el comercial elige tarifa (la sugerida o una superior) y,
 * si toca, un cupón. Un precio a medida solo lo pone un admin, con su propio enlace de Stripe.
 */
import type { PriceOption } from '../admin/types';
import type { Coupon } from '../commissions/types';
import { SIZES } from './priority';

export type Size = (typeof SIZES)[number];
/** Tarifas que se pueden cobrar con un enlace: activas, no «a medida» y con su enlace de pago. */
export const chargeable = (os: PriceOption[]) => os.filter((o) => o.active && !o.quoteOnly && !!o.paymentLink);

/**
 * La tarifa que sale marcada: la de su tamaño (si la tarifa lo dice) y de su sector; si no hay de su tamaño, la más
 * típica (marcada por el admin) de su sector; si no, la primera. Entre iguales, la más típica y luego el orden del admin.
 */
export function suggestTariff(os: PriceOption[], x: { size?: string | null; segmentId?: string | null }): PriceOption | null {
  const list = chargeable(os);
  if (!list.length) return null;
  const score = (o: PriceOption) =>
    (x.size && o.size === x.size ? 8 : 0) + (x.segmentId && o.segmentId === x.segmentId ? 4 : 0) + (o.isDefault ? 2 : 0) + (o.size && x.size && o.size !== x.size ? -8 : 0);
  return [...list].sort((a, b) => score(b) - score(a) || a.position - b.position)[0];
}

/** Lo que paga con el cupón (orientativo: lo cobra Stripe con su código de promoción). Meses gratis: el primer pago a 0. */
export function withCoupon(amount: number, c: Pick<Coupon, 'kind' | 'value'> | null): number {
  if (!c) return amount;
  if (c.kind === 'percent') return Math.max(0, Math.round(amount * (10_000 - c.value)) / 10_000);
  if (c.kind === 'fixed') return Math.max(0, Math.round((amount - c.value / 100) * 100) / 100);
  return 0;
}

