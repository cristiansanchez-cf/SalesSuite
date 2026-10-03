/**
 * Stripe → comisiones (docs/COMMISSIONS.md §Stripe). Cada espacio da de alta en SU Stripe un webhook a
 * /api/v1/stripe/<id del espacio> y pega aquí su secreto de firma (whsec_…). Cada pago se convierte en un ingreso
 * normalizado (revenue_event, origen «stripe») atribuido a la propuesta que lo generó (client_reference_id =
 * dossier_<id>, lo pone el botón «Pagar») y, por ella, a quien la vendió.
 *
 *  · checkout.session.completed / async_payment_succeeded, pago único → venta (clave: el payment_intent).
 *  · checkout.session.completed, suscripción → se recuerda suscripción → propuesta (el cobro llega en la factura).
 *  · invoice.paid → cuota (clave: la factura), con la propuesta de su suscripción.
 *  · charge.refunded / refund.created → devolución del ingreso original (clave: el reembolso).
 * Idempotente: Stripe reintenta y repite eventos; la clave de cada ingreso es única por espacio.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IngestDb } from './db';
import { ingest, type IngestResult } from './ingest';

export const STRIPE_SOURCE = 'stripe';
/** Eventos que hay que marcar al crear el webhook en Stripe. */
export const STRIPE_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid', 'charge.refunded'] as const;
const TOLERANCE_S = 300;
const DOSSIER_REF = /^dossier_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Firma de Stripe: «t=<segundos>,v1=<hmac sha256 de "t.cuerpo">». Rechaza firmas viejas (repetición). */
export function verifyStripeSignature(raw: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowMs / 1000 - t) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;
const id = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as Obj).id === 'string' ? (v as Obj).id : null);
const at = (s: unknown) => new Date((typeof s === 'number' ? s : Date.now() / 1000) * 1000).toISOString();
const dossierOf = (ref: unknown) => (typeof ref === 'string' ? DOSSIER_REF.exec(ref)?.[1]?.toLowerCase() ?? null : null);
const net = (total: number, tax: unknown) => Math.max(0, total - (typeof tax === 'number' ? tax : 0));

export interface StripePlan {
  /** Ingresos a registrar (formato de /api/v1/events). */
  events: Obj[];
  /** Suscripción que hay que recordar → propuesta. */
  link?: { subscription: string; dossierId: string; invoice: string | null };
  /** Por qué no se registra nada (evento que no nos toca). */
  skip?: string;
}

/** Evento de Stripe → lo que hay que hacer. Puro: sin base de datos (la suscripción se resuelve fuera). */
export function planStripe(ev: Obj, subscriptionDossier: string | null = null): StripePlan {
  const o: Obj = ev?.data?.object ?? {};
  switch (ev?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const dossierId = dossierOf(o.client_reference_id);
      if (o.mode === 'subscription') {
        const sub = id(o.subscription);
        return sub && dossierId ? { events: [], link: { subscription: sub, dossierId, invoice: id(o.invoice) } } : { events: [], skip: 'suscripción sin propuesta' };
      }
      if (o.payment_status !== 'paid') return { events: [], skip: 'pago aún no cobrado' };
      const amount = Number(o.amount_total ?? 0);
      return {
        events: [{
          external_id: id(o.payment_intent) ?? o.id, kind: 'sale', occurred_at: at(o.created), amount_cents: amount,
          revenue_cents: net(amount, o.total_details?.amount_tax), currency: o.currency ?? 'eur',
          ...(dossierId ? { dossier_id: dossierId } : {}), note: 'Stripe · pago desde la propuesta',
        }],
      };
    }
    case 'invoice.paid': {
      if (!(Number(o.amount_paid) > 0)) return { events: [], skip: 'factura a 0' };
      const amount = Number(o.amount_paid);
      return {
        events: [{
          external_id: o.id, kind: 'recurring', occurred_at: at(o.status_transitions?.paid_at ?? o.created), amount_cents: amount,
          revenue_cents: net(amount, o.tax), currency: o.currency ?? 'eur',
          ...(subscriptionDossier ? { dossier_id: subscriptionDossier } : {}), note: `Stripe · cuota${o.billing_reason === 'subscription_create' ? ' (primera)' : ''}`,
        }],
      };
    }
    case 'charge.refunded': {
      const refunds: Obj[] = o.refunds?.data ?? [];
      const original = id(o.invoice) ?? id(o.payment_intent);
      if (!original) return { events: [], skip: 'devolución sin cobro original' };
      // Con la lista de reembolsos, uno por reembolso; sin ella (API nueva), el total devuelto como uno solo.
      const list = refunds.length ? refunds.filter((r) => r.status === 'succeeded' || r.status === 'pending')
        : o.amount_refunded > 0 ? [{ id: `${o.id}:refund:${o.amount_refunded}`, amount: o.amount_refunded, created: o.created }] : [];
      return {
        events: list.map((r) => ({
          external_id: r.id, kind: 'refund', occurred_at: at(r.created), amount_cents: Number(r.amount), currency: o.currency ?? 'eur',
          refunds_external_id: original, note: 'Stripe · devolución',
        })),
      };
    }
    default:
      return { events: [], skip: `evento ${ev?.type ?? '?'} no usado` };
  }
}

export interface StripeOutcome { status: number; body: Obj }

/** Todo el webhook, sin HTTP: verificar, interpretar, registrar. 2xx = Stripe no reintenta; 5xx = sí. */
export async function handleStripe(db: IngestDb, tenantId: string, raw: string, signature: string | null, nowMs = Date.now()): Promise<StripeOutcome> {
  const secret = await db.webhookSecret(tenantId);
  if (!secret) return { status: 404, body: { error: 'Este espacio no tiene Stripe conectado' } };
  if (!verifyStripeSignature(raw, signature, secret, nowMs)) return { status: 400, body: { error: 'Firma de Stripe no válida' } };
  let ev: Obj;
  try { ev = JSON.parse(raw); } catch { return { status: 400, body: { error: 'Cuerpo no válido' } }; }

  const o: Obj = ev?.data?.object ?? {};
  const sub = ev?.type === 'invoice.paid' ? id(o.subscription) ?? id(o.parent?.subscription_details?.subscription) : null;
  const plan = planStripe(ev, sub ? await db.subscriptionDossier(tenantId, sub) : null);
  if (plan.link) {
    if (!(await db.dossierInTenant(tenantId, plan.link.dossierId))) return { status: 200, body: { skipped: 'propuesta de otro espacio o borrada' } };
    await db.linkSubscription(tenantId, plan.link.subscription, plan.link.dossierId);
    // Si la factura llegó antes que el checkout, se le pone ahora la propuesta (no toca importes).
    if (plan.link.invoice) await db.attachDossier(tenantId, STRIPE_SOURCE, plan.link.invoice, plan.link.dossierId);
  }
  if (!plan.events.length) return { status: 200, body: { skipped: plan.skip ?? null, linked: !!plan.link } };
  const r: IngestResult = await ingest(db, tenantId, STRIPE_SOURCE, plan.events);
  // Errores de datos (p. ej. devolución de un pago que no vino de una propuesta) no se arreglan reintentando.
  return { status: 200, body: r };
}
