import { z } from 'zod';

/**
 * Calculadora de ejemplo (docs/DECKS.md), siempre con su etiqueta de «ilustrativo».
 *  · commission: eliges un tipo (con su precio) y cuántos al mes → la comisión (entre rateMin y rateMax %).
 *  · stake: escribes tu ticket → el % que obtienes (ticket ÷ postMoney).
 */
export const deckCalcSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  kind: z.enum(['commission', 'stake']),
  options: z.array(z.object({ label: z.string().min(1).max(40), price: z.number().min(0).max(1_000_000) })).max(6).default([]),
  rateMin: z.number().min(0).max(100).default(10),
  rateMax: z.number().min(0).max(100).default(20),
  qtyLabel: z.string().max(60).optional(),
  qtyDefault: z.number().int().min(1).max(10_000).default(10),
  postMoney: z.number().min(1).max(1_000_000_000).optional(),
  ticketDefault: z.number().min(0).max(100_000_000).default(25000),
  ticketLabel: z.string().max(60).optional(),
  resultLabel: z.string().max(60).optional(),
  currency: z.string().length(3).default('EUR'),
  disclaimer: z.string().max(200).optional(),
});
export type DeckCalcProps = z.infer<typeof deckCalcSchema>;
