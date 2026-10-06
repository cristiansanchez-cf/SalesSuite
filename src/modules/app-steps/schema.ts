import { z } from 'zod';

const url = z.string().max(500).refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/** Pantallas de la app recreadas en HTML (Screen.astro). `image`: una captura real (src). */
export const APP_SCREENS = [
  'access', 'qr-activity', 'dive-saved', 'share-card', 'logbook', 'diver-profile',
  'activities', 'create-activity', 'center-qr', 'crm-list', 'crm-diver', 'my-centres', 'team', 'dive-sites', 'map', 'album', 'event', 'badge', 'image',
] as const;

export const STEP_ICONS = [
  'qr', 'users', 'share', 'calendar', 'repeat', 'pin', 'building', 'phone', 'mail', 'image', 'logo', 'link', 'anchor',
  'headset', 'check', 'clock', 'ruler', 'send', 'book', 'shield', 'chart', 'megaphone', 'globe', 'heart', 'star', 'sparkle',
] as const;

/**
 * Pasos con la app (estilo «guía de inicio» de Oquea): a un lado el paso (chip con número, titular a dos tonos, 1–4
 * tarjetas con icono y un aviso); al otro, 1–2 móviles con la pantalla real recreada (o una captura).
 * `tone: dark` = portada o cierre (fondo oscuro de la marca, chip de acento); ahí las pantallas son opcionales.
 * `sample`: los datos de ejemplo de las pantallas. Los textos admiten {company} y {prospect}.
 */
export const appStepsSchema = z.object({
  tone: z.enum(['light', 'dark']).default('light'),
  step: z.number().int().min(1).max(99).optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  /** Palabras del título que van en el color de la marca (tal cual aparecen en el título). */
  highlight: z.string().max(80).optional(),
  lede: z.string().max(400).optional(),
  cards: z.array(z.object({
    icon: z.enum(STEP_ICONS).default('check'),
    title: z.string().min(1).max(80),
    body: z.string().max(220).optional(),
  })).max(4).default([]),
  tip: z.object({
    kind: z.enum(['check', 'info', 'bulb']).default('check'),
    text: z.string().min(1).max(240),
    strong: z.string().max(80).optional(),
  }).optional(),
  /** Botones o datos de contacto en pastilla (solo en tono oscuro: el cierre). */
  pills: z.array(z.object({ icon: z.enum(STEP_ICONS).default('mail'), label: z.string().min(1).max(60), href: z.string().max(300).refine((h) => /^(https:\/\/|mailto:|tel:|#|\/)/.test(h), 'href https/mailto/tel/#/ruta').optional() })).max(3).default([]),
  screens: z.array(z.object({
    screen: z.enum(APP_SCREENS),
    src: url.optional(),
    alt: z.string().max(140).optional(),
  })).max(3).default([]),
  /** Portada o cierre sin pantallas: la marca en grande a la derecha (p. ej. el isotipo en blanco). */
  mark: url.optional(),
  /** Foto de ejemplo (cabecera de la actividad, tarjeta para compartir). Si el cliente sube fotos, van las suyas. */
  photo: url.optional(),
  sample: z.object({
    diver: z.string().max(40).default('Laura Méndez'),
    handle: z.string().max(30).default('lauramendez'),
    level: z.string().max(40).default('Advanced Open Water'),
    activity: z.string().max(60).default('Inmersión a las 9:00'),
    discipline: z.string().max(40).default('Fun dive'),
    site: z.string().max(40).default('Maaya Thila'),
    place: z.string().max(40).default('Benalmádena, Málaga'),
    date: z.string().max(20).default('26/02/2026'),
    time: z.string().max(10).default('09:00'),
    depth: z.string().max(10).default('18,5'),
    duration: z.string().max(10).default('48'),
    temp: z.string().max(10).default('16'),
    life: z.string().max(80).default('Tortugas, tiburones, mantas'),
    dives: z.string().max(10).default('124'),
  }).default({}),
});

export type AppStepsProps = z.infer<typeof appStepsSchema>;
export type AppSample = AppStepsProps['sample'];
export type AppScreen = (typeof APP_SCREENS)[number];
