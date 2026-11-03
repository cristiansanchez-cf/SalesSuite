/**
 * Tope de IA por empresa (docs/COSTES.md §Tope). Lo fija el superadmin en Plataforma → Coste por empresa:
 * - usos de IA por persona y día (Apuntar e Investigar); sin fijar, 40;
 * - gasto máximo del espacio al mes en dólares (lo apuntado en usage_event); sin fijar, sin tope.
 * Al llegar al gasto del mes, la IA que lanza una persona (Apuntar, Investigar, Limpiar, zonas) se para hasta el mes
 * siguiente o hasta que se suba el tope; lo automático (leads, recordatorios) sigue.
 */

export const DEFAULT_AI_PER_USER_DAY = 40;
export const MAX_AI_PER_USER_DAY = 10_000;
export interface TenantLimits { aiPerUserDay: number; aiMonthUsd: number | null }
export interface AiLimitsNow extends TenantLimits { monthUsd: number }

/** Lo que llega del formulario: números válidos o el error. */
export function parseLimits(input: { aiPerUserDay?: unknown; aiMonthUsd?: unknown }): TenantLimits | null {
  const day = Number(String(input.aiPerUserDay ?? '').trim());
  const rawUsd = String(input.aiMonthUsd ?? '').trim().replace(',', '.');
  const usd = rawUsd === '' ? null : Number(rawUsd);
  if (!Number.isInteger(day) || day < 1 || day > MAX_AI_PER_USER_DAY) return null;
  if (usd !== null && (!Number.isFinite(usd) || usd < 0 || usd > 1_000_000)) return null;
  return { aiPerUserDay: day, aiMonthUsd: usd === null ? null : Math.round(usd * 100) / 100 };
}

/** ¿Ha llegado al gasto del mes? */
export const overBudget = (l: AiLimitsNow | null | undefined) => !!l && l.aiMonthUsd !== null && l.monthUsd >= l.aiMonthUsd;
