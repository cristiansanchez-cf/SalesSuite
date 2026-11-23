import { z } from 'zod';

/** Un embudo (docs/DECKS.md): de lo más grande a lo más concreto, cada nivel con su cifra, su texto y su fuente. */
export const deckFunnelSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(160),
  lede: z.string().max(320).optional(),
  levels: z.array(z.object({
    value: z.string().min(1).max(24), label: z.string().min(1).max(80), text: z.string().max(300).optional(), source: z.string().max(200).optional(),
  })).min(2).max(5),
  band: z.string().max(240).optional(),
});
export type DeckFunnelProps = z.infer<typeof deckFunnelSchema>;
