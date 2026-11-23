import { z } from 'zod';

/** Una diapositiva de deck (docs/DECKS.md): titular y de 1 a 6 puntos (el problema, la solución, el modelo…). */
export const deckSlideSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  bullets: z.array(z.string().min(1).max(220)).min(1).max(6),
  note: z.string().max(300).optional(),
});
export type DeckSlideProps = z.infer<typeof deckSlideSchema>;
