import { z } from 'zod';

/**
 * packages-offer (docs/PAQUETES.md): los paquetes que se le proponen, con lo que incluye cada uno y su precio. Los
 * paquetes son una FOTO del catálogo en el momento de ponerlos (lo enviado no cambia si luego cambian los precios);
 * los pone el servidor con la operación setPackages del builder, no se escriben a mano.
 */
export const packageSnapSchema = z.object({
  key: z.string().max(40),
  name: z.string().min(1).max(60),
  summary: z.string().max(400).nullable().optional(),
  includes: z.array(z.string().max(200)).max(15).default([]),
  /** Precio de este paquete para su tamaño (0 si va gratis). */
  price: z.number().min(0).max(100000).nullable(),
  free: z.boolean().default(false),
  freeNote: z.string().max(400).nullable().optional(),
});

export const packagesOfferSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(100).default('Lo que te proponemos'),
  subtitle: z.string().max(300).optional(),
  packages: z.array(packageSnapSchema).max(15).default([]),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  period: z.enum(['once', 'event', 'month', 'year']).default('month'),
  /** Lo que paga al mes (null = sin precio) y el normal (si es menor, se ve el descuento). */
  total: z.number().min(0).max(1000000).nullable().default(null),
  listTotal: z.number().min(0).max(1000000).nullable().default(null),
  /** Tamaño con el que se calculó el precio (small, medium, large): para volver a abrirlo en el editor. */
  tier: z.enum(['small', 'medium', 'large']).optional(),
  taxNote: z.string().max(80).default('IVA no incluido'),
  footnote: z.string().max(240).optional(),
  emptyLabel: z.string().max(120).default('Elige los paquetes en el editor de la propuesta.'),
});
export type PackagesOfferProps = z.infer<typeof packagesOfferSchema>;
export type PackageSnap = z.infer<typeof packageSnapSchema>;
