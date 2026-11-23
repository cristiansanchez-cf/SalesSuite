import { z } from 'zod';

/**
 * El ciclo del producto (docs/DECKS.md): pasos clicables (Descubrir → Reservar → …) y pilares con su estado (Disponible ·
 * En construcción · Roadmap). Al pulsar un paso se resaltan sus pilares y, si tiene, su pantalla (https).
 */
export const STATES = ['available', 'building', 'roadmap'] as const;
export const deckCycleSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  steps: z.array(z.object({
    label: z.string().min(1).max(30),
    /** Los pilares (por su número, desde 1) que se resaltan con este paso. */
    pillars: z.array(z.number().int().min(1).max(8)).max(8).default([]),
    image: z.string().url().startsWith('https://').optional(),
    caption: z.string().max(160).optional(),
  })).min(2).max(9),
  pillars: z.array(z.object({
    title: z.string().min(1).max(60), text: z.string().max(260).optional(), state: z.enum(STATES).optional(),
  })).max(8).default([]),
  /** Cómo se llama cada estado (por defecto, en el idioma del deck). */
  stateLabels: z.object({ available: z.string().max(30), building: z.string().max(30), roadmap: z.string().max(30) }).partial().optional(),
  note: z.string().max(200).optional(),
});
export type DeckCycleProps = z.infer<typeof deckCycleSchema>;
