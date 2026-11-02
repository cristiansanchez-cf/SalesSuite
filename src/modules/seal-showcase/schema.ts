import { z } from 'zod';

const url = z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta');

/**
 * El sello de la marca, entero y a buen tamaño, en la página que se verifica (junto a las afirmaciones que cubre).
 * - `seal`: el dibujo tal cual lo entregó el diseñador (nunca recortado ni recoloreado). `ground` = el fondo sobre el
 *   que va, que es lo que decide la versión (clara sobre papel, oscura sobre navy), no el estado.
 * - `page`: una página de ejemplo de la marca con sus afirmaciones; el nombre es el de la empresa de la propuesta.
 * - `rules`: dónde va y dónde no. `states`: qué pasa cada año, en palabras (sin colores: el estado nunca es solo color).
 */
export const sealShowcaseSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  lede: z.string().max(400).optional(),
  seal: z.object({ src: url, alt: z.string().min(1).max(140) }),
  ground: z.enum(['paper', 'navy']).default('paper'),
  page: z.object({
    label: z.string().max(40).default('Ejemplo'),
    address: z.string().max(80).default('tumarca.com/producto'),
    claims: z.array(z.string().min(1).max(160)).min(1).max(3),
  }).optional(),
  rules: z.array(z.string().min(1).max(140)).max(5).default([]),
  states: z.array(z.object({ name: z.string().min(1).max(40), body: z.string().min(1).max(200) })).max(4).default([]),
  note: z.string().max(300).optional(),
});

export type SealShowcaseProps = z.infer<typeof sealShowcaseSchema>;
