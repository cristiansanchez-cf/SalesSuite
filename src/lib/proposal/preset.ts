/**
 * Propuesta por sector (docs/PROPOSAL_PRESETS.md). Un sector trae su receta: bloques (un módulo del catálogo con sus
 * textos), dos modos (argumentario: convence sola; apoyo visual: el comercial lo cuenta), elecciones de una sola opción
 * (tipo de cliente, ángulo) y preguntas de sí/no. Cada opción o pregunta trae reglas que añaden, quitan, cambian o
 * retocan bloques. Al final, si pasa del tope, se recorta por prioridad. Puro y determinista: lo usan el editor, las
 * muestras y el alta.
 */
import { z } from 'zod';

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
/** Una respuesta: la clave de una pregunta («dj») o «elección:opción» («angulo:d»). */
const answer = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}(:[a-z0-9][a-z0-9-]{0,62})?$/);

export const PRESET_MODES = ['full', 'visual'] as const;
export type PresetMode = (typeof PRESET_MODES)[number];

const anchor = z.union([key, z.array(key).min(1).max(8)]);
/** `when`: la regla solo vale si además está esa respuesta (p. ej. «angulo:d»). */
const when = { when: answer.optional() };
const rule = z.union([
  z.object({ add: key, after: anchor.optional(), before: anchor.optional(), ...when }).strict(),
  z.object({ remove: key, ...when }).strict(),
  z.object({ replace: key, with: key, ...when }).strict(),
  z.object({ patch: key, set: z.record(z.string(), z.unknown()), ...when }).strict(),
  /** Mete un elemento en una lista de los textos del bloque (p. ej. una escena en la 2.ª posición). */
  z.object({ insert: key, into: z.string().min(1).max(40), at: z.number().int().min(0).max(20), value: z.unknown(), ...when }).strict(),
]);
export type PresetRule = z.infer<typeof rule>;

const option = z.object({ key, label: z.string().min(1).max(80), hint: z.string().max(300).optional(), rules: z.array(rule).max(20).default([]) });

