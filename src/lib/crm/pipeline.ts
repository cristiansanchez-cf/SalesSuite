/**
 * Tablero de ventas (docs/CRM_DINAMICO.md §34). La columna de cada empresa la decide lo que ha pasado (su historial),
 * nunca el comercial: así no se cuela el «ya casi está» de quien vende. Lógica pura (se prueba sin base de datos).
 */
export const STAGES = ['new', 'researched', 'contacted', 'negotiating', 'closing', 'won', 'lost'] as const;
export type Stage = (typeof STAGES)[number];

/** Resumen de las interacciones de una empresa (vista crm_activity_summary). Las notas no cuentan. */
export interface ActivitySummary {
  accountId: string;
  /** Interacciones de verdad (mensajes, llamadas, visitas…), sin las notas. */
  real: number;
  firstAt: string | null;
  lastAt: string | null;
  /** La primera vez que contestó (contestó, interesado o cita). */
  firstReplyAt: string | null;
  lastOutcome: string | null;
}
export interface PipelineInput {
  wonAt: string | null; discardedAt: string | null;
  /** Algo investigado: cualificación, «Lo que sabemos» o investigación con IA. */
  researched: boolean;
  summary: ActivitySummary | null;
  /** Cuándo se le mandó la propuesta o el enlace de pago (lo primero), si se ha hecho. */
  closingAt: string | null;
}

/** La columna, en orden: lo ganado y lo perdido mandan; luego lo más avanzado que haya pasado. */
export function stageOf(x: PipelineInput): Stage {
  if (x.wonAt) return 'won';
  if (x.discardedAt || x.summary?.lastOutcome === 'not_interested') return 'lost';
  if (x.closingAt) return 'closing';
  if (x.summary?.firstReplyAt) return 'negotiating';
  if ((x.summary?.real ?? 0) > 0) return 'contacted';
  if (x.researched) return 'researched';
  return 'new';
}

/** Desde cuándo está en esa columna (lo que la llevó allí), si se sabe. */
export function stageSince(stage: Stage, x: PipelineInput): string | null {
  switch (stage) {
    case 'won': return x.wonAt;
    case 'lost': return x.discardedAt ?? x.summary?.lastAt ?? null;
    case 'closing': return x.closingAt;
    case 'negotiating': return x.summary?.firstReplyAt ?? null;
    case 'contacted': return x.summary?.firstAt ?? null;
    default: return null;
  }
}

/** A partir de cuántas interacciones en negociación se avisa («le está costando»). */
export const MANY_TOUCHES = 8;
const DAY = 86_400_000;
export const daysSince = (iso: string | null, now: Date) => (iso ? Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY)) : null);

export interface StageAlerts {
  /** Días desde el primer contacto, si ya se pasa del plazo y sigue abierta. */
  overdue: number | null;
  /** Interacciones en negociación, si son muchas. */
  manyTouches: number | null;
}
/**
 * Atascadas: abierta (contacto, negociación o cierre) y pasado el plazo desde el primer contacto (por tipo de cliente;
 * más largo si es un grupo o un sitio grande); o muchas interacciones sin salir de negociación. Avisa, no cierra.
 */
export function alertsOf(stage: Stage, x: PipelineInput, limitDays: number, now: Date): StageAlerts {
  const open = stage === 'contacted' || stage === 'negotiating' || stage === 'closing';
  const age = daysSince(x.summary?.firstAt ?? null, now);
  return {
    overdue: open && age !== null && age > limitDays ? age : null,
    manyTouches: stage === 'negotiating' && (x.summary?.real ?? 0) >= MANY_TOUCHES ? x.summary!.real : null,
  };
}
