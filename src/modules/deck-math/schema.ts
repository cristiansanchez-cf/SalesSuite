import { z } from 'zod';

/**
 * Por qué entrar ahora (docs/DECKS.md): una cuenta grande (inviertes − te devuelven = riesgo real), tarjetas (las
 * ventanas de salida), una tabla (escenarios) y una frase destacada. Todo opcional menos el título.
 */
export const deckMathSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  equation: z.object({
    tag: z.string().max(40).optional(), caption: z.string().max(80).optional(), note: z.string().max(200).optional(),
    terms: z.array(z.object({ label: z.string().min(1).max(40), value: z.string().min(1).max(24), tone: z.enum(['primary', 'accent', 'text']).optional() })).min(2).max(3),
    ops: z.array(z.string().max(2)).max(2).optional(),
  }).optional(),
  cardsTitle: z.string().max(120).optional(),
  cards: z.array(z.object({ tag: z.string().max(40).optional(), title: z.string().min(1).max(80), text: z.string().max(400).optional() })).max(3).optional(),
  table: z.object({
    columns: z.array(z.string().max(30)).min(2).max(5),
    rows: z.array(z.array(z.string().max(40)).min(2).max(5)).min(1).max(6),
  }).optional(),
  callout: z.object({ text: z.string().min(1).max(200), big: z.string().max(24).optional(), after: z.string().max(80).optional(), note: z.string().max(160).optional() }).optional(),
});
export type DeckMathProps = z.infer<typeof deckMathSchema>;
