/**
 * Limpiar el CRM con IA (docs/CRM_DINAMICO.md §17): para cada empresa, la IA dice si es una empresa de verdad o un DJ
 * (artista que trabaja por su cuenta) y si habría que descartarla (no es del sector, posible alianza, duplicada,
 * cerrada), con un porqué corto. Solo propone: el admin revisa, desmarca y aplica (con deshacer).
 */
import Anthropic from '@anthropic-ai/sdk';
import { ACCOUNT_KINDS, DISCARD_REASONS, type AccountKind, type DiscardReason } from '../accounts/types';

export interface CleanupInput {
  id: string; name: string; city: string | null; notes: string | null; website: string | null; instagram: string | null; email: string | null;
  tags: string[]; sector: string | null;
}
export interface CleanupSuggestion { id: string; kind: AccountKind; discard: DiscardReason | null; why: string }
export interface CleanupContext { seller: string; clients: string[] }
export interface CleanupApi { classify(items: CleanupInput[], ctx: CleanupContext): Promise<CleanupSuggestion[]> }

const S = { type: 'string' } as const;
const SN = { type: ['string', 'null'] } as const;
export const CLEANUP_TOOL = {
  name: 'save_cleanup',
  description: 'Guarda la propuesta para todas las empresas, una por empresa.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'kind', 'discard', 'why'],
          properties: {
            id: S,
            kind: { ...S, description: 'company | dj' },
            discard: { ...SN, description: 'null (se queda) | not_sector | partner | duplicate | closed | other' },
            why: { ...S, description: 'Por qué, en una frase corta en español (máx. 120 caracteres), con lo que dicen los datos.' },
          },
        },
      },
    },
  },
} as const;

export const CLEANUP_SYSTEM = (ctx: CleanupContext) => `Revisas el CRM de ${ctx.seller}. Sus clientes posibles son: ${ctx.clients.join(', ') || 'locales, salas, discotecas, promotoras, festivales y organizadores de conciertos y eventos'}.
Para cada registro (empresa importada de un Notion y de ferias del sector) devuelve:
- kind: «dj» si es un DJ, artista o productor musical que trabaja por su cuenta (una persona con nombre artístico). «company» si es una empresa, un local, una promotora, una agencia o cualquier negocio, aunque tenga «DJ» en el nombre si es una empresa de servicios (p. ej. una empresa de DJs para bodas).
- discard (si habría que sacarlo de la lista de ventas; null si puede ser cliente o si no está claro):
  · «partner»: es del sector de la música o los eventos pero no es cliente: tienda de música, sello, productora audiovisual o de visuales, agencia de management, medio, escuela, proveedor de sonido o luces. Puede servir para una alianza.
  · «not_sector»: no tiene que ver con la música ni los eventos.
  · «closed»: los datos dicen que ha cerrado.
  · «duplicate»: es claramente el mismo negocio que otro de esta misma tanda (descarta la copia con menos datos).
  · «other»: otra razón clara (dila en «why»).
  Un DJ no se descarta por ser DJ: kind «dj» y discard null.
- why: el porqué en una frase corta, basándote solo en los datos que tienes (nombre, notas, web, Instagram, listas, sector). No inventes. Si no está claro, «company», null y «No está claro con estos datos».`;

/** Solo lo que vale: ids de la tanda, tipos y motivos conocidos, frase corta. */
export function sanitizeCleanup(raw: unknown, items: CleanupInput[]): CleanupSuggestion[] {
  const ids = new Set(items.map((x) => x.id));
  const list = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const out = new Map<string, CleanupSuggestion>();
  for (const x of list) {
    const r = x as Record<string, unknown>;
    const id = String(r?.id ?? '');
    if (!ids.has(id) || out.has(id)) continue;
    const kind = (ACCOUNT_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as AccountKind) : 'company';
    const discard = (DISCARD_REASONS as readonly string[]).includes(String(r.discard)) ? (r.discard as DiscardReason) : null;
    out.set(id, { id, kind, discard, why: String(r.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) });
  }
  return [...out.values()];
}

export const CLEANUP_MODEL = 'claude-opus-5-5';
export function claudeCleanup(apiKey: string, fetchImpl?: typeof fetch): CleanupApi {
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return {
    async classify(items, ctx) {
      const stream = client.beta.messages.stream({
        model: CLEANUP_MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low' },
        system: CLEANUP_SYSTEM(ctx),
        tools: [CLEANUP_TOOL as unknown as Anthropic.Beta.BetaTool],
        messages: [{ role: 'user', content: `Registros (JSON):\n${JSON.stringify(items)}\n\nLlama a save_cleanup con todos.` }],
      });
      const res = await stream.finalMessage();
      if (res.stop_reason === 'refusal') return [];
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === CLEANUP_TOOL.name);
      return call ? sanitizeCleanup(call.input, items) : [];
    },
  };
}

/** Para las pruebas (AI_RESEARCH_FIXTURE=1, sin clave): reglas simples por el nombre, sin llamar a nadie. */
export const fixtureCleanup = (): CleanupApi => ({
  async classify(items) {
    return items.map((x) => {
      const n = x.name.toLowerCase();
      if (/\bdj\b/.test(n) && !/(eventos|bodas|s\.l\.|sl\b|events)/.test(n)) return { id: x.id, kind: 'dj' as const, discard: null, why: 'Nombre de DJ: trabaja por su cuenta.' };
      if (/(tienda|records|shop|sello)/.test(n)) return { id: x.id, kind: 'company' as const, discard: 'partner' as const, why: 'Tienda de música: no es cliente, puede ser alianza.' };
      if (/(seguros|inmobiliaria|asesor)/.test(n)) return { id: x.id, kind: 'company' as const, discard: 'not_sector' as const, why: 'No tiene que ver con música ni eventos.' };
      return { id: x.id, kind: 'company' as const, discard: null, why: 'Puede ser cliente.' };
    });
  },
});
