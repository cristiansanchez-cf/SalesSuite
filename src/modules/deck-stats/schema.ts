import { z } from 'zod';

const tone = z.enum(['primary', 'accent', 'text']).optional();

/**
 * Cifras (docs/DECKS.md): la ronda, la tracción, el mercado o el uso de los fondos. Las cifras cuentan al verse.
 *  · `stats`: tarjetas grandes (con etiqueta arriba, `featured` resalta una: «Total»).
 *  · `minor`: una fila de cifras pequeñas numeradas.
 *  · `cards`: tarjetas de texto (un festival, una discográfica…).
 *  · `breakdown`: un reparto en %, en barras o en donut (`breakdownStyle`), cada parte con su explicación.
 *  · `callouts`: frases destacadas al final (con etiqueta opcional, p. ej. «+ ENISA»).
 */
export const deckStatsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  stats: z.array(z.object({
    value: z.string().min(1).max(24), label: z.string().min(1).max(80), note: z.string().max(160).optional(),
    kicker: z.string().max(40).optional(), tone, featured: z.boolean().optional(),
  })).max(6).default([]),
  minor: z.array(z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(120) })).max(6).optional(),
  cards: z.array(z.object({ tag: z.string().max(40).optional(), title: z.string().min(1).max(80), text: z.string().max(320).optional() })).max(4).optional(),
  breakdownTitle: z.string().max(80).optional(),
  breakdownStyle: z.enum(['bars', 'donut']).optional(),
  breakdown: z.array(z.object({ label: z.string().min(1).max(60), percent: z.number().min(0).max(100), note: z.string().max(200).optional() })).max(8).optional(),
  callouts: z.array(z.object({ tag: z.string().max(30).optional(), text: z.string().min(1).max(320) })).max(3).optional(),
});
export type DeckStatsProps = z.infer<typeof deckStatsSchema>;
