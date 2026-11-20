/**
 * Cambiar el modelo de negocio con IA (docs/PAQUETES.md §Con IA). Criterio de Cristian: «las startups iteran rápido y
 * ponen productos nuevos… que sea fácil cambiarlo, quizá con un agente de IA». El admin cuenta el modelo nuevo con sus
 * palabras (o pega lo que tenga) y la IA propone los cambios en el catálogo de paquetes: crear, cambiar o desactivar,
 * cada uno con su porqué. Nada se aplica sin que lo marque. Como todo sale del catálogo (cierre, propuestas, Aprende,
 * la IA), cambiarlo aquí lo cambia en todas partes.
 * Lo puro (prompt, lectura y la versión de prueba) va probado; la llamada a Claude está aparte.
 */
import Anthropic from '@anthropic-ai/sdk';
import { meterClaude } from '../usage/meter';
import { TIERS, type Product, type Tier } from './packages';

export const MODEL_PLAN_MODEL = 'claude-sonnet-5-5';
export const MAX_MODEL_TEXT = 6000;

export interface PlanChange {
  action: 'create' | 'update' | 'deactivate';
  /** El paquete que cambia o se desactiva (su clave); null al crear. */
  key: string | null;
  name: string; summary: string | null; includes: string[];
  prices: Record<Tier, number | null>; period: Product['period'];
  freeAllowed: boolean; freeNote: string | null;
  /** Por qué, en una frase, para quien lo revisa. */
  why: string;
}
export interface ModelPlan { changes: PlanChange[]; summary: string }
export interface ModelPlanApi { plan(text: string, current: Product[], ctx: { seller: string }): Promise<ModelPlan | null> }

const NUM = { type: ['number', 'null'] } as const;
export const PLAN_TOOL = {
  name: 'save_plan',
  description: 'Guarda los cambios propuestos en el catálogo de paquetes. Llámala una vez, con todos.',
  input_schema: {
    type: 'object', required: ['changes', 'summary'],
    properties: {
      summary: { type: 'string', description: 'En dos frases, qué cambia en el modelo de negocio.' },
      changes: {
        type: 'array', description: 'Solo lo que cambia. Un paquete que sigue igual NO va.',
        items: {
          type: 'object',
          required: ['action', 'key', 'name', 'summary', 'includes', 'price_small', 'price_medium', 'price_large', 'period', 'free_allowed', 'free_note', 'why'],
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'deactivate'] },
            key: { type: ['string', 'null'], description: 'La clave del paquete actual si es update o deactivate; null si es create.' },
            name: { type: 'string', description: 'Nombre del paquete (corto).' },
            summary: { type: ['string', 'null'], description: 'Qué es, en una frase.' },
            includes: { type: 'array', items: { type: 'string' }, description: 'Lo que incluye, una cosa por elemento.' },
            price_small: { ...NUM, description: 'Precio para local pequeño. Si no lo dice, el actual (o null si es nuevo y no lo dice).' },
            price_medium: { ...NUM, description: 'Precio para local mediano. Igual.' },
            price_large: { ...NUM, description: 'Precio para local grande (y masivo). Igual.' },
            period: { type: 'string', enum: ['month', 'year', 'event', 'once'] },
            free_allowed: { type: 'boolean', description: 'Si se puede dar gratis.' },
            free_note: { type: ['string', 'null'], description: 'En qué condiciones va gratis, si se puede.' },
            why: { type: 'string', description: 'Por qué este cambio, citando lo que ha dicho.' },
          },
        },
      },
    },
  },
} as const;

export function planSystem(ctx: { seller: string }): string {
  return [
    `Ayudas al responsable de ${ctx.seller} a poner al día su catálogo de paquetes (lo que vende y a qué precio) cuando cambia su modelo de negocio.`,
    'Te paso el catálogo actual y lo que cuenta (puede ser un dictado con errores o un texto pegado). Propón los cambios con save_plan:',
    '- Solo lo que cambia: un paquete que sigue igual no va. Si un paquete deja de venderse, deactivate (no se borra).',
    '- Para update y deactivate usa la clave (key) del paquete actual; para create, key null.',
    '- En update, devuelve el paquete completo como debe quedar (lo que no cambia, igual que ahora).',
    '- Precios por tamaño de local: pequeño, mediano y grande (masivo paga como grande). No inventes precios: si no los dice, los actuales; si es nuevo y no los dice, null.',
    '- No inventes lo que incluye ni condiciones: solo lo que dice o lo que ya estaba.',
    '- Escribe como lo diría el equipo: nombres cortos, frases claras, sin adornos.',
  ].join('\n');
}

export function planPrompt(text: string, current: Product[]): string {
  const cat = current.map((p) => ({ key: p.key, name: p.name, summary: p.summary, includes: p.includes, prices: p.prices, period: p.period, freeAllowed: p.freeAllowed, freeNote: p.freeNote, active: p.active }));
  return ['Catálogo actual:', JSON.stringify(cat), '', 'Lo que cuenta (entre las marcas):', '<<<', text.slice(0, MAX_MODEL_TEXT), '>>>'].join('\n');
}

const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 100) / 100 : null);

