import { z } from 'zod';
import { AUDIENCES, OBJECTIONS, PLAY_KINDS, STAGES } from './types';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).transform((s) => (s === '' ? null : s)).nullable().optional();
const uuid = z.string().uuid();

export const techniqueRefSchema = z.object({
  source: z.literal('cerebro'),
  id: z.number().int().positive().optional(),  // id de ficha del Cerebro, si se conoce (los manuales a veces solo traen el enlace)
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
  segments: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,63}$/)).max(10).default([]),
  personas: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,63}$/)).max(20).default([]),
  audience: z.enum(AUDIENCES).default('all'),
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


// ---------------------------------------------------------------- mapa de mercado
import { PERSONA_ROLES } from './market';

const key = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Clave: minúsculas, números y guiones');

export const segmentInputSchema = z.object({
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().optional(),
  key,
  name: text(80).min(1, 'Nombre obligatorio'),
  description: optText(1000),
  valueProp: optText(1000),
  icp: optText(2000),
  disqualifiers: optText(1000),
  buyingProcess: optText(2000),
  dealSize: optText(200),
  salesCycle: optText(200),
  status: z.enum(['official', 'draft', 'archived']).default('official'),
});

export const personaInputSchema = z.object({
  segmentId: uuid,
  key,
  name: text(80).min(1, 'Nombre del actor obligatorio'),
  role: z.enum(PERSONA_ROLES),
  goals: optText(2000),
  pains: optText(2000),
  kpis: optText(1000),
  objections: z.array(z.enum(OBJECTIONS)).max(7).default([]),
  howToApproach: optText(2000),
  avoid: optText(1000),
  canHelp: optText(1000),
  canBlock: optText(1000),
});

export const MESSAGE_TYPES = {
  primer_contacto: { label: 'Primer contacto', etapa: 'Primer contacto', ask: 'el primer mensaje de contacto' },
  tras_reunion: { label: 'Después de la reunión o demo', etapa: 'Seguimiento', ask: 'un mensaje de seguimiento tras la reunión, con el enlace a la propuesta' },
  seguimiento: { label: 'Seguimiento: no ha respondido', etapa: 'Seguimiento', ask: 'un mensaje de seguimiento porque no ha respondido' },
  objecion: { label: 'Responder a una objeción', etapa: 'Objeciones', ask: 'la respuesta a su objeción' },
  cierre: { label: 'Pedir la decisión / cerrar', etapa: 'Cierre', ask: 'un mensaje para cerrar y pedir la decisión con una fecha concreta' },
  reactivar: { label: 'Reactivar una cuenta fría', etapa: 'Seguimiento', ask: 'un mensaje para reactivar el contacto tras semanas sin hablar' },
} as const;
export type MessageType = keyof typeof MESSAGE_TYPES;
export const CHANNELS = { whatsapp: 'WhatsApp', email: 'email', linkedin: 'LinkedIn', llamada: 'llamada (guion hablado)' } as const;

export const contextInputSchema = z.object({
  segmentId: uuid.nullable().optional(),
  personaId: uuid.nullable().optional(),
  dossierId: uuid.nullable().optional(),
  contactId: uuid.nullable().optional(),
  messageType: z.enum(Object.keys(MESSAGE_TYPES) as [MessageType, ...MessageType[]]).default('primer_contacto'),
  channel: z.enum(Object.keys(CHANNELS) as [keyof typeof CHANNELS, ...(keyof typeof CHANNELS)[]]).default('whatsapp'),
  objection: z.enum(OBJECTIONS).nullable().optional(),
  notes: optText(1500),
});
export type ContextInput = z.infer<typeof contextInputSchema>;
