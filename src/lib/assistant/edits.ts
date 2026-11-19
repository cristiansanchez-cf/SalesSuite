/**
 * Arreglar fichas por WhatsApp con IA (docs/ASSISTANT.md §Arreglar fichas). Criterio de Cristian: «le ha costado un
 * montón… he tenido que ponerlo exacto, palabra por palabra». Con reglas fijas solo valían frases exactas (y unas
 * comillas distintas lo rompían); la IA entiende lo que quiere cambiar, con sus palabras, de una o varias empresas:
 * nombre, ciudad, tipo (local, promotora…), descartar o recuperar, con qué local trabaja (promotora o DJ) y una nota.
 * No se guarda nada sin su «Guardar».
 */
import Anthropic from '@anthropic-ai/sdk';
import { NOTES_MODEL } from '../crm/notes';
import { meterClaude } from '../usage/meter';
import { fixCommand, saidName, saidPlace } from './flow';

export const DISCARDS = ['no_fit', 'not_interested', 'avoid', 'closed', 'partner'] as const;
export type DiscardReason = (typeof DISCARDS)[number];
export interface EditAsk {
  /** Cómo la nombra (su nombre de ahora, aunque esté mal). */
  target: string;
  rename: string | null;
  place: string | null;
  /** Clave del tipo del espacio (company, promotora, dj, marca…). */
  kind: string | null;
  discard: DiscardReason | null;
  discardWhy: string | null;
  restore: boolean;
  /** Con qué sitio trabaja (una promotora o un DJ en un local, o al revés). */
  linkTo: string | null;
  note: string | null;
}
export interface EditPlan { isEdit: boolean; edits: EditAsk[] }
export type EditReader = (text: string, ctx: { kinds: Array<{ key: string; label: string }>; today: string }) => Promise<EditPlan | null>;

/** Sin gastar IA en cada mensaje: solo si suena a arreglar fichas. */
export const EDIT_HINT = /(corr[ií]g|correg|arregl|cambi|edit|renombr|descart|recuper|vincul|enlaz|es (?:una|un) (?:promotora|local|dj|marca|discoteca|sala|empresa)|no es (?:una|un) |son (?:una|un) |de tipo|tipo de|ubicaci|se llama|est[aá] en|pertenece|trabaja (?:en|con)|es su promotora)/iu;

const S = { type: 'string' } as const;
const SN = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const schema = (kinds: string[]) => ({
  type: 'object', additionalProperties: false, required: ['is_edit', 'edits'],
  properties: {
    is_edit: { type: 'boolean', description: 'true si pide ARREGLAR o CAMBIAR fichas que ya existen en el CRM (nombre, ciudad, tipo, descartar, vincular). false si cuenta una visita, una conversación o algo nuevo que apuntar.' },
    edits: {
      type: 'array', description: 'Un elemento por empresa a cambiar.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['target', 'rename', 'place', 'kind', 'discard', 'discard_why', 'restore', 'link_to', 'note'],
        properties: {
          target: { ...S, description: 'Cómo se llama AHORA la ficha (tal como la nombra, sin comillas; si dice que el nombre de ahora está mal, el nombre de ahora completo).' },
          rename: { ...SN, description: 'El nombre bueno, solo si pide cambiarlo.' },
          place: { ...SN, description: 'La ciudad o pueblo donde está, solo si lo dice o lo corrige (p. ej. «Torrejón de Ardoz»).' },
          kind: { ...SN, description: `El tipo, solo si dice qué es: ${kinds.join(' | ')}.` },
          discard: { ...SN, description: 'Si pide descartarla o darla por perdida: no_fit (no encaja) | not_interested (no les interesa) | avoid (mejor no ir) | closed (ha cerrado) | partner (posible alianza). null si no.' },
          discard_why: { ...SN, description: 'Por qué, con sus palabras, si la descarta.' },
          restore: { type: 'boolean', description: 'true solo si pide recuperar una descartada.' },
          link_to: { ...SN, description: 'Con qué otro sitio trabaja o a cuál pertenece (p. ej. la promotora interna de un local → el local), si lo dice.' },
          note: { ...SN, description: 'Lo que cuenta de esa empresa que conviene dejar apuntado (p. ej. «por Instagram dijeron que les interesaba, pero el local dijo que no»), con sus palabras. null si no hay nada.' },
        },
      },
    },
  },
} as const);

