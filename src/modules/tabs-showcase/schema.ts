import { z } from 'zod';

const chatMock = z.object({
  kind: z.literal('chat'),
  header: z.string().max(40).default(''),
  messages: z.array(z.object({ from: z.enum(['me', 'them']), text: z.string().min(1).max(160) })).min(1).max(8),
});
const imageMock = z.object({
  kind: z.literal('image'),
  src: z.string().refine((u) => /^(https:\/\/|\/)/.test(u), 'https o ruta absoluta'),
  alt: z.string().max(140),
});

export const tabsShowcaseSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(120),
  tabs: z.array(z.object({
    label: z.string().min(1).max(30),
    title: z.string().min(1).max(100),
    body: z.string().max(400).default(''),
    bullets: z.array(z.string().max(100)).max(5).default([]),
    mock: z.discriminatedUnion('kind', [chatMock, imageMock]).optional(),
  })).min(1).max(6),
  /** 0 = sin auto-advance. */
  autoAdvanceMs: z.number().int().min(0).max(30000).default(3500),
});

export type TabsShowcaseProps = z.infer<typeof tabsShowcaseSchema>;
