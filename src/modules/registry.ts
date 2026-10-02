import type { z } from 'zod';
import { heroPitchSchema } from './hero-pitch/schema';
import { tabsShowcaseSchema } from './tabs-showcase/schema';
import { pricingCardSchema } from './pricing-card/schema';

/**
 * Registry build-time: block_type → { schema de props, componente (lazy) }.
 * Añadir un módulo = carpeta nueva + una entrada aquí + filas module/module_version (ver docs/MODULE_AUTHORING.md).
 */
export const REGISTRY = {
  'hero-pitch': { schema: heroPitchSchema, load: () => import('./hero-pitch/Component.astro') },
  'tabs-showcase': { schema: tabsShowcaseSchema, load: () => import('./tabs-showcase/Component.astro') },
  'pricing-card': { schema: pricingCardSchema, load: () => import('./pricing-card/Component.astro') },
} as const satisfies Record<string, { schema: z.ZodTypeAny; load: () => Promise<{ default: unknown }> }>;

export type BlockType = keyof typeof REGISTRY;

export function isBlockType(t: string): t is BlockType {
  return Object.prototype.hasOwnProperty.call(REGISTRY, t);
}
