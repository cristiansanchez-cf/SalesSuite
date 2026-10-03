import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { handleStripe, planStripe, verifyStripeSignature } from './stripe';
import { memDb } from './testing';

const SECRET = 'whsec_test_secret_123';
const D1 = '00000000-0000-4000-8000-0000000d0001';
const sign = (raw: string, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const send = (db: ReturnType<typeof memDb>, ev: unknown, tenant = 't') => { const raw = JSON.stringify(ev); return handleStripe(db, tenant, raw, sign(raw)); };

const checkout = (o: Record<string, unknown>) => ({ type: 'checkout.session.completed', data: { object: {
  id: 'cs_1', client_reference_id: `dossier_${D1}`, created: 1790000000, currency: 'eur', ...o } } });

describe('Stripe → comisiones', () => {
  test('firma: válida, manipulada, vieja o de otro secreto', () => {
    const raw = '{"a":1}';
    expect(verifyStripeSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyStripeSignature('{"a":2}', sign(raw), SECRET)).toBe(false);
    expect(verifyStripeSignature(raw, sign(raw, Math.floor(Date.now() / 1000) - 3600), SECRET)).toBe(false);
    expect(verifyStripeSignature(raw, sign(raw, undefined, 'whsec_otro_secreto_1'), SECRET)).toBe(false);
    expect(verifyStripeSignature(raw, null, SECRET)).toBe(false);
  });

  test('pago único desde la propuesta → venta atribuida a la propuesta, sin IVA; repetir no duplica', async () => {
    const db = memDb();
    const ev = checkout({ mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 121_00, total_details: { amount_tax: 21_00 } });
    expect((await send(db, ev)).status).toBe(200);
    expect(db.rows[0]).toMatchObject({ source: 'stripe', externalId: 'pi_1', kind: 'sale', amountCents: 12100, revenueCents: 10000, currency: 'EUR', dossierId: D1 });
    expect((await send(db, ev)).body).toMatchObject({ created: 0, duplicates: 1 });
    expect(db.rows).toHaveLength(1);
  });

  test('sin firma válida o sin Stripe conectado: no entra nada', async () => {
    const db = memDb();
    const raw = JSON.stringify(checkout({ mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 100 }));
    expect((await handleStripe(db, 't', raw, 't=1,v1=00')).status).toBe(400);
    expect((await handleStripe(db, 'otro', raw, sign(raw))).status).toBe(404);
    expect(db.rows).toHaveLength(0);
  });

  test('suscripción: el checkout recuerda la propuesta y cada factura es una cuota suya (aunque llegue antes)', async () => {
    const db = memDb();
    const invoice = (n: string, reason: string) => ({ type: 'invoice.paid', data: { object: { id: n, subscription: 'sub_ABC123', amount_paid: 99_00, tax: 0, currency: 'eur', billing_reason: reason, created: 1790000000 } } });
    await send(db, invoice('in_1', 'subscription_create'));                 // llega antes que el checkout
    expect(db.rows[0].dossierId).toBeNull();
    await send(db, checkout({ mode: 'subscription', subscription: 'sub_ABC123', invoice: 'in_1' }));
    expect(db.rows[0].dossierId).toBe(D1);                                  // se le pone la propuesta
    await send(db, invoice('in_2', 'subscription_cycle'));
    expect(db.rows[1]).toMatchObject({ externalId: 'in_2', kind: 'recurring', amountCents: 9900, dossierId: D1 });
  });

  test('devolución: resta del ingreso original', async () => {
    const db = memDb();
    await send(db, checkout({ mode: 'payment', payment_status: 'paid', payment_intent: 'pi_9', amount_total: 200_00 }));
    await send(db, { type: 'charge.refunded', data: { object: { id: 'ch_9', payment_intent: 'pi_9', currency: 'eur', amount_refunded: 50_00, refunds: { data: [{ id: 're_1', amount: 50_00, status: 'succeeded', created: 1790000100 }] } } } });
    expect(db.rows[1]).toMatchObject({ externalId: 're_1', kind: 'refund', amountCents: 5000, revenueCents: 5000, refundsEventId: db.rows[0].id });
  });

  test('lo que no nos toca se ignora con 200 (Stripe no reintenta)', () => {
    expect(planStripe({ type: 'customer.created', data: { object: {} } }).events).toEqual([]);
    expect(planStripe(checkout({ mode: 'payment', payment_status: 'unpaid' })).skip).toBe('pago aún no cobrado');
  });
});
