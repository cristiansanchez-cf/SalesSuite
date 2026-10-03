import { z } from 'zod';
import { situationSchema } from '../admin/ops';
import { OBJECTIONS, STAGES } from '../playbook/types';

const key = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Clave: minúsculas, números y guiones');
const optText = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : s)).nullable().optional();
export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 62);

export const facetOptionSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).optional(),
  label: z.string().trim().min(1).max(60),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  hint: z.string().trim().max(200).optional(),
}).transform((o) => ({ ...o, key: o.key || slug(o.label) }));

export const facetInputSchema = z.object({
  key: key.optional(),
  label: z.string().trim().min(1, 'Pon un nombre a la faceta').max(60),
  question: optText(200),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().optional(),
  scope: z.enum(['account', 'contact']).default('account'),
  multi: z.boolean().default(false),
  weight: z.coerce.number().int().min(1).max(5).default(1),
  options: z.array(facetOptionSchema).min(1, 'Añade al menos una opción').max(40),
  status: z.enum(['official', 'archived']).default('official'),
}).transform((f) => ({ ...f, key: f.key || slug(f.label) }))
  .refine((f) => new Set(f.options.map((o) => o.key)).size === f.options.length, 'Hay opciones repetidas');
export type FacetInput = z.input<typeof facetInputSchema>;

export const storyInputSchema = z.object({
  outcome: z.enum(['won', 'lost']),
  segmentId: z.string().uuid().nullable().optional(),
  personaIds: z.array(z.string().uuid()).max(20).default([]),
  situation: situationSchema.default({}),
  playIds: z.array(z.string().uuid()).max(40).default([]),
  whatWorked: optText(2000),
  whatFailed: optText(2000),
  keyStage: z.enum(STAGES).nullable().optional(),
  objection: z.enum(OBJECTIONS).nullable().optional(),
});
export type StoryInput = z.input<typeof storyInputSchema>;

export const queryInputSchema = z.object({
  segmentId: z.string().uuid().nullable().optional(),
  personaIds: z.array(z.string().uuid()).max(20).default([]),
  situation: situationSchema.default({}),
  outcome: z.enum(['won', 'lost']).nullable().optional(),
});
export type QueryInput = z.input<typeof queryInputSchema>;
