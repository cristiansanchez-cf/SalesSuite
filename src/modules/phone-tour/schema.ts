import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * Cómo lo vive el invitado, en su móvil (UI de la app de Enjoy recreada). Pasos que se adaptan a lo que tiene el
 * cliente (Personalizar → «¿Qué tiene?»): sin canciones no hay pedir canción; sin álbum no hay álbum.
 */
export const phoneTourSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(300).optional(),
  djName: z.string().max(30).default('DJ Mikel'),
  /** Lo que se paga por salir en pantalla en el ejemplo. */
  price: z.number().min(0).max(100).default(2),
  /** Foto de ejemplo del invitado (si el comercial no ha subido las del cliente). */
  photos: z.array(url).max(6).default([]),
  qrImage: url.optional(),
  /** Mismas canciones por estilo que la pantalla en vivo (con carátulas del alta del espacio). */
  musicStyles: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.object({
    label: z.string().min(1).max(40),
    songs: z.array(z.object({ song: z.string().min(1).max(80), artist: z.string().max(80), cover: url.nullable().optional() })).min(1).max(12),
  })).optional(),
  autoplay: z.boolean().default(true),
});

export type PhoneTourProps = z.infer<typeof phoneTourSchema>;
