/** Validación de planes, reglas y eventos (entrada de formularios y de la API). */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseMoney } from './money';
import type { RuleWhen } from './types';

const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  try { return parseMoney(v); } catch { ctx.addIssue({ code: 'custom', message: 'Importe no válido' }); return z.NEVER; }
});
const pct = z.coerce.number().min(0, 'Mínimo 0 %').max(100, 'Máximo 100 %').transform((v) => Math.round(v * 100));  // % → puntos básicos
const list = z.array(z.string().trim().min(1).max(80)).max(50).optional();

export const ruleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  label: z.string().trim().min(1, 'Ponle un nombre a la regla').max(120),
  when: z.object({
    kinds: z.array(z.enum(['sale', 'recurring', 'volume', 'metric'])).max(4).optional(),
    offers: list,
    zoneIds: z.array(z.string().uuid()).max(50).optional(),
    minCents: money.optional(), maxCents: money.optional(),
    monthsFrom: z.coerce.number().int().min(0).max(600).optional(),
    monthsTo: z.coerce.number().int().min(1).max(600).optional(),
    monthsAnchor: z.enum(['won', 'first']).optional(),
    roles: z.array(z.enum(['admin', 'lead', 'rep', 'partner'])).max(4).optional(),
  }).default({}),
  pay: z.discriminatedUnion('type', [
    z.object({ type: z.literal('percent'), pct }),
    z.object({ type: z.literal('fixed'), amount: money }),
    z.object({ type: z.literal('bounty'), metric: z.string().regex(/^[a-z0-9_]{1,60}$/, 'Métrica: minúsculas, números y _'), threshold: z.coerce.number().int().min(1), amount: money }),
  ]),
}).transform((r) => ({
  id: r.id ?? randomUUID().slice(0, 8),
  label: r.label,
  when: Object.fromEntries(Object.entries(r.when).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as RuleWhen,
  pay: r.pay.type === 'percent' ? { type: 'percent' as const, bps: r.pay.pct }
    : r.pay.type === 'fixed' ? { type: 'fixed' as const, cents: r.pay.amount }
    : { type: 'bounty' as const, metric: r.pay.metric, threshold: r.pay.threshold, cents: r.pay.amount },
})).refine((r) => r.when.monthsFrom == null || r.when.monthsTo == null || r.when.monthsTo > r.when.monthsFrom, 'El mes «hasta» debe ser mayor que «desde»')
  .refine((r) => r.pay.type !== 'bounty' || !r.when.kinds || r.when.kinds.includes('metric'), 'Un bounty se activa con métricas');

export const planSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre al plan').max(80),
  isDefault: z.boolean().default(false),
  rules: z.array(ruleSchema).max(100),
  referral: z.object({ pct, months: z.coerce.number().int().min(1).max(120) }).nullable().optional()
    .transform((r) => (r && r.pct > 0 ? { bps: r.pct, months: r.months } : null)),
});

/** Evento en nuestro formato (API y alta manual). Importes en euros (o céntimos con *_cents). */
export const eventInput = z.object({
  external_id: z.string().trim().min(1).max(200),
  kind: z.enum(['sale', 'recurring', 'volume', 'metric', 'refund']),
  occurred_at: z.string().datetime({ offset: true }),
  amount: money.optional(), amount_cents: z.number().int().min(0).optional(),
  revenue: money.optional(), revenue_cents: z.number().int().min(0).optional(),
  /** Para volumen: % que se queda la empresa (3 = 3 %), si no se envía `revenue`. */
  take_rate: z.coerce.number().min(0).max(100).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((c) => c.toUpperCase()).default('EUR'),
  account_ref: z.string().trim().max(120).optional(),
  seller_email: z.string().email().optional(),
  offer: z.string().trim().max(80).optional(),
  metric: z.string().regex(/^[a-z0-9_]{1,60}$/).optional(),
  quantity: z.coerce.number().min(0).optional(),
  refunds_external_id: z.string().trim().max(200).optional(),
  /** La propuesta que generó el ingreso (→ quien la vendió). */
  dossier_id: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
}).superRefine((e, ctx) => {
  if (e.kind === 'metric' && (!e.metric || e.quantity == null)) ctx.addIssue({ code: 'custom', message: 'Una métrica necesita metric y quantity' });
  if (e.kind === 'refund' && !e.refunds_external_id) ctx.addIssue({ code: 'custom', message: 'Una devolución necesita refunds_external_id' });
  if (e.kind !== 'metric' && e.amount == null && e.amount_cents == null) ctx.addIssue({ code: 'custom', message: 'Falta amount' });
  if ((e.amount ?? 0) < 0 || (e.revenue ?? 0) < 0) ctx.addIssue({ code: 'custom', message: 'Importes en positivo (las devoluciones usan kind=refund)' });
});
export type EventInput = z.infer<typeof eventInput>;

export const declareSchema = z.object({
  amount: money.refine((c) => c > 0, 'El importe debe ser mayor que cero'),
  kind: z.enum(['sale', 'recurring']).default('sale'),
  offer: z.string().trim().max(80).optional().transform((v) => v || null),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
});
