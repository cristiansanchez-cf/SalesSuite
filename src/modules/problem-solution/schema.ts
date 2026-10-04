import { z } from 'zod';

/**
 * «Lo que te pasa hoy → lo que cambia»: 1–4 tarjetas, el problema del cliente arriba y lo que cambia debajo.
 * Contado desde su silla, no desde el producto. `note`: una línea extra (p. ej. noches flojas).
 */
export const problemSolutionSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(300).optional(),
  beforeLabel: z.string().min(1).max(30).default('Hoy'),
  afterLabel: z.string().min(1).max(30).default('Con Enjoy'),
  cards: z.array(z.object({
    problem: z.string().min(1).max(200),
    solution: z.string().min(1).max(240),
  })).min(1).max(4),
  note: z.string().max(400).optional(),
});

export type ProblemSolutionProps = z.infer<typeof problemSolutionSchema>;
