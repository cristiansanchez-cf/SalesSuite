import { describe, expect, test } from 'vitest';
import { demoDeliveryStore, failureReason } from './delivery';
import { parseWebhook } from '../leads/whatsapp';

describe('qué pasó con el recordatorio (wa_delivery)', () => {
  test('aceptado → entregado → leído, sin volver atrás; el fallo se guarda con su motivo', async () => {
    const st = demoDeliveryStore();
    await st.track({ wamid: 'w1', tenantId: 't', userId: 'u-del', kind: 'reminder' });
    expect((await st.last('u-del', 'reminder'))?.status).toBe('accepted');
    await st.update('w1', 'read', null);
    await st.update('w1', 'delivered', null);
    expect((await st.last('u-del', 'reminder'))?.status).toBe('read');
    await st.track({ wamid: 'w2', tenantId: 't', userId: 'u-del', kind: 'reminder' });
    await st.update('w2', 'failed', '131042 Business eligibility payment issue');
    const last = await st.last('u-del', 'reminder');
    expect(last?.status).toBe('failed');
    expect(failureReason(last!.error)).toContain('método de pago');
    await st.update('nadie', 'delivered', null); // los que no se siguen, se ignoran
  });
  test('el webhook trae el código de Meta en el error', () => {
    const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, statuses: [
      { id: 'wamid.X', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable', error_data: { details: 'Unable to deliver' } }] },
    ] } }] }] };
    const { statuses } = parseWebhook(body);
    expect(statuses[0].error).toBe('131026 Unable to deliver');
    expect(failureReason(statuses[0].error)).toContain('ese número no puede recibirlo');
    expect(failureReason('999999 Algo raro')).toBe('999999 Algo raro');
  });
});
