import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/** Estados de la pantalla del local (kit de Enjoy). club = pantalla completa; tp = encima de los visuales del local. */
export const LIVE_SCENES = ['club.idle', 'club.song', 'club.photo', 'club.message', 'club.promo', 'club.toast', 'tp.idle', 'tp.song', 'tp.photo', 'tp.message', 'tp.full'] as const;
export type LiveScene = (typeof LIVE_SCENES)[number];

export const liveScreenSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(300).optional(),
  /** Arriba a la izquierda de la pantalla: el nombre del cliente ({company}). */
  venueName: z.string().max(40).default('{company}'),
  djName: z.string().max(30).default('DJ'),
  /** QR real (que escanee). Sin él, uno de atrezzo. */
  qrImage: url.optional(),
  /** Fotos del público: van enteras sobre negro (nunca se recorta una cara). */
  photos: z.array(url).max(8).default([]),
  /** Carátulas de canciones. Sin ellas, una carátula de color con el título. */
  covers: z.array(url).max(8).default([]),
  /** Capturas del móvil del cliente para la animación de «escanea y pide». */
  phone: z.object({ song: url.optional(), photo: url.optional(), message: url.optional() }).default({}),
  /** Las pantallas que se enseñan, en orden, con lo que vende cada una (una frase). */
  scenes: z.array(z.object({
    scene: z.enum(LIVE_SCENES),
    label: z.string().min(1).max(30),
    says: z.string().max(220).default(''),
    /**
     * Texto que sale en la pantalla: en club.promo, lo que el local manda desde su móvil («Chupito a 2 € los próximos diez
     * minutos»); en el resto, el mensaje, el pie de la foto o la dedicatoria de la canción (las dinámicas de «Imagínatelo»).
     */
    text: z.string().max(120).optional(),
  })).min(1).max(10),
  /** Vídeo del local de ejemplo (los visuales sobre los que va el modo transparente). webm y mp4: cada navegador coge el suyo. */
  venueVideo: z.object({ webm: url.optional(), mp4: url.optional(), poster: url.optional() }).optional(),
  /** Pantalla extra cuando el comercial sube un vídeo del cliente (Personalizar): sus visuales de fondo. */
  videoScene: z.object({ label: z.string().min(1).max(30), says: z.string().max(220) }).default({
    label: 'Su vídeo',
    says: 'Sus visuales de fondo y la pantalla encima. Lo cambian desde el móvil cuando quieran, y sale cada pocos minutos.',
  }),
  /** Canciones por estilo (con carátulas resueltas por el alta del espacio). Sin esto, las de music.ts sin carátula. */
  musicStyles: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.object({
    label: z.string().min(1).max(40),
    songs: z.array(z.object({ song: z.string().min(1).max(80), artist: z.string().max(80), cover: url.nullable().optional() })).min(1).max(12),
  })).optional(),
  /** Recorrido solo en bucle (se para en cuanto alguien toca una pantalla). */
  autoplay: z.boolean().default(true),
});

export type LiveScreenProps = z.infer<typeof liveScreenSchema>;
