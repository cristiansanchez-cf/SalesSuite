import { z } from 'zod';

/** Cierre del deck (docs/DECKS.md): la pregunta grande, quién lo firma, cómo contactar y los datos clave al pie. */
export const deckContactSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(80),
  lede: z.string().max(300).optional(),
  people: z.array(z.object({ role: z.string().max(40).optional(), name: z.string().min(1).max(80), contact: z.string().max(120).optional() })).max(3).optional(),
  rows: z.array(z.object({ label: z.string().min(1).max(30), value: z.string().min(1).max(120) })).max(4).optional(),
  brand: z.string().max(60).optional(),
  facts: z.array(z.string().min(1).max(80)).max(4).optional(),
});
export type DeckContactProps = z.infer<typeof deckContactSchema>;
