/**
 * Lo que cuesta cada cosa (docs/COSTES.md), en dólares. Claude: la tabla oficial de precios de Anthropic
 * (platform.claude.com/docs/en/about-claude/pricing, consultada el 3 de noviembre de 2026). Lo demás son estimaciones
 * que se ajustan con variables de entorno, sin tocar el código (USAGE_PRICE_*).
 * El coste se calcula al apuntar el consumo: si un precio cambia, lo ya apuntado no se recalcula.
 */
import { env } from '../env';

/** Por millón de tokens. */
export interface TokenPrice { input: number; cacheWrite: number; cacheRead: number; output: number }
interface ModelPrice { base: TokenPrice; /** Haiku 5.5: más caro si el prompt pasa de 100.000 tokens. */ long?: { above: number; price: TokenPrice } }

export const CLAUDE_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-5-5': {
    base: { input: 0.10, cacheWrite: 0.125, cacheRead: 0.01, output: 0.50 },
    long: { above: 100_000, price: { input: 0.50, cacheWrite: 0.625, cacheRead: 0.05, output: 2.50 } },
  },
  'claude-sonnet-5-5': { base: { input: 2, cacheWrite: 2.50, cacheRead: 0.10, output: 10 } },
  'claude-opus-5-5': { base: { input: 4, cacheWrite: 5, cacheRead: 0.20, output: 20 } },
};
/** Búsqueda web de Claude: 10 $ cada 1.000. */
export const WEB_SEARCH_USD = 10 / 1000;

const num = (name: string, fallback: number) => {
  const v = Number(env(name));
  return Number.isFinite(v) && v >= 0 && env(name) ? v : fallback;
};
/** Lo que no es Claude: estimaciones ajustables. */
export function unitPrices() {
  return {
    /** Whisper de OpenAI: 0,006 $ por minuto de audio. */
    whisperPerMinute: num('USAGE_PRICE_WHISPER_MINUTE', 0.006),
    /** Plantilla de WhatsApp (Utility) en España. Las respuestas dentro de las 24 horas no se cobran. */
    waUtility: num('USAGE_PRICE_WA_UTILITY', 0.02),
    waMarketing: num('USAGE_PRICE_WA_MARKETING', 0.0615),
    /** Un correo por Resend (plan Pro: 20 $ por 50.000). */
    email: num('USAGE_PRICE_EMAIL', 0.0004),
    /** Una llamada a la API de medios de Instagram/TikTok (CONVERT_API_KEY). */
    mediaCall: num('USAGE_PRICE_MEDIA_CALL', 0),
  };
}

export interface ClaudeUsage {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}
export const tokensOf = (u: ClaudeUsage | null | undefined) => ({
  input: Math.max(0, Math.round(u?.input_tokens ?? 0)),
  output: Math.max(0, Math.round(u?.output_tokens ?? 0)),
  cacheWrite: Math.max(0, Math.round(u?.cache_creation_input_tokens ?? 0)),
  cacheRead: Math.max(0, Math.round(u?.cache_read_input_tokens ?? 0)),
  webSearches: Math.max(0, Math.round(u?.server_tool_use?.web_search_requests ?? 0)),
});

/** El coste de una respuesta de Claude. Un modelo que no está en la tabla cuenta como el más caro conocido (mejor pasarse). */
export function claudeCost(model: string, u: ClaudeUsage | null | undefined): number {
  const t = tokensOf(u);
  const known = CLAUDE_PRICES[model] ?? CLAUDE_PRICES[Object.keys(CLAUDE_PRICES).find((k) => model.startsWith(k)) ?? ''] ?? CLAUDE_PRICES['claude-opus-5-5'];
  const prompt = t.input + t.cacheWrite + t.cacheRead;
  const p = known.long && prompt > known.long.above ? known.long.price : known.base;
  return (t.input * p.input + t.cacheWrite * p.cacheWrite + t.cacheRead * p.cacheRead + t.output * p.output) / 1_000_000 + t.webSearches * WEB_SEARCH_USD;
}
