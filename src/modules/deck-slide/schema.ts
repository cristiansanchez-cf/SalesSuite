import { z } from 'zod';

/**
 * Una diapositiva de deck (docs/DECKS.md): titular, una cita destacada (`lede`) y puntos numerados (el problema, la
 * solución, el modelo…). *acento* y **negrita** en los textos.
 */
export const deckSlideSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(480).optional(),
  bullets: z.array(z.string().min(1).max(220)).max(6).default([]),
  note: z.string().max(300).optional(),
});
export type DeckSlideProps = z.infer<typeof deckSlideSchema>;
