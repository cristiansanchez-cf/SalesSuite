import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * En directo: fotos (o vídeos) reales del producto funcionando, en tira. Diapositiva solo visual: un vistazo, sin
 * argumento. Cada pieza, con un pie corto. `video`: si lo hay, se reproduce en bucle y sin sonido (la foto, de póster).
 */
export const mediaStripSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(300).optional(),
  items: z.array(z.object({
    src: url,
    alt: z.string().min(1).max(140),
    caption: z.string().max(80).optional(),
    video: url.optional(),
  })).min(1).max(6),
});

export type MediaStripProps = z.infer<typeof mediaStripSchema>;
