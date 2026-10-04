/**
 * Propuesta por sector (docs/PROPOSAL_PRESETS.md). Un sector trae su receta: bloques (un módulo del catálogo con sus
 * textos), dos modos (argumentario: convence sola; apoyo visual: el comercial lo cuenta) y preguntas de sí/no que
 * añaden, quitan, cambian o retocan bloques. Puro y determinista: lo usan el editor, las muestras y el alta.
 */
import { z } from 'zod';

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const PRESET_MODES = ['full', 'visual'] as const;
export type PresetMode = (typeof PRESET_MODES)[number];

const rule = z.union([
  z.object({ add: key, after: key.optional(), before: key.optional() }).strict(),
  z.object({ remove: key }).strict(),
  z.object({ replace: key, with: key }).strict(),
  z.object({ patch: key, set: z.record(z.string(), z.unknown()) }).strict(),
]);
export type PresetRule = z.infer<typeof rule>;

export const proposalSchema = z.object({
  /** Bloques: id local → módulo del catálogo (por clave) y sus textos para este sector. */
  blocks: z.record(key, z.object({ module: key, props: z.record(z.string(), z.unknown()).default({}) })),
  modes: z.object({ full: z.array(key).min(1).max(12), visual: z.array(key).min(1).max(12).optional() }),
  questions: z.array(z.object({
    key, label: z.string().min(1).max(80), hint: z.string().max(200).optional(),
    rules: z.array(rule).min(1).max(12),
  })).max(12).default([]),
}).strict().superRefine((p, c) => {
  const ids = new Set(Object.keys(p.blocks));
  const check = (id: string, where: string) => { if (!ids.has(id)) c.addIssue({ code: 'custom', message: `${where}: el bloque «${id}» no existe` }); };
  p.modes.full.forEach((b) => check(b, 'modes.full'));
  p.modes.visual?.forEach((b) => check(b, 'modes.visual'));
  for (const q of p.questions) for (const r of q.rules) {
    const w = `questions.${q.key}`;
    if ('add' in r) { check(r.add, w); if (r.after) check(r.after, w); if (r.before) check(r.before, w); }
    if ('remove' in r) check(r.remove, w);
    if ('replace' in r) { check(r.replace, w); check(r.with, w); }
    if ('patch' in r) check(r.patch, w);
  }
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Lectura tolerante desde la base de datos: una receta mal formada no rompe nada (se ignora). */
export function parseProposal(raw: unknown): Proposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = proposalSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Lo que el editor necesita saber (sin los textos): modos disponibles y preguntas. */
export interface ProposalLite { hasVisual: boolean; questions: Array<{ key: string; label: string; hint?: string }> }
export const liteOf = (p: Proposal | null | undefined): ProposalLite | null =>
  p ? { hasVisual: !!p.modes.visual, questions: p.questions.map(({ key: k, label, hint }) => ({ key: k, label, hint })) } : null;

export interface PlannedBlock { block: string; module: string; props: Record<string, unknown> }

/** La lista final de bloques, en orden, para un modo y unas respuestas (las preguntas se aplican en su orden). */
export function planProposal(p: Proposal, mode: PresetMode, answers: string[]): PlannedBlock[] {
  let list = [...(mode === 'visual' && p.modes.visual ? p.modes.visual : p.modes.full)];
  const patches = new Map<string, Record<string, unknown>>();
  const on = new Set(answers);
  for (const q of p.questions) {
    if (!on.has(q.key)) continue;
    for (const r of q.rules) {
      if ('add' in r) {
        if (list.includes(r.add)) continue;
        const at = r.after && list.includes(r.after) ? list.indexOf(r.after) + 1 : r.before && list.includes(r.before) ? list.indexOf(r.before) : list.length;
        list.splice(at, 0, r.add);
      } else if ('remove' in r) list = list.filter((b) => b !== r.remove);
      else if ('replace' in r) list = list.map((b) => (b === r.replace ? r.with : b)).filter((b, i, a) => a.indexOf(b) === i);
      else patches.set(r.patch, { ...(patches.get(r.patch) ?? {}), ...r.set });
    }
  }
  return list.map((b) => ({ block: b, module: p.blocks[b].module, props: { ...p.blocks[b].props, ...(patches.get(b) ?? {}) } }));
}

export const presetInputSchema = z.object({
  mode: z.enum(PRESET_MODES).default('full'),
  answers: z.array(key).max(12).default([]),
});
export type PresetChoice = z.infer<typeof presetInputSchema>;
