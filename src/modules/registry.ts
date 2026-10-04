import type { z } from 'zod';
import { heroPitchSchema } from './hero-pitch/schema';
import { tabsShowcaseSchema } from './tabs-showcase/schema';
import { pricingCardSchema } from './pricing-card/schema';
import { liveScreenSchema } from './live-screen/schema';
import { phoneTourSchema } from './phone-tour/schema';
import { problemSolutionSchema } from './problem-solution/schema';
import { caseStudySchema } from './case-study/schema';
import { costMathSchema, hasFigures } from './cost-math/schema';
import { mediaStripSchema } from './media-strip/schema';
import { appStepsSchema } from './app-steps/schema';
import { centerConsoleSchema } from './center-console/schema';
import { partsFor } from './phone-tour/steps';
import type { ModuleContext } from './types';

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
  'live-screen': {
    label: 'Pantalla en vivo (interactiva)',
    schema: liveScreenSchema,
    example: { title: 'Así se ve en tu local', scenes: [{ scene: 'club.idle', label: 'Reclamo', says: 'Lo que se ve la mayor parte de la noche: el QR.' }] },
    load: () => import('./live-screen/Component.astro'),
  },
  'phone-tour': {
    label: 'Móvil del invitado (recorrido)',
    schema: phoneTourSchema,
    example: { title: 'Así lo vive cada invitado' },
    load: () => import('./phone-tour/Component.astro'),
    // En presentación, una diapositiva por trozo del recorrido (no un recorrido de 8 pasos en una).
    parts: (props: Record<string, unknown>, ctx: ModuleContext) => partsFor(ctx.media, '', Number(props.price ?? 2), props.parts as never, props.djName !== '').map((part) => ({ part })),
  },
  'problem-solution': {
    label: 'Problema → solución',
    schema: problemSolutionSchema,
    example: { title: 'Lo que te pasa hoy', cards: [{ problem: 'Lo que le pasa hoy al cliente.', solution: 'Lo que cambia.' }] },
    load: () => import('./problem-solution/Component.astro'),
  },
  'case-study': {
    label: 'Caso real',
    schema: caseStudySchema,
    example: { title: 'Lo que le pasó a…', client: 'Cliente', body: 'Qué pasó, con su permiso.' },
    load: () => import('./case-study/Component.astro'),
  },
  'cost-math': {
    label: 'Lo que ya te cuesta',
    schema: costMathSchema,
    example: { title: 'Lo que ya te cuesta' },
    load: () => import('./cost-math/Component.astro'),
    // Sin cifras del cliente no hay diapositiva (nunca se inventa una).
    hidden: (props: Record<string, unknown>) => !hasFigures(props as never),
  },
  'media-strip': {
    label: 'En directo (fotos y vídeos reales)',
    schema: mediaStripSchema,
    example: { title: 'En directo', items: [{ src: '/demo/foto.webp', alt: 'El producto funcionando en un local' }] },
    load: () => import('./media-strip/Component.astro'),
  },
  'app-steps': {
    label: 'Pasos con la app (móvil con la pantalla real)',
    schema: appStepsSchema,
    example: { title: 'Tu centro, en minutos', cards: [{ icon: 'qr', title: 'Un QR único', body: 'Lo imprimes y lo pones en el barco.' }], screens: [{ screen: 'center-qr' }] },
    load: () => import('./app-steps/Component.astro'),
  },
  'center-console': {
    label: 'Consola del centro (escritorio, interactiva)',
    schema: centerConsoleSchema,
    example: { title: 'Tu centro, en una pantalla', views: [{ view: 'today', label: 'Hoy', says: 'Las salidas del día y quién viene.' }] },
    load: () => import('./center-console/Component.astro'),
  },
} as const satisfies Record<string, {
  label: string;
  schema: z.ZodTypeAny;
  /** Props mínimas válidas: punto de partida al crear un módulo desde la consola. */
  example: Record<string, unknown>;
  load: () => Promise<{ default: unknown }>;
  /** Modo presentación: si el módulo se parte en varias diapositivas, las props extra de cada una. */
  parts?: (props: Record<string, unknown>, ctx: ModuleContext) => Array<Record<string, unknown>>;
  /** Si devuelve true, el módulo no se enseña (p. ej. sin las cifras que tiene que poner el comercial). */
  hidden?: (props: Record<string, unknown>) => boolean;
}>;

export type BlockType = keyof typeof REGISTRY;

export function isBlockType(t: string): t is BlockType {
  return Object.prototype.hasOwnProperty.call(REGISTRY, t);
}