const PROMPT = (ctx: { kinds: Array<{ key: string; label: string }>; today: string }) => `Eres el asistente del CRM de un equipo comercial. Hoy es ${ctx.today}.
Decide si el mensaje pide ARREGLAR o CAMBIAR fichas que ya existen (nombre mal puesto, ciudad equivocada, qué tipo es, descartarla o darla por perdida, con qué local trabaja una promotora) y, si es así, saca los cambios de cada empresa.
Tipos del CRM: ${ctx.kinds.map((k) => `${k.key} (${k.label})`).join(', ')}.
No inventes: lo que no diga, null. Las comillas («», “”, "") solo marcan nombres.`;

export function claudeEditReader(apiKey: string): EditReader {
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  return async (text, ctx) => {
    const res = await client.messages.create({
      model: NOTES_MODEL, max_tokens: 2000,
      system: PROMPT(ctx),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(ctx.kinds.map((k) => k.key)) } },
      messages: [{ role: 'user', content: text.slice(0, 6000) }],
    } as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;
    await meterClaude('assistant.edit', res.model || NOTES_MODEL, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    const raw = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try { return cleanPlan(JSON.parse(raw), ctx.kinds.map((k) => k.key)); } catch { return null; }
  };
}

const str = (v: unknown, n = 160) => (typeof v === 'string' && v.trim() ? v.trim().replace(/^[«“"']+|[»”"']+$/g, '').slice(0, n) : null);
/** Lo que vuelve, con límites (no fiarse de la forma). */
export function cleanPlan(x: unknown, kinds: string[]): EditPlan {
  const o = (x ?? {}) as Record<string, unknown>;
  const edits = (Array.isArray(o.edits) ? o.edits : []).slice(0, 10).flatMap((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    const target = str(r.target);
    if (!target) return [];
    const kind = typeof r.kind === 'string' && kinds.includes(r.kind) ? r.kind : null;
    const discard = (DISCARDS as readonly string[]).includes(String(r.discard)) ? (r.discard as DiscardReason) : null;
    const ask: EditAsk = {
      target, rename: str(r.rename), place: str(r.place, 80), kind, discard, discardWhy: discard ? str(r.discard_why, 300) : null,
      restore: r.restore === true && !discard, linkTo: str(r.link_to), note: str(r.note, 1000),
    };
    return ask.rename || ask.place || ask.kind || ask.discard || ask.restore || ask.linkTo || ask.note ? [ask] : [];
  });
  return { isEdit: o.is_edit === true && edits.length > 0, edits };
}

/** Demo y pruebas (AI_RESEARCH_FIXTURE=1): las frases de siempre, sin IA. */
export const fixtureEditReader: EditReader = async (text, ctx) => {
  const f = fixCommand(text);
  const base: EditAsk = { target: '', rename: null, place: null, kind: null, discard: null, discardWhy: null, restore: false, linkTo: null, note: null };
  if (f) return { isEdit: true, edits: [{ ...base, target: f.target, rename: saidName(f.change), place: saidPlace(f.change) ?? (saidPlace(f.target) && !saidName(f.change) ? null : saidPlace(f.target)) }] };
  // «Descarta X y Y: no les interesa. Y es una promotora de X.»
  const m = /^\s*descarta\s+(.+?)\s*:\s*(.+)$/isu.exec(text);
  if (!m) return { isEdit: false, edits: [] };
  const names = m[1]!.split(/\s*(?:,|\by\b)\s*/u).map((x) => x.trim()).filter(Boolean);
  const promoter = /(?:^|[.;]\s*)([^.;]+?) es (?:la |una |su )?promotora(?: interna)?(?: de (.+?))?(?:[.,;]|$)/iu.exec(m[2]!);
  const k = (key: string) => (ctx.kinds.some((x) => x.key === key) ? key : null);
  return {
    isEdit: true,
    edits: names.map((n) => ({
      ...base, target: n, discard: 'not_interested' as const, discardWhy: m[2]!.split(/[.;]/)[0]!.trim(),
      ...(promoter && promoter[1]!.trim().toLowerCase() === n.toLowerCase() ? { kind: k('promotora'), linkTo: promoter[2]?.trim() ?? null } : {}),
    })),
  };
};