export const proposalSchema = z.object({
  /** Bloques: id local → módulo del catálogo (por clave) y sus textos para este sector. */
  blocks: z.record(key, z.object({ module: key, props: z.record(z.string(), z.unknown()).default({}) })),
  modes: z.object({ full: z.array(key).min(1).max(12), visual: z.array(key).min(1).max(12).optional() }),
  /** Tope de bloques por modo y orden de prioridad para recortar (los que no están, los primeros en salir). */
  max: z.object({ full: z.number().int().min(1).max(20).optional(), visual: z.number().int().min(1).max(20).optional() }).default({}),
  priority: z.array(key).max(30).default([]),
  /** Elecciones de una sola opción, en orden (tipo de cliente, luego ángulo). `when`: solo si otra respuesta está. */
  choices: z.array(z.object({
    key, label: z.string().min(1).max(80), hint: z.string().max(300).optional(),
    default: key, options: z.array(option).min(2).max(10),
    when: z.array(answer).max(10).optional(),
  })).max(4).default([]),
  questions: z.array(option.extend({ rules: z.array(rule).min(1).max(20), when: z.array(answer).max(10).optional() })).max(16).default([]),
}).strict().superRefine((p, c) => {
  const ids = new Set(Object.keys(p.blocks));
  const check = (id: string, where: string) => { if (!ids.has(id)) c.addIssue({ code: 'custom', message: `${where}: el bloque «${id}» no existe` }); };
  const anchors = (a: string | string[] | undefined) => (a === undefined ? [] : Array.isArray(a) ? a : [a]);
  p.modes.full.forEach((b) => check(b, 'modes.full'));
  p.modes.visual?.forEach((b) => check(b, 'modes.visual'));
  p.priority.forEach((b) => check(b, 'priority'));
  const rules = (rs: PresetRule[], w: string) => rs.forEach((r) => {
    if ('add' in r) { check(r.add, w); [...anchors(r.after), ...anchors(r.before)].forEach((a) => check(a, w)); }
    if ('remove' in r) check(r.remove, w);
    if ('replace' in r) { check(r.replace, w); check(r.with, w); }
    if ('patch' in r) check(r.patch, w);
    if ('insert' in r) check(r.insert, w);
  });
  for (const ch of p.choices) {
    if (!ch.options.some((o) => o.key === ch.default)) c.addIssue({ code: 'custom', message: `choices.${ch.key}: la opción por defecto «${ch.default}» no existe` });
    ch.options.forEach((o) => rules(o.rules, `choices.${ch.key}.${o.key}`));
  }
  p.questions.forEach((q) => rules(q.rules, `questions.${q.key}`));
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Lectura tolerante desde la base de datos: una receta mal formada no rompe nada (se ignora). */
export function parseProposal(raw: unknown): Proposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = proposalSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Lo que el editor necesita saber (sin los textos): modos, elecciones y preguntas. */
export interface ProposalLite {
  hasVisual: boolean;
  choices: Array<{ key: string; label: string; hint?: string; default: string; when?: string[]; options: Array<{ key: string; label: string; hint?: string }> }>;
  questions: Array<{ key: string; label: string; hint?: string; when?: string[] }>;
}
export const liteOf = (p: Proposal | null | undefined): ProposalLite | null =>
  p ? {
    hasVisual: !!p.modes.visual,
    choices: p.choices.map((c) => ({ key: c.key, label: c.label, hint: c.hint, default: c.default, when: c.when, options: c.options.map(({ key: k, label, hint }) => ({ key: k, label, hint })) })),
    questions: p.questions.map(({ key: k, label, hint, when: w }) => ({ key: k, label, hint, when: w })),
  } : null;

/**
 * Las respuestas que cuentan: en cada elección, la opción marcada (o la de por defecto) si la elección aplica; las
 * preguntas marcadas que aplican. Lo que no existe o no aplica, fuera. Sirve también para guardar lo elegido.
 */
export interface AnswerShape {
  choices: Array<{ key: string; default: string; when?: string[]; options: Array<{ key: string }> }>;
  questions: Array<{ key: string; when?: string[] }>;
}
export function effectiveAnswers(p: AnswerShape, answers: string[]): string[] {
  const out: string[] = [];
  const has = (a: string) => out.includes(a);
  const applies = (w?: string[]) => !w?.length || w.some(has);
  for (const ch of p.choices) {
    if (!applies(ch.when)) continue;
    const picked = answers.find((a) => a.startsWith(`${ch.key}:`))?.slice(ch.key.length + 1);
    out.push(`${ch.key}:${ch.options.some((o) => o.key === picked) ? picked : ch.default}`);
  }
  for (const q of p.questions) if (answers.includes(q.key) && applies(q.when)) out.push(q.key);
  return out;
}

export interface PlannedBlock { block: string; module: string; props: Record<string, unknown> }

/** La lista final de bloques, en orden, para un modo y unas respuestas. */
export function planProposal(p: Proposal, mode: PresetMode, answers: string[]): PlannedBlock[] {
  let list = [...(mode === 'visual' && p.modes.visual ? p.modes.visual : p.modes.full)];
  const on = new Set(effectiveAnswers(p, answers));
  const edits = new Map<string, Array<Extract<PresetRule, { patch: string }> | Extract<PresetRule, { insert: string }>>>();
  const first = (a: string | string[] | undefined) => (a === undefined ? undefined : (Array.isArray(a) ? a : [a]).find((x) => list.includes(x)));
  const apply = (r: PresetRule) => {
    if (r.when && !on.has(r.when)) return;
    if ('add' in r) {
      if (list.includes(r.add)) return;
      const after = first(r.after);
      const before = first(r.before);
      const at = after ? list.indexOf(after) + 1 : before ? list.indexOf(before) : list.length;
      list.splice(at, 0, r.add);
    } else if ('remove' in r) list = list.filter((b) => b !== r.remove);
    else if ('replace' in r) list = list.map((b) => (b === r.replace ? r.with : b)).filter((b, i, a) => a.indexOf(b) === i);
    else {
      const k = 'patch' in r ? r.patch : r.insert;
      edits.set(k, [...(edits.get(k) ?? []), r]);
    }
  };
  for (const ch of p.choices) {
    const picked = [...on].find((a) => a.startsWith(`${ch.key}:`));
    ch.options.find((o) => `${ch.key}:${o.key}` === picked)?.rules.forEach(apply);
  }
  for (const q of p.questions) if (on.has(q.key)) q.rules.forEach(apply);

  // Tope: lo que no cabe se queda fuera (no se comprime), empezando por lo de menos prioridad.
  const max = p.max[mode] ?? (mode === 'visual' ? p.max.full : undefined);
  if (max && list.length > max) {
    const rank = (b: string) => { const i = p.priority.indexOf(b); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const keep = new Set([...list].sort((a, b) => rank(a) - rank(b) || list.indexOf(a) - list.indexOf(b)).slice(0, max));
    list = list.filter((b) => keep.has(b));
  }

  return list.map((b) => {
    let props: Record<string, unknown> = { ...p.blocks[b].props };
    for (const e of edits.get(b) ?? []) {
      if ('patch' in e) props = { ...props, ...e.set };
      else {
        const arr = Array.isArray(props[e.into]) ? [...(props[e.into] as unknown[])] : [];
        arr.splice(Math.min(e.at, arr.length), 0, e.value);
        props = { ...props, [e.into]: arr };
      }
    }
    return { block: b, module: p.blocks[b].module, props };
  });
}

export const presetInputSchema = z.object({
  mode: z.enum(PRESET_MODES).default('full'),
  answers: z.array(answer).max(20).default([]),
});
export type PresetChoice = z.infer<typeof presetInputSchema>;
export const ANSWER_RE = /^[a-z0-9][a-z0-9-]{0,62}(:[a-z0-9][a-z0-9-]{0,62})?$/;
