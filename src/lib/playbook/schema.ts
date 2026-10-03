import { z } from 'zod';
import { OBJECTIONS, PLAY_KINDS, STAGES } from './types';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : s)).nullable().optional();
const uuid = z.string().uuid();

export const techniqueRefSchema = z.object({
  source: z.literal('cerebro'),
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  creator: z.string().trim().max(120).optional(),
  url: z.string().url().refine((u) => /^https:\/\//.test(u), 'https').optional(),
}).strict();

export const playInputSchema = z.object({
  moduleId: uuid.nullable(),
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/).nullable().optional(),
  kind: z.enum(PLAY_KINDS),
  stage: z.enum(STAGES).nullable().optional(),
  objection: z.enum(OBJECTIONS).nullable().optional(),
  segments: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/)).max(10).default([]),
  title: text(200).min(1, 'El título es obligatorio'),
  body: text(8000).default(''),
  whenToUse: optText(1000),
  whyItWorks: optText(2000),
  techniqueRefs: z.array(techniqueRefSchema).max(10).default([]),
  status: z.enum(['draft', 'official']).default('official'),
});
export type PlayInput = z.infer<typeof playInputSchema>;

export const tipInputSchema = z.object({
  moduleId: uuid.nullable(),
  playId: uuid.nullable().optional(),
  kind: z.enum(PLAY_KINDS).default('tip'),
  title: text(200).min(1, 'Ponle un título corto'),
  body: text(4000).min(1, 'Cuenta qué haces y qué pasó'),
});

export const changeInputSchema = z.object({
  playId: uuid,
  /** Motivo corto del cambio (pasa a ser la nota de la revisión). */
  title: text(200).min(1, 'Explica en una línea qué mejora'),
  /** Nuevo texto propuesto para la jugada. */
  body: text(8000).min(1, 'Escribe el texto propuesto'),
});

export const voteSchema = z.object({
  targetType: z.enum(['play', 'contribution']),
  targetId: uuid,
  verdict: z.enum(['worked', 'didnt']).nullable(),
  dossierId: uuid.nullable().optional(),
  note: optText(500),
});
