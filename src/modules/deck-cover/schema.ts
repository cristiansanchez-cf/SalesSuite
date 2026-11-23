import { z } from 'zod';

/** Portada de un deck de inversión (docs/DECKS.md): quiénes sois en una frase y qué ronda levantáis. */
export const deckCoverSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  title: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  round: z.string().max(120).optional(),
  contact: z.string().max(160).optional(),
});
export type DeckCoverProps = z.infer<typeof deckCoverSchema>;
