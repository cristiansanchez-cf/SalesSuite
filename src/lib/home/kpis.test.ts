import { describe, expect, test } from 'vitest';
import { myDay, teamKpis } from './kpis';
import type { DossierRecord } from '../admin/types';
import type { RevenueEvent } from '../commissions/types';

const now = new Date('2026-10-15T10:00:00Z');
let n = 0;
const d = (p: Partial<DossierRecord>): DossierRecord => ({
  id: `d${++n}`, tenantId: 't', authorId: 'ana', title: `D${n}`, prospectName: null, prospectCompany: null, status: 'published', locale: 'es-ES',
  priceMode: 'none', totalPrice: null, currency: 'EUR', publishedAt: null, updatedAt: '2026-10-01T00:00:00Z', outcome: 'open', outcomeNote: null,
  segmentId: null, nextStep: null, nextStepAt: null, partnerAccountId: null, situation: {}, accountId: null, accountEligibility: null, accountDecision: null,
  accountDecidedAt: null, couponId: null, discount: null, ...p,
});
const ev = (p: Partial<RevenueEvent>): RevenueEvent => ({
  id: 'e', tenantId: 't', source: 's', externalId: 'x', kind: 'sale', status: 'confirmed', occurredAt: '2026-10-05T00:00:00Z', amountCents: 0, revenueCents: 0,
  currency: 'EUR', accountId: null, dossierId: null, sellerId: null, offer: null, metric: null, quantity: null, refundsEventId: null, note: null, createdAt: '', ...p,
});

describe('inicio', () => {
  test('KPIs del equipo: ganadas del mes, tasa de cierre, pipeline, ingresos y vencidos por persona', () => {
    const ds = [
      d({ outcome: 'won', outcomeAt: '2026-10-02T00:00:00Z' }), d({ outcome: 'won', outcomeAt: '2026-10-09T00:00:00Z', authorId: 'leo' }),
      d({ outcome: 'won', outcomeAt: '2026-09-20T00:00:00Z' }), d({ outcome: 'lost', outcomeAt: '2026-09-25T00:00:00Z' }),
      d({ outcome: 'lost', outcomeAt: '2026-05-01T00:00:00Z' }),  // fuera de los 90 días
      d({ nextStepAt: '2026-10-10T09:00:00Z' }), d({ nextStepAt: '2026-10-20T09:00:00Z', authorId: 'leo' }), d({ status: 'draft' }), d({ status: 'archived' }),
    ];
    const k = teamKpis(ds, [ev({ revenueCents: 100_000 }), ev({ kind: 'refund', revenueCents: 30_000 }), ev({ status: 'pending', revenueCents: 9_999 }), ev({ occurredAt: '2026-09-30T00:00:00Z', revenueCents: 5 })],
      new Map([['ana', 'Ana'], ['leo', 'Leo']]), now);
    expect(k).toMatchObject({ wonMonth: 2, wonPrevMonth: 1, closedLast90: 4, openPipeline: 3, publishedOpen: 2, revenueMonthCents: 70_000 });
    expect(k.closeRate).toBe(0.75);
    expect(k.overdue.map((x) => x.authorName)).toEqual(['Ana']);
    expect(k.people.map((p) => [p.name, p.wonMonth, p.open, p.overdue])).toEqual([['Ana', 1, 2, 1], ['Leo', 1, 1, 0]]);
  });

  test('sin cierres no hay tasa (no un 0 % engañoso)', () => {
    expect(teamKpis([d({})], [], new Map(), now).closeRate).toBeNull();
  });

  test('el día del comercial', () => {
    const ds = [
      d({ nextStepAt: '2026-10-14T09:00:00Z', title: 'vencida' }), d({ nextStepAt: '2026-10-15T18:00:00Z', title: 'hoy' }),
      d({ nextStepAt: '2026-10-19T09:00:00Z', title: 'semana' }), d({ nextStepAt: '2026-11-30T09:00:00Z', title: 'lejos' }),
      d({ title: 'sin paso' }), d({ title: 'borrador', status: 'draft' }), d({ title: 'de otro', authorId: 'leo', nextStepAt: '2026-10-01T00:00:00Z' }),
    ];
    const r = myDay(ds, 'ana', now);
    expect([r.overdue, r.today, r.upcoming, r.noNextStep].map((x) => x.map((y) => y.title))).toEqual([['vencida'], ['hoy'], ['semana'], ['sin paso']]);
  });
});
