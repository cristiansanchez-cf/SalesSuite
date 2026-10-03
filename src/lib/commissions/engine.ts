/**
 * Motor de comisiones (docs/COMMISSIONS.md). PURO: mismos eventos y mismo contexto → mismas líneas.
 * No escribe nada; el servicio inserta las líneas y Postgres descarta las repetidas por su clave.
 */
import { ELIGIBILITY_LABEL } from '../accounts/rules';
import { monthsBetween, mulDivRound, pctOf, periodOf } from './money';
import type { EngineContext, EngineResult, Entry, EntryDraft, Plan, RevenueEvent, Rule } from './types';

export const SKIP = {
  noSeller: 'No se sabe quién la vendió',
  noPlan: 'No hay plan de comisiones',
  noRule: 'Ninguna regla del plan encaja',
  notConfirmed: 'Pendiente de confirmar',
  noOriginal: 'No se encuentra el ingreso original de la devolución',
} as const;

/** Lista de salida que ignora lo ya guardado y lo ya añadido en esta pasada (misma clave = misma línea). */
class Out {
  readonly items: EntryDraft[] = [];
  private keys: Set<string>;
  constructor(existing: Entry[]) { this.keys = new Set(existing.map((x) => x.dedupeKey)); }
  push(x: EntryDraft) {
    if (this.keys.has(x.dedupeKey)) return;
    this.keys.add(x.dedupeKey);
    this.items.push(x);
  }
}

function covers(zones: EngineContext['zones'], zoneId: string, target: string): boolean {
  const byId = new Map(zones.map((z) => [z.id, z]));
  for (let z = byId.get(target), g = 0; z && g < 50; z = z.parentId ? byId.get(z.parentId) : undefined, g++) if (z.id === zoneId) return true;
  return false;
}

/** Quién vende: el evento, el autor de la propuesta, quien ganó la cuenta, quien la tiene. */
export function attribute(e: RevenueEvent, ctx: EngineContext): string | null {
  if (e.sellerId) return e.sellerId;
  const d = e.dossierId ? ctx.dossiers.get(e.dossierId) : undefined;
  if (d?.authorId) return d.authorId;
  const a = e.accountId ?? d?.accountId;
  const acc = a ? ctx.accounts.get(a) : undefined;
  return acc?.wonBy ?? acc?.ownerId ?? null;
}

export function planFor(userId: string, ctx: EngineContext): Plan | null {
  const id = ctx.planOf.get(userId);
  return (id && ctx.plans.find((p) => p.id === id)) || ctx.plans.find((p) => p.isDefault) || null;
}

function accountOf(e: RevenueEvent, ctx: EngineContext) {
  const id = e.accountId ?? (e.dossierId ? ctx.dossiers.get(e.dossierId)?.accountId : null) ?? null;
  return id ? { id, ...ctx.accounts.get(id) } : null;
}

export function matches(r: Rule, e: RevenueEvent, seller: string, ctx: EngineContext): boolean {
  const w = r.when;
  if (w.kinds?.length && !w.kinds.includes(e.kind)) return false;
  if (w.offers?.length && !(e.offer && w.offers.includes(e.offer))) return false;
  if (w.roles?.length && !w.roles.includes(ctx.members.get(seller)?.role as never)) return false;
  if (w.minCents != null && e.amountCents < w.minCents) return false;
  if (w.maxCents != null && e.amountCents > w.maxCents) return false;
  const acc = accountOf(e, ctx);
  if (w.zoneIds?.length && !(acc?.zoneId && w.zoneIds.some((z) => covers(ctx.zones, z, acc.zoneId!)))) return false;
  if (w.monthsFrom != null || w.monthsTo != null) {
    const months = acc?.wonAt ? monthsBetween(acc.wonAt, e.occurredAt) : 0;
    if (w.monthsFrom != null && months < w.monthsFrom) return false;
    if (w.monthsTo != null && months >= w.monthsTo) return false;
  }
  return true;
}

/** ¿Hay un motivo para no pagar? (conflicto de cuenta sin aprobar, cliente de otra persona). */
function ineligibility(e: RevenueEvent, seller: string, ctx: EngineContext): string | null {
  const d = e.dossierId ? ctx.dossiers.get(e.dossierId) : undefined;
  if (d?.eligibility && d.eligibility !== 'eligible') {
    if (d.decision === 'approved') return null;
    return d.decision === 'rejected' ? `Decidido sin comisión: ${ELIGIBILITY_LABEL[d.eligibility].toLowerCase()}` : `${ELIGIBILITY_LABEL[d.eligibility]} (pendiente de decisión)`;
  }
  const acc = accountOf(e, ctx);
  if (acc?.status === 'blocked') return ELIGIBILITY_LABEL.blocked;
  if (!d && acc?.wonBy && acc.wonBy !== seller) return 'La cuenta es cliente de otra persona';
  return null;
}

