import { z } from 'zod';

/**
 * Lo cerrado (docs/DECKS.md): acuerdos o casos con su estado («Cerrado»), una etiqueta, dónde y cuándo, unas líneas,
 * nombres destacados y una foto (https). Uno por fila, foto a la derecha.
 */
export const deckCasesSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  items: z.array(z.object({
    status: z.string().max(24).optional(), tag: z.string().max(30).optional(), meta: z.string().max(80).optional(),
    title: z.string().min(1).max(60), highlight: z.string().max(30).optional(), text: z.string().max(400).optional(),
    namesLabel: z.string().max(30).optional(), names: z.array(z.string().min(1).max(40)).max(5).optional(),
    image: z.string().url().startsWith('https://').optional(),
  })).min(1).max(4),
});
export type DeckCasesProps = z.infer<typeof deckCasesSchema>;
