import { describe, expect, test } from 'vitest';
import { applyMapping, ingest } from './ingest';
import type { IngestDb } from './db';
import type { RevenueEvent } from './types';

function memDb(): IngestDb & { rows: RevenueEvent[] } {
  const rows: RevenueEvent[] = [];
  return {
    rows,
    async tenantForKey() { return null; }, async touchKey() {}, async connector() { return null; },
    async findEvent(t, s, x) { return rows.find((r) => r.tenantId === t && r.source === s && r.externalId === x) ?? null; },
    async insertEvent(t, e) { const id = `id${rows.length + 1}`; rows.push({ ...e, id, tenantId: t, createdAt: '' }); return id; },
    async accountByRef(_t, ref) { return ref === 'oquea:c1' ? 'acc-1' : null; },
    async userByEmail(_t, email) { return email === 'ana@x.es' ? 'ana' : null; },
  };
}

describe('entrada de ingresos', () => {
  test('Oquea: volumen con take rate → ingreso de la empresa', async () => {
    const db = memDb();
    const r = await ingest(db, 't', 'oquea', [{ external_id: 'm-2026-03-c1', kind: 'volume', occurred_at: '2026-03-31T00:00:00Z', amount: '9000', take_rate: 3, account_ref: 'oquea:c1', quantity: 35 }]);
    expect(r).toEqual({ created: 1, duplicates: 0, conflicts: [], errors: [] });
    expect(db.rows[0]).toMatchObject({ amountCents: 900_000, revenueCents: 27_000, accountId: 'acc-1', status: 'confirmed', quantity: 35 });
  });

  test('idempotente: repetir no duplica; cambiar el importe se rechaza', async () => {
    const db = memDb();
    const e = { external_id: 'inv-1', kind: 'sale', occurred_at: '2026-10-01T10:00:00+02:00', amount: 1000, seller_email: 'ana@x.es' };
    await ingest(db, 't', 'api', [e]);
    expect(await ingest(db, 't', 'api', [{ ...e, occurred_at: '2026-10-01T08:00:00Z' }])).toMatchObject({ created: 0, duplicates: 1 });
    const r = await ingest(db, 't', 'api', [{ ...e, amount: 999 }]);
    expect(r.conflicts).toHaveLength(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ amountCents: 100_000, revenueCents: 100_000, sellerId: 'ana' });
  });

  test('devolución parcial: ingreso proporcional; sin original, error', async () => {
    const db = memDb();
    await ingest(db, 't', 'api', [{ external_id: 'v1', kind: 'volume', occurred_at: '2026-10-01T00:00:00Z', amount: 9000, take_rate: 3 }]);
    await ingest(db, 't', 'api', [{ external_id: 'r1', kind: 'refund', occurred_at: '2026-10-05T00:00:00Z', amount: 3000, refunds_external_id: 'v1' }]);
    expect(db.rows[1]).toMatchObject({ kind: 'refund', amountCents: 300_000, revenueCents: 9_000, refundsEventId: db.rows[0].id });
    const bad = await ingest(db, 't', 'api', [{ external_id: 'r2', kind: 'refund', occurred_at: '2026-10-05T00:00:00Z', amount: 1, refunds_external_id: 'nope' }]);
    expect(bad.errors[0].message).toContain('No existe el ingreso nope');
  });

  test('validación: cada error dice qué evento y por qué; los válidos entran', async () => {
    const db = memDb();
    const r = await ingest(db, 't', 'api', [
      { external_id: 'ok', kind: 'sale', occurred_at: '2026-10-01T00:00:00Z', amount: 10 },
      { external_id: 'x', kind: 'sale', occurred_at: 'ayer', amount: 10 },
      { external_id: 'm', kind: 'metric', occurred_at: '2026-10-01T00:00:00Z' },
      { external_id: 'n', kind: 'sale', occurred_at: '2026-10-01T00:00:00Z', amount: -5 },
      { external_id: 'u', kind: 'sale', occurred_at: '2026-10-01T00:00:00Z', amount: 5, seller_email: 'nadie@x.es' },
    ]);
    expect(r.created).toBe(1);
    expect(r.errors.map((e) => e.index)).toEqual([1, 2, 3, 4]);
    expect(r.errors[3].message).toContain('no está en el equipo');
  });

  test('conector: un formato externo raro se convierte a eventos', () => {
    const body = { data: { payments: [{ id: 991, gross: 900000, created: 1774915200, center: { id: 'c1' }, n: 35 }] } };
    const out = applyMapping({ items: 'data.payments', fields: {
      external_id: 'id', kind: { const: 'volume' }, amount: { path: 'gross', divide: 100 }, take_rate: { const: 3 },
      occurred_at: 'created', account_ref: { path: 'center.id', prefix: 'oquea:' }, quantity: 'n',
    } }, body);
    expect(out).toEqual([{ external_id: '991', kind: 'volume', amount: '9000.00', take_rate: 3, occurred_at: '2026-03-31T00:00:00.000Z', account_ref: 'oquea:c1', quantity: 35 }]);
  });
});
