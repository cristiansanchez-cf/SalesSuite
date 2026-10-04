import { z } from 'zod';
import { STEP_KEYS } from './steps';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * Cómo lo vive el invitado, en su móvil (UI de la app de Enjoy recreada). Pasos que se adaptan a lo que tiene el
 * cliente (Personalizar → «¿Qué tiene?»): sin canciones no hay pedir canción; sin álbum no hay álbum.
 */
export const phoneTourSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(300).optional(),
  /** Vacío = sin DJ (no se inventa uno: un local con su residente vería el nombre de otro). */
  djName: z.string().max(30).default('DJ Mikel'),
  /** Lo que se paga por salir en pantalla en el ejemplo. 0 = sin pago (ni importe, ni recibo, ni temporizador). */
  price: z.number().min(0).max(100).default(2),
  /**
   * Grupos propios (una diapositiva cada uno): lo que hace el invitado y lo que significa para quien paga («Para ti»).
   * Sin esto, los grupos de siempre.
   */
  parts: z.array(z.object({
    title: z.string().min(1).max(120),
    lede: z.string().max(300).optional(),
    steps: z.array(z.object({
      key: z.enum(STEP_KEYS),
      label: z.string().min(1).max(40).optional(),
      says: z.string().min(1).max(200),
      owner: z.string().max(200).optional(),
    })).min(1).max(5),
  })).min(1).max(4).optional(),
  ownerLabel: z.string().min(1).max(30).default('Para ti'),
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
