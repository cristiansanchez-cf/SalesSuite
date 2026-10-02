import { z } from 'zod';

const cta = z.object({
  label: z.string().min(1).max(40),
  href: z.string().max(500).refine((h) => /^(https:\/\/|mailto:|tel:|#|\/)/.test(h), 'href https/mailto/tel/#/ruta'),
  variant: z.enum(['primary', 'accent', 'ghost']).default('primary'),
});

export const heroPitchSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  /** Admite {prospect} y {company}. */
  title: z.string().min(1).max(140),
  /** Palabras que rotan al final del título (animado). Vacío = sin rotación. */
  rotatingWords: z.array(z.string().min(1).max(30)).max(8).default([]),
  subtitle: z.string().max(400).optional(),
  ctas: z.array(cta).max(2).default([]),
  stats: z.array(z.object({ value: z.string().max(12), label: z.string().max(40) })).max(4).default([]),
  rotateEveryMs: z.number().int().min(1200).max(10000).default(2200),
});

export type HeroPitchProps = z.infer<typeof heroPitchSchema>;
