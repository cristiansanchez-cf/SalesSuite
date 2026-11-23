import { z } from 'zod';

/**
 * La oportunidad en el tiempo (docs/DECKS.md): una cita y los hitos (hoy → final de año → …) con su cifra, lo que
 * significa y cuánto factura; `highlight` resalta uno (p. ej. el break-even). Las cifras cuentan al verse.
 */
export const deckTimelineSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  quote: z.string().max(600).optional(),
  steps: z.array(z.object({
    when: z.string().min(1).max(60), value: z.string().min(1).max(24), label: z.string().max(80).optional(),
    money: z.string().max(60).optional(), note: z.string().max(200).optional(), highlight: z.boolean().optional(),
  })).min(1).max(5),
  callout: z.object({ tag: z.string().max(30).optional(), text: z.string().min(1).max(400) }).optional(),
});
export type DeckTimelineProps = z.infer<typeof deckTimelineSchema>;