function commissionFor(e: RevenueEvent, ctx: EngineContext, out: Out, skipped: EngineResult['skipped']) {
  const seller = attribute(e, ctx);
  if (!seller) return void skipped.push({ eventId: e.id, reason: SKIP.noSeller });
  const plan = planFor(seller, ctx);
  if (!plan) return void skipped.push({ eventId: e.id, reason: SKIP.noPlan });
  const rule = plan.rules.find((r) => r.pay.type !== 'bounty' && matches(r, e, seller, ctx));
  if (!rule) return void skipped.push({ eventId: e.id, reason: SKIP.noRule });
  const amount = rule.pay.type === 'percent' ? pctOf(e.revenueCents, rule.pay.bps) : rule.pay.type === 'fixed' ? rule.pay.cents : 0;
  const why = ineligibility(e, seller, ctx);
  const acc = accountOf(e, ctx);
  const base: EntryDraft = {
    userId: seller, eventId: e.id, dedupeKey: `ev:${e.id}:commission:${seller}`, kind: 'commission', ruleId: rule.id, ruleLabel: rule.label,
    baseCents: e.revenueCents, amountCents: amount, currency: e.currency, period: periodOf(e.occurredAt),
    status: why ? 'ineligible' : 'pending', reason: why, accountId: acc?.id ?? null,
  };
  out.push(base);
  // Referido: quien le invitó cobra un % de esta comisión durante N meses desde que entró (según SU plan).
  const m = ctx.members.get(seller);
  if (m?.invitedBy && m.joinedAt && amount > 0) {
    const inviterPlan = planFor(m.invitedBy, ctx);
    const ref = inviterPlan?.referral;
    if (ref && ref.bps > 0 && monthsBetween(m.joinedAt, e.occurredAt) < ref.months && ctx.members.has(m.invitedBy)) {
      out.push({
        ...base, userId: m.invitedBy, dedupeKey: `ev:${e.id}:referral:${m.invitedBy}`, kind: 'referral', ruleId: null,
        ruleLabel: `Referido: ${ref.bps / 100} % de lo que gana tu invitado`, baseCents: amount, amountCents: pctOf(amount, ref.bps),
      });
    }
  }
}

function refundFor(e: RevenueEvent, events: Map<string, RevenueEvent>, all: Array<EntryDraft | Entry>, out: Out, skipped: EngineResult['skipped']) {
  const orig = e.refundsEventId ? events.get(e.refundsEventId) : undefined;
  if (!orig || orig.revenueCents <= 0) return void skipped.push({ eventId: e.id, reason: SKIP.noOriginal });
  const refunded = Math.min(Math.abs(e.revenueCents), orig.revenueCents);
  for (const o of all.filter((x) => x.eventId === orig.id && (x.kind === 'commission' || x.kind === 'referral') && x.status !== 'void' && x.status !== 'ineligible')) {
    // Lo ya devuelto de esta línea (devoluciones parciales anteriores): nunca por debajo de cero.
    const done = all.filter((x) => x.kind === 'refund' && x.dedupeKey.endsWith(`:${o.dedupeKey}`) && x.status !== 'void')
      .reduce((s, x) => s + x.amountCents, 0);
    const remaining = o.amountCents + done;
    // Proporción exacta (sin pasar por porcentajes redondeados); una devolución total deja la línea a cero.
    const exact = refunded === orig.revenueCents ? -remaining : -Math.min(mulDivRound(o.amountCents, refunded, orig.revenueCents), remaining);
    if (exact === 0) continue;
    out.push({
      userId: o.userId, eventId: e.id, dedupeKey: `refund:${e.id}:${o.dedupeKey}`, kind: 'refund', ruleId: o.ruleId, ruleLabel: `Devolución · ${o.ruleLabel ?? ''}`.trim(),
      baseCents: -refunded, amountCents: exact, currency: o.currency, period: periodOf(e.occurredAt), status: 'pending', reason: null, accountId: o.accountId,
    });
  }
}

function bounties(metrics: RevenueEvent[], ctx: EngineContext, out: Out) {
  const groups = new Map<string, RevenueEvent[]>();
  for (const e of metrics) {
    if (!e.metric || !e.accountId) continue;
    const k = `${e.accountId}|${e.metric}|${periodOf(e.occurredAt)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const [k, evs] of groups) {
    const [accountId, metric, period] = k.split('|');
    const last = [...evs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!;
    const seller = attribute(last, ctx);
    if (!seller) continue;
    const plan = planFor(seller, ctx);
    const rule = plan?.rules.find((r) => r.pay.type === 'bounty' && r.pay.metric === metric && matches(r, last, seller, ctx));
    if (!rule || rule.pay.type !== 'bounty') continue;
    const total = evs.reduce((s, e) => s + (e.quantity ?? 0), 0);
    if (total < rule.pay.threshold) continue;
    const why = ineligibility(last, seller, ctx);
    out.push({
      userId: seller, eventId: last.id, dedupeKey: `bounty:${rule.id}:${accountId}:${period}:${seller}`, kind: 'bounty', ruleId: rule.id, ruleLabel: rule.label,
      baseCents: 0, amountCents: rule.pay.cents, currency: last.currency, period, status: why ? 'ineligible' : 'pending',
      reason: why ?? `${total} ${metric} en ${period} (umbral ${rule.pay.threshold})`, accountId,
    });
  }
}

export function computeCommissions(events: RevenueEvent[], ctx: EngineContext): EngineResult {
  const out = new Out(ctx.existing);
  const skipped: EngineResult['skipped'] = [];
  const confirmed = events.filter((e) => e.status === 'confirmed').sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  for (const e of events) if (e.status === 'pending') skipped.push({ eventId: e.id, reason: SKIP.notConfirmed });
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const e of confirmed) {
    if (e.kind === 'metric' || e.kind === 'refund') continue;
    commissionFor(e, ctx, out, skipped);
  }
  for (const e of confirmed) {
    if (e.kind === 'refund') refundFor(e, byId, [...ctx.existing, ...out.items], out, skipped);  // sin duplicados: Out ya los filtra
  }
  bounties(confirmed.filter((e) => e.kind === 'metric'), ctx, out);
  // Lo ya guardado no se repite (Out lo descarta; en Postgres además lo impide la clave única).
  return { entries: out.items, skipped };
}