/** Lo que devuelve la IA, con límites y contra el catálogo de verdad (las claves existen; un cambio que no cambia nada, fuera). */
export function readPlan(raw: unknown, current: Product[]): ModelPlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const changes = (Array.isArray(o.changes) ? o.changes : []).slice(0, 20).flatMap((x): PlanChange[] => {
    const r = (x ?? {}) as Record<string, unknown>;
    const action = r.action === 'create' || r.action === 'update' || r.action === 'deactivate' ? r.action : null;
    if (!action) return [];
    const cur = action === 'create' ? undefined : current.find((p) => p.key === r.key);
    if (action !== 'create' && !cur) return [];
    if (cur) { if (seen.has(cur.key)) return []; seen.add(cur.key); }
    const name = str(r.name, 60) ?? cur?.name;
    if (!name) return [];
    const ch: PlanChange = {
      action, key: cur?.key ?? null, name, summary: str(r.summary, 400) ?? cur?.summary ?? null,
      includes: (Array.isArray(r.includes) ? r.includes : cur?.includes ?? []).map((i) => str(i, 200)).filter((i): i is string => !!i).slice(0, 15),
      prices: Object.fromEntries(TIERS.map((t) => [t, price(r[`price_${t}`]) ?? (action === 'create' ? null : cur!.prices[t])])) as Record<Tier, number | null>,
      period: ['month', 'year', 'event', 'once'].includes(String(r.period)) ? (r.period as Product['period']) : cur?.period ?? 'month',
      freeAllowed: typeof r.free_allowed === 'boolean' ? r.free_allowed : cur?.freeAllowed ?? false,
      freeNote: str(r.free_note, 400) ?? (cur?.freeNote ?? null),
      why: str(r.why, 300) ?? '',
    };
    if (action === 'update' && cur && !differs(ch, cur)) return [];
    if (action === 'deactivate' && cur && !cur.active) return [];
    return [ch];
  });
  return { changes, summary: str(o.summary, 600) ?? '' };
}

/** Qué cambia de verdad en un update (para no proponer «cambios» que no cambian nada, y para enseñarlo). */
export function diffOf(ch: PlanChange, cur: Product | undefined): string[] {
  if (!cur) return [];
  const out: string[] = [];
  if (ch.name !== cur.name) out.push('name');
  if ((ch.summary ?? '') !== (cur.summary ?? '')) out.push('summary');
  if (ch.includes.join('\n') !== cur.includes.join('\n')) out.push('includes');
  for (const t of TIERS) if (ch.prices[t] !== cur.prices[t]) out.push(`price_${t}`);
  if (ch.period !== cur.period) out.push('period');
  if (ch.freeAllowed !== cur.freeAllowed || (ch.freeNote ?? '') !== (cur.freeNote ?? '')) out.push('free');
  if (!cur.active) out.push('active');
  return out;
}
const differs = (ch: PlanChange, cur: Product) => diffOf(ch, cur).length > 0;

// ---------------------------------------------------------------- Claude

export function claudeModelPlan(apiKey: string): ModelPlanApi {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  return {
    async plan(text, current, ctx) {
      const res = await client.messages.create({
        model: MODEL_PLAN_MODEL, max_tokens: 8000,
        system: planSystem(ctx),
        tools: [PLAN_TOOL as unknown as Anthropic.Tool],
        tool_choice: { type: 'tool', name: PLAN_TOOL.name },
        messages: [{ role: 'user', content: planPrompt(text, current) }],
      });
      await meterClaude('crm.model-plan', res.model || MODEL_PLAN_MODEL, res.usage);
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
      const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === PLAN_TOOL.name);
      return call ? readPlan(call.input, current) : null;
    },
  };
}

/**
 * Para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave): «mediano a 35» cambia el precio mediano de todos; «nuevo
 * paquete X: a, b, c a 30» lo crea; «quitamos X» lo desactiva. Sin llamar a nadie.
 */
export const fixtureModelPlan = (): ModelPlanApi => ({
  async plan(text, current) {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = norm(text);
    const raw: Array<Record<string, unknown>> = [];
    const gone = current.filter((p) => new RegExp(`quitamos ${norm(p.name).split(' ')[0]}`).test(t));
    const med = /mediano[s]? a (\d+)/.exec(t);
    if (med) for (const p of current.filter((x) => x.active && !gone.includes(x))) raw.push({ action: 'update', key: p.key, name: p.name, price_medium: Number(med[1]), why: `«${med[0]}»` });
    const nu = /nuevo paquete ([^:]+):\s*([^.]+?)\s+a (\d+)/i.exec(text);
    if (nu) raw.push({ action: 'create', key: null, name: nu[1]!.trim(), includes: nu[2]!.split(/,\s*/), price_small: Number(nu[3]), price_medium: Number(nu[3]), price_large: Number(nu[3]) * 2, period: 'month', free_allowed: false, why: `«${nu[0]}»` });
    for (const p of gone) raw.push({ action: 'deactivate', key: p.key, name: p.name, why: `«quitamos ${p.name}»` });
    return readPlan({ changes: raw, summary: 'Ejemplo de prueba (sin IA).' }, current);
  },
});
