import { z } from 'zod';

const n = z.number().min(0).max(100000).nullable().default(null);

/**
 * «Lo que ya te cuesta» (guion de locales, pregunta 3): el comercial mete las cifras que le dio el cliente y la
 * propuesta hace la cuenta con él. Sin cifras, la diapositiva no sale: nunca se inventa una.
 */
export const costMathSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120).default('Lo que ya te cuesta'),
  /** Lo que cobra quien viene a hacer fotos o vídeo, por noche (€). */
  perNight: n,
  /** Noches al mes que trae a alguien. */
  nightsPerMonth: n,
  /** Horas suyas editando fotos cada domingo. */
  sundayHours: n,
  /** Compara con el precio de la propuesta (solo si él dio la cifra). */
  compare: z.boolean().default(true),
  afterLabel: z.string().min(1).max(40).default('Con Enjoy'),
});

export type CostMathProps = z.infer<typeof costMathSchema>;

/** ¿Hay alguna cifra? Sin ninguna, la diapositiva no se enseña. */
export const hasFigures = (p: Partial<CostMathProps>) => !!((p.perNight && p.nightsPerMonth) || p.sundayHours);
