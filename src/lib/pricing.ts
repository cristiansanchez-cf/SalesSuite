import type { PriceMode, PublicDossier, RenderItem } from './types';

export interface ResolvedPrice {
  amount: number;
  currency: string;
  formatted: string;
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
export function resolveTotal(d: Pick<PublicDossier, 'priceMode' | 'totalPrice' | 'currency' | 'locale' | 'items'>): ResolvedPrice | null {
  if (d.priceMode === 'none') return null;
  let amount: number | null = null;
  if (d.priceMode === 'total') amount = d.totalPrice;
  else {
    const prices = d.items
      .map((i) => resolveItemPrice(i, 'per_module', d.currency, d.locale)?.amount)
      .filter((a): a is number => a != null);
    amount = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  }
  return amount == null ? null : { amount, currency: d.currency, formatted: formatPrice(amount, d.currency, d.locale) };
}
