import { z } from 'zod';

/**
 * Cifras grandes (docs/DECKS.md): mercado (TAM, SAM, SOM), tracción o la ronda. `breakdown`: un reparto en porcentajes
 * (p. ej. el uso de los fondos), en barras.
 */
export const deckStatsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  stats: z.array(z.object({ value: z.string().min(1).max(24), label: z.string().min(1).max(80), note: z.string().max(120).optional() })).min(1).max(6),
  breakdownTitle: z.string().max(80).optional(),
  breakdown: z.array(z.object({ label: z.string().min(1).max(60), percent: z.number().min(0).max(100) })).max(8).optional(),
});
export type DeckStatsProps = z.infer<typeof deckStatsSchema>;
