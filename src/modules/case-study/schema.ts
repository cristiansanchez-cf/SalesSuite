import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * Caso real: un cliente con nombre (con su permiso por escrito), qué pasó y, si la hay, una cita y una foto.
 * Sin cifras que no estén en la fuente.
 */
export const caseStudySchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  client: z.string().min(1).max(60),
  place: z.string().max(60).optional(),
  body: z.string().min(1).max(600),
  quote: z.object({ text: z.string().min(1).max(300), author: z.string().max(80).optional() }).optional(),
  image: url.optional(),
});

export type CaseStudyProps = z.infer<typeof caseStudySchema>;
