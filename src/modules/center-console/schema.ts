import { z } from 'zod';

/** Vistas de la consola de escritorio de Oquea recreadas (Component.astro). */
export const CONSOLE_VIEWS = ['today', 'activity', 'crm', 'centre'] as const;

/**
 * La consola del centro en escritorio (OqueaApp, docs/ventas/oquea/fuentes/02-entrega-UI-aplicacion.md §3): lateral de
 * 264 px con el conmutador Gestión/Buceador, contenido de 1120 como máximo, tarjetas con borde y sin sombra.
 * Cada vista lleva `says`: lo que vende, en una frase, debajo de la pantalla. Pasan solas hasta que el comercial toca.
 * Las cifras y los nombres son de ejemplo (`exampleLabel` lo dice en la pantalla): nunca resultados del cliente.
 */
export const centerConsoleSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  highlight: z.string().max(80).optional(),
  lede: z.string().max(300).optional(),
  views: z.array(z.object({
    view: z.enum(CONSOLE_VIEWS),
    label: z.string().min(1).max(30),
    says: z.string().min(1).max(200),
  })).min(1).max(4),
  autoplay: z.boolean().default(true),
  everyMs: z.number().int().min(2500).max(12000).default(5500),
  exampleLabel: z.string().max(40).default('Datos de ejemplo'),
  sample: z.object({
    owner: z.string().max(40).default('Carlos Vidal'),
    site: z.string().max(40).default('Maaya Thila'),
    divers: z.string().max(10).default('128'),
    dives: z.string().max(10).default('1.204'),
  }).default({}),
});

export type CenterConsoleProps = z.infer<typeof centerConsoleSchema>;
