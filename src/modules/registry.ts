import type { z } from 'zod';
import { heroPitchSchema } from './hero-pitch/schema';
import { tabsShowcaseSchema } from './tabs-showcase/schema';
import { pricingCardSchema } from './pricing-card/schema';

/**
 * Registry build-time: block_type → { schema de props, componente (lazy) }.
 * Añadir un módulo = carpeta nueva + una entrada aquí + filas module/module_version (ver docs/MODULE_AUTHORING.md).
 */
export const REGISTRY = {
  'hero-pitch': {
    label: 'Hero (portada)',
    schema: heroPitchSchema,
    example: { eyebrow: 'Propuesta para {company}', title: 'Tu titular aquí', rotatingWords: [], subtitle: 'Subtítulo.', ctas: [], stats: [] },
    load: () => import('./hero-pitch/Component.astro'),
  },
  'tabs-showcase': {
    label: 'Pestañas con mock animado',
    schema: tabsShowcaseSchema,
    example: { title: 'Servicios', tabs: [{ label: 'Servicio', title: 'Título del servicio', body: 'Descripción.', bullets: ['Ventaja'] }] },
    load: () => import('./tabs-showcase/Component.astro'),
  },
  'pricing-card': {
    label: 'Tarjeta de precio',
    schema: pricingCardSchema,
    example: { title: 'Propuesta para {company}', features: ['Incluido'] },
    load: () => import('./pricing-card/Component.astro'),
  },
} as const satisfies Record<string, {
  label: string;
  schema: z.ZodTypeAny;
  /** Props mínimas válidas: punto de partida al crear un módulo desde la consola. */
  example: Record<string, unknown>;
  load: () => Promise<{ default: unknown }>;
}>;

export type BlockType = keyof typeof REGISTRY;

export function isBlockType(t: string): t is BlockType {
  return Object.prototype.hasOwnProperty.call(REGISTRY, t);
}
