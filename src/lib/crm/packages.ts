/**
 * Paquetes (docs/PAQUETES.md): lógica pura. Un catálogo por espacio (Canciones, Pantalla, Álbum, Fidelización…) con
 * precio por tamaño del local; al cerrar se eligen paquetes (alguno gratis, si se puede) y el precio sale solo: el
 * normal, o uno menor (descuento) que se ve como tal.
 */
export type Tier = 'small' | 'medium' | 'large';
export const TIERS: Tier[] = ['small', 'medium', 'large'];

export interface Product {
  id: string; key: string; name: string; summary: string | null; includes: string[];
  prices: Record<Tier, number | null>; currency: string; period: 'once' | 'event' | 'month' | 'year';
  freeAllowed: boolean; freeNote: string | null; position: number; active: boolean;
}

/** Una fila de la tabla product (Supabase o demo) → Product. */
export function productFromRow(r: Record<string, unknown>): Product {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(r.id), key: String(r.key), name: String(r.name), summary: (r.summary as string | null) ?? null, includes: [...((r.includes as string[] | null) ?? [])],
    prices: { small: n(r.price_small), medium: n(r.price_medium), large: n(r.price_large) },
    currency: String(r.currency ?? 'EUR'), period: (r.period as Product['period']) ?? 'month', freeAllowed: !!r.free_allowed, freeNote: (r.free_note as string | null) ?? null,
    position: Number(r.position ?? 0), active: !!r.active,
  };
}

/** El tramo de precio por el tamaño del local (priority.ts SIZES): masivo paga como grande. Sin tamaño, mediano. */
export function tierOf(size: string | null | undefined): Tier {
  return size === 'small' ? 'small' : size === 'large' || size === 'huge' ? 'large' : 'medium';
}

/** Lo elegido: «clave» o «clave:free» (gratis, si el paquete lo permite). */
export interface Pick { key: string; free: boolean }
export const pickOf = (s: string): Pick => ({ key: s.replace(/:free$/, ''), free: s.endsWith(':free') });
export const pickStr = (p: Pick) => (p.free ? `${p.key}:free` : p.key);

/** Solo lo que existe y está activo, sin repetir, y gratis solo si se puede. */
export function cleanPicks(raw: string[], products: Product[]): Pick[] {
  const seen = new Set<string>();
  return raw.map(pickOf).flatMap((p) => {
    const pr = products.find((x) => x.key === p.key && x.active);
    if (!pr || seen.has(p.key)) return [];
    seen.add(p.key);
    return [{ key: p.key, free: p.free && pr.freeAllowed }];
  });
}

/** El precio normal de lo elegido para ese tamaño (lo gratis no suma). null si algún paquete no tiene precio ahí. */
export function listPrice(picks: Pick[], products: Product[], tier: Tier): number | null {
  let sum = 0;
  for (const p of picks) {
    if (p.free) continue;
    const v = products.find((x) => x.key === p.key)?.prices[tier];
    if (v == null) return null;
    sum += v;
  }
  return Math.round(sum * 100) / 100;
}

/** El descuento en %, si el precio es menor que el normal (redondeado). */
export function discountPct(price: number | null, list: number | null): number | null {
  if (price == null || list == null || list <= 0 || price >= list) return null;
  return Math.round(((list - price) / list) * 100);
}

const money = (n: number, cur: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const PER: Record<string, string> = { month: '/mes', year: '/año', event: '/evento', once: '' };

/**
 * En una línea, para el acuerdo y la IA: «Canciones (gratis) + Álbum · 25 €/mes (normal 50 €/mes, −50 %)».
 * Las condiciones de lo gratis van aparte (freeNotes).
 */
export function describe(picks: Pick[], products: Product[], o: { price: number | null; list: number | null; locale?: string }): string {
  const locale = o.locale ?? 'es-ES';
  const names = picks.map((p) => { const pr = products.find((x) => x.key === p.key); return pr ? `${pr.name}${p.free ? ' (gratis)' : ''}` : p.key; });
  const first = products.find((x) => picks.some((p) => p.key === x.key));
  const cur = first?.currency ?? 'EUR';
  const per = PER[first?.period ?? 'month'] ?? '';
  const pct = discountPct(o.price, o.list);
  const price = o.price == null ? '' : o.price === 0 ? 'gratis' : `${money(o.price, cur, locale)}${per}`;
  const extra = pct != null && o.list != null ? ` (normal ${money(o.list, cur, locale)}${per}, −${pct} %)` : '';
  return [names.join(' + '), price ? `${price}${extra}` : ''].filter(Boolean).join(' · ');
}
/** Las condiciones de lo que va gratis («Canciones gratis: las propinas son para Enjoy…»). */
export function freeNotes(picks: Pick[], products: Product[]): string[] {
  return picks.filter((p) => p.free).flatMap((p) => { const pr = products.find((x) => x.key === p.key); return pr?.freeNote ? [`${pr.name}: ${pr.freeNote}`] : []; });
}

/** El catálogo en texto, para la IA (notas, investigación, asistente) y Aprende. */
export function catalogText(products: Product[], locale = 'es-ES'): string {
  const tierName: Record<Tier, string> = { small: 'pequeño', medium: 'mediano', large: 'grande' };
  return products.filter((p) => p.active).map((p) => {
    const prices = TIERS.filter((t) => p.prices[t] != null).map((t) => `${tierName[t]} ${money(p.prices[t]!, p.currency, locale)}${PER[p.period] ?? ''}`).join(', ');
    return [`- ${p.name} (${p.key})${p.summary ? `: ${p.summary}` : ''}`, p.includes.length ? `  Incluye: ${p.includes.join('; ')}.` : '',
      prices ? `  Precio: ${prices}.` : '', p.freeAllowed ? `  Puede ir gratis${p.freeNote ? `: ${p.freeNote}` : ''}.` : ''].filter(Boolean).join('\n');
  }).join('\n');
}

/** Lo que escribió aparte en las condiciones (sin la línea de los paquetes ni lo de gratis, que ya se ven en etiquetas). */
export function extraTerms(terms: string, picks: Pick[], products: Product[], o: { price: number | null; list: number | null }): string {
  const auto = new Set([describe(picks, products, o), ...freeNotes(picks, products)]);
  return terms.split('\n').filter((l) => !auto.has(l.trim())).join('\n').trim();
}
