import { z } from 'zod';

/**
 * Personas (docs/DECKS.md): el equipo o quién está dentro de la ronda. Cada una con su etiqueta («Legal & ticket»),
 * su organización y unas líneas; `featured` resalta una (el inversor principal). `note`: una línea al pie (★).
 */
export const deckTeamSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  people: z.array(z.object({
    name: z.string().min(1).max(120),
    role: z.string().max(80).optional(),
    bio: z.string().max(400).optional(),
    tag: z.string().max(40).optional(),
    featured: z.boolean().optional(),
    photo: z.string().url().startsWith('https://').optional(),
  })).min(1).max(8),
  note: z.string().max(300).optional(),
  /** Cifras del equipo (p. ej. 2 fundadores · 4 desarrolladores) y líneas extra (advisors, lo que se incorpora). */
  stats: z.array(z.object({ value: z.string().min(1).max(12), label: z.string().min(1).max(60) })).max(6).optional(),
  statsTitle: z.string().max(80).optional(),
  lines: z.array(z.string().min(1).max(300)).max(5).optional(),
});
export type DeckTeamProps = z.infer<typeof deckTeamSchema>;
