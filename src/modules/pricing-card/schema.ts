import { z } from 'zod';

export const pricingCardSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(300).optional(),
  features: z.array(z.string().min(1).max(120)).max(10).default([]),
  /** Sufijo bajo la cifra (p. ej. "/evento", "pago único"). */
  priceSuffix: z.string().max(30).optional(),
  /** Texto cuando el dossier no muestra precio (price_mode = none). */
  noPriceLabel: z.string().max(60).default('Precio a medida'),
  taxNote: z.string().max(80).default('IVA no incluido'),
  cta: z.object({
    label: z.string().min(1).max(40),
    href: z.string().max(500).refine((h) => /^(https:\/\/|mailto:|tel:|#|\/)/.test(h), 'href https/mailto/tel/#/ruta'),
  }).optional(),
});

export type PricingCardProps = z.infer<typeof pricingCardSchema>;

/**
 * Qué cifra muestra la tarjeta:
 *  - total → total del dossier
 *  - per_module → suma de items (total resuelto); el precio propio del item no se suma aparte
 *  - none → noPriceLabel
 */
export function pricingFigure<P extends { formatted: string }>(ctx: { priceMode: string; total: P | null; price: P | null }) {
  if (ctx.priceMode === 'none') return null;
  return ctx.total ?? ctx.price ?? null;
}
