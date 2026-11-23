import { z } from 'zod';

/**
 * Portada de un deck de inversión (docs/DECKS.md): quiénes sois y qué ronda levantáis. En los textos, *acento* sale en
 * el color principal («Documento de *inversión.*») y **negrita**, en negrita.
 */
export const deckCoverSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  title: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  /** Pastilla bajo el texto (p. ej. «Ronda semilla · 2026»). */
  round: z.string().max(120).optional(),
  /** Pastilla arriba a la derecha (p. ej. el año). */
  badge: z.string().max(24).optional(),
  /** Pie (web o contacto). */
  contact: z.string().max(160).optional(),
});
export type DeckCoverProps = z.infer<typeof deckCoverSchema>;
