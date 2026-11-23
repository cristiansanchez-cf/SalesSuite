import { z } from 'zod';

/** El equipo (docs/DECKS.md): quién lo hace y por qué vosotros. Foto opcional (URL https). */
export const deckTeamSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  people: z.array(z.object({
    name: z.string().min(1).max(80), role: z.string().min(1).max(80), bio: z.string().max(220).optional(),
    photo: z.string().url().regex(/^https:\/\//).max(500).optional(),
  })).min(1).max(8),
});
export type DeckTeamProps = z.infer<typeof deckTeamSchema>;
