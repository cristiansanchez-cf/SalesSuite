/**
 * Apunta el consumo de pago con su espacio (docs/COSTES.md). Quién y dónde salen del ámbito de la petición
 * (`withUsageScope`, que pone el middleware para la consola y el cron o el webhook para lo que va por detrás), o se dan
 * a mano. Apuntar nunca rompe ni retrasa de más lo que se estaba haciendo: si falla, se avisa en el log y sigue.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';
import { claudeCost, tokensOf, unitPrices, type ClaudeUsage } from './prices';

export interface UsageScope { tenantId: string | null; userId: string | null }
const als = new AsyncLocalStorage<UsageScope>();
/** Todo lo que se gaste dentro de `fn` es de este espacio y esta persona. */
export const withUsageScope = <T>(scope: UsageScope, fn: () => T): T => als.run(scope, fn);
export const usageScope = (): UsageScope | null => als.getStore() ?? null;

export type UsageProvider = 'anthropic' | 'openai' | 'meta' | 'email' | 'media' | 'other';
export interface UsageEvent {
  tenantId: string | null; userId: string | null; at: string; feature: string; provider: UsageProvider; model: string | null;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; webSearches: number; units: number; costUsd: number;
}
export interface UsageSink { record(e: UsageEvent): Promise<void> }

// ---- Dónde se apunta: Supabase (service role) o memoria (demo y pruebas).
const KEY = Symbol.for('salessuite.usage');
type G = typeof globalThis & { [KEY]?: { sink?: UsageSink | null; demo?: UsageEvent[]; sb?: SupabaseClient | null } };
const g = () => ((globalThis as G)[KEY] ??= {});
export const demoUsage = (): UsageEvent[] => (g().demo ??= []);
export const demoUsageSink: UsageSink = { async record(e) { demoUsage().push(e); if (demoUsage().length > 20_000) demoUsage().splice(0, 5_000); } };
export function supabaseUsageSink(sb: SupabaseClient): UsageSink {
  return {
    async record(e) {
      const { error } = await sb.from('usage_event').insert({
        tenant_id: e.tenantId, user_id: e.userId, at: e.at, feature: e.feature, provider: e.provider, model: e.model,
        input_tokens: e.inputTokens, output_tokens: e.outputTokens, cache_read_tokens: e.cacheReadTokens, cache_write_tokens: e.cacheWriteTokens,
        web_searches: e.webSearches, units: e.units, cost_usd: Number(e.costUsd.toFixed(6)),
      });
      if (error) throw new Error(error.message);
    },
  };
}
/** Para las pruebas. `null` vuelve a lo de siempre. */
export function setUsageSink(s: UsageSink | null) { g().sink = s; }
function sink(): UsageSink | null {
  if (g().sink) return g().sink!;
  if (appMode() === 'demo') return demoUsageSink;
  const url = env('PUBLIC_SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  g().sb ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabaseUsageSink(g().sb!);
}

const FEATURE = /^[a-z0-9_.-]{1,40}$/;
async function write(e: UsageEvent) {
  if (!FEATURE.test(e.feature)) { console.warn('[usage] función no válida', e.feature); return; }
  const s = sink();
  if (!s) return;
  try {
    // Como mucho 2 segundos: el registro no puede dejar esperando a nadie.
    await Promise.race([s.record(e), new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), 2000))]);
  } catch (err) {
    console.warn('[usage] no se pudo apuntar', e.feature, err instanceof Error ? err.message : err);
  }
}
interface Who { tenantId?: string | null; userId?: string | null }
const who = (o: Who = {}) => {
  const s = usageScope();
  return { tenantId: o.tenantId !== undefined ? o.tenantId : s?.tenantId ?? null, userId: o.userId !== undefined ? o.userId : s?.userId ?? null };
};

/** Una respuesta de Claude (cada vuelta, si hay varias). */
export async function meterClaude(feature: string, model: string, usage: ClaudeUsage | null | undefined, o: Who = {}) {
  if (!usage) return;
  const t = tokensOf(usage);
  await write({
    ...who(o), at: new Date().toISOString(), feature, provider: 'anthropic', model,
    inputTokens: t.input, outputTokens: t.output, cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite, webSearches: t.webSearches, units: 0,
    costUsd: claudeCost(model, usage),
  });
}

/** Lo que se cobra por unidad: segundos de audio, plantillas de WhatsApp, correos, llamadas a la API de medios. */
export async function meterUnits(feature: string, provider: UsageProvider, units: number, o: Who & { model?: string | null; costUsd?: number } = {}) {
  const p = unitPrices();
  const n = Math.max(0, Number.isFinite(units) ? units : 0);
  const cost = o.costUsd ?? (provider === 'openai' ? (n / 60) * p.whisperPerMinute
    : provider === 'meta' ? n * (o.model === 'marketing' ? p.waMarketing : p.waUtility)
    : provider === 'email' ? n * p.email
    : provider === 'media' ? n * p.mediaCall : 0);
  await write({
    ...who(o), at: new Date().toISOString(), feature, provider, model: o.model ?? null,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, units: n, costUsd: Math.max(0, cost),
  });
}
