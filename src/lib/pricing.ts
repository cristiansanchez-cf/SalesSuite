import type { Discount, PriceMode, PublicDossier, RenderItem } from './types';
import { mulDivRound } from './commissions/money';

export interface ResolvedPrice {
  amount: number;
  currency: string;
  formatted: string;
  /** Con cupón: el precio sin descuento (se muestra tachado) y qué cupón es. */
  before?: { amount: number; formatted: string };
  discount?: { code: string; label: string; kind: Discount['kind'] };
}

/** Aplica un cupón a un importe (en euros, al céntimo; nunca por debajo de 0). «Meses gratis» no cambia el precio. */
export function applyDiscount(amount: number, d: Discount): number {
  const cents = Math.round(amount * 100);
  if (d.kind === 'percent') return (cents - mulDivRound(cents, d.value, 10_000)) / 100;
  if (d.kind === 'fixed') return Math.max(0, cents - d.value) / 100;
  return amount;
}

export function formatPrice(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/** Precio de un item: solo existe en modo per_module (override ?? default del módulo). */
export function resolveItemPrice(
  item: Pick<RenderItem, 'priceOverride' | 'defaultPrice' | 'currency'>,
  mode: PriceMode,
  currency: string,
  locale: string,
): ResolvedPrice | null {
  if (mode !== 'per_module') return null;
  const amount = item.priceOverride ?? item.defaultPrice;
  if (amount == null) return null;
  // El dossier fija la moneda; los importes del catálogo se asumen en esa moneda (ver ADR-0001 §precio).
  return { amount, currency, formatted: formatPrice(amount, currency, locale) };
}

/**
 * Total mostrado del dossier.
 * - none: null
 * - total: dossier.total_price
 * - per_module: suma de los items visibles con precio (decisión MVP: sí se muestra total).
 * Importes sin impuestos; el texto "IVA no incluido" lo pone el módulo pricing-card.
 */
export function resolveTotal(d: Pick<PublicDossier, 'priceMode' | 'totalPrice' | 'currency' | 'locale' | 'items'> & { discount?: Discount | null }): ResolvedPrice | null {
  if (d.priceMode === 'none') return null;
  let amount: number | null = null;
  if (d.priceMode === 'total') amount = d.totalPrice;
  else {
    const prices = d.items
      .map((i) => resolveItemPrice(i, 'per_module', d.currency, d.locale)?.amount)
      .filter((a): a is number => a != null);
    amount = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  }
  if (amount == null) return null;
  const base: ResolvedPrice = { amount, currency: d.currency, formatted: formatPrice(amount, d.currency, d.locale) };
  if (!d.discount) return base;
  const after = applyDiscount(amount, d.discount);
  return {
    amount: after, currency: d.currency, formatted: formatPrice(after, d.currency, d.locale),
    ...(after !== amount ? { before: { amount, formatted: base.formatted } } : {}),
    discount: { code: d.discount.code, label: d.discount.label, kind: d.discount.kind },
  };
}
