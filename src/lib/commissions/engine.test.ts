import { describe, expect, test } from 'vitest';
import { computeCommissions } from './engine';
import type { EngineContext, Entry, EntryDraft, Plan, RevenueEvent, Rule } from './types';

const T = 't1';
let n = 0;
const ev = (p: Partial<RevenueEvent>): RevenueEvent => ({
  id: `e${++n}`, tenantId: T, source: 'test', externalId: `x${n}`, kind: 'sale', status: 'confirmed', occurredAt: '2026-10-10T10:00:00Z',
  amountCents: 100_000, revenueCents: 100_000, currency: 'EUR', accountId: null, dossierId: null, sellerId: 'ana', offer: null, metric: null,
  quantity: null, refundsEventId: null, note: null, createdAt: '2026-10-10T10:00:00Z', ...p,
});
const rule = (id: string, label: string, when: Rule['when'], pay: Rule['pay']): Rule => ({ id, label, when, pay });
const plan = (id: string, rules: Rule[], p: Partial<Plan> = {}): Plan => ({ id, tenantId: T, name: id, isDefault: false, rules, referral: null, updatedAt: '', ...p });
const ctx = (p: Partial<EngineContext> = {}): EngineContext => ({
  plans: [plan('base', [rule('all', 'Todo igual: 30 %', {}, { type: 'percent', bps: 3000 })], { isDefault: true })],
  planOf: new Map(),
  members: new Map([
    ['ana', { role: 'rep', invitedBy: null, joinedAt: '2026-01-01T00:00:00Z' }],
    ['leo', { role: 'rep', invitedBy: null, joinedAt: '2026-01-01T00:00:00Z' }],
    ['dj1', { role: 'partner', invitedBy: null, joinedAt: '2026-01-01T00:00:00Z' }],
    ['dj2', { role: 'partner', invitedBy: 'dj1', joinedAt: '2026-06-01T00:00:00Z' }],
  ]),
  accounts: new Map(), dossiers: new Map(), zones: [], existing: [], ...p,
});
const sum = (xs: Array<{ amountCents: number }>) => xs.reduce((s, x) => s + x.amountCents, 0);
const asEntries = (ds: EntryDraft[]): Entry[] => ds.map((d, i) => ({ ...d, id: `en${i}`, tenantId: T, payoutId: null, createdAt: '' }));

describe('motor de comisiones', () => {
  test('MVP: «todo igual» 30 % del paquete de 1.000 € = 300 €', () => {
    const r = computeCommissions([ev({})], ctx());
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ userId: 'ana', kind: 'commission', amountCents: 30_000, baseCents: 100_000, status: 'pending', period: '2026-10', ruleLabel: 'Todo igual: 30 %' });
  });

  test('excepciones por paquete: gana la primera regla que encaja', () => {
    const c = ctx({ plans: [plan('base', [
      rule('big', 'Paquete grande 10 %', { offers: ['pack-3000'] }, { type: 'percent', bps: 1000 }),
      rule('small', 'Paquete pequeño 50 %', { maxCents: 30_000 }, { type: 'percent', bps: 5000 }),
      rule('all', 'Todo igual 30 %', {}, { type: 'percent', bps: 3000 }),
    ], { isDefault: true })] });
    const r = computeCommissions([ev({ offer: 'pack-3000', amountCents: 300_000, revenueCents: 300_000 }), ev({ amountCents: 30_000, revenueCents: 30_000 }), ev({})], c);
    expect(r.entries.map((e) => [e.ruleId, e.amountCents])).toEqual([['big', 30_000], ['small', 15_000], ['all', 30_000]]);
  });

  test('por persona (plan propio) y por rol', () => {
    const c = ctx({
      plans: [
        plan('base', [rule('dj', 'Colaboradores 20 %', { roles: ['partner'] }, { type: 'percent', bps: 2000 }), rule('all', '30 %', {}, { type: 'percent', bps: 3000 })], { isDefault: true }),
        plan('vip', [rule('v', 'Leo 35 %', {}, { type: 'percent', bps: 3500 })]),
      ],
      planOf: new Map([['leo', 'vip']]),
    });
    const r = computeCommissions([ev({ sellerId: 'dj1' }), ev({ sellerId: 'leo' }), ev({ sellerId: 'ana' })], c);
    expect(r.entries.map((e) => [e.userId, e.amountCents])).toEqual([['dj1', 20_000], ['leo', 35_000], ['ana', 30_000]]);
  });

  test('por zona, con subzonas (Corea más)', () => {
    const c = ctx({
      zones: [{ id: 'asia', parentId: null }, { id: 'kr', parentId: 'asia' }, { id: 'seoul', parentId: 'kr' }, { id: 'es', parentId: null }],
      accounts: new Map([['a-seoul', { zoneId: 'seoul', wonAt: null, wonBy: null, ownerId: 'ana', status: 'open' }], ['a-mad', { zoneId: 'es', wonAt: null, wonBy: null, ownerId: 'ana', status: 'open' }]]),
      plans: [plan('base', [rule('kr', 'Corea 40 %', { zoneIds: ['kr'] }, { type: 'percent', bps: 4000 }), rule('all', '30 %', {}, { type: 'percent', bps: 3000 })], { isDefault: true })],
    });
    const r = computeCommissions([ev({ accountId: 'a-seoul' }), ev({ accountId: 'a-mad' })], c);
    expect(r.entries.map((e) => e.amountCents)).toEqual([40_000, 30_000]);
  });

  test('Oquea: 70 % del 3 % del volumen durante los 6 primeros meses', () => {
    const c = ctx({
      accounts: new Map([['centro', { zoneId: null, wonAt: '2026-01-15T00:00:00Z', wonBy: 'ana', ownerId: 'ana', status: 'customer' }]]),
      plans: [plan('base', [rule('vol', '70 % del take rate, 6 meses', { kinds: ['volume'], monthsFrom: 0, monthsTo: 6 }, { type: 'percent', bps: 7000 })], { isDefault: true })],
    });
    // 35 transacciones, 9.000 € procesados; Oquea se queda el 3 % = 270 €.
    const mar = ev({ kind: 'volume', accountId: 'centro', sellerId: null, amountCents: 900_000, revenueCents: 27_000, occurredAt: '2026-03-31T00:00:00Z' });
    const jul14 = ev({ kind: 'volume', accountId: 'centro', sellerId: null, amountCents: 900_000, revenueCents: 27_000, occurredAt: '2026-07-14T00:00:00Z' });
    const jul15 = ev({ kind: 'volume', accountId: 'centro', sellerId: null, amountCents: 900_000, revenueCents: 27_000, occurredAt: '2026-07-15T00:00:00Z' });
    const r = computeCommissions([mar, jul14, jul15], c);
    expect(r.entries.map((e) => [e.eventId, e.userId, e.amountCents])).toEqual([[mar.id, 'ana', 18_900], [jul14.id, 'ana', 18_900]]);
    expect(r.skipped).toEqual([{ eventId: jul15.id, reason: 'Ninguna regla del plan encaja' }]);
  });

  test('Oquea: 70 % del 10 % durante 6 meses desde la PRIMERA transacción del centro (no desde que se ganó)', () => {
    const c = ctx({
      // Firmó en enero; su primera transacción llega en mayo: el reloj empieza en mayo.
      accounts: new Map([['centro', { zoneId: null, wonAt: '2026-01-15T00:00:00Z', wonBy: 'ana', ownerId: 'ana', status: 'customer', firstAt: '2026-05-10T00:00:00Z' }]]),
      plans: [plan('base', [rule('tx', '70 % · 6 meses desde la primera', { kinds: ['sale'], monthsTo: 6, monthsAnchor: 'first' }, { type: 'percent', bps: 7000 })], { isDefault: true })],
    });
    const may = ev({ kind: 'sale', accountId: 'centro', sellerId: null, amountCents: 100_000, revenueCents: 10_000, occurredAt: '2026-05-10T00:00:00Z' });
    const oct = ev({ kind: 'sale', accountId: 'centro', sellerId: null, amountCents: 100_000, revenueCents: 10_000, occurredAt: '2026-10-09T00:00:00Z' });
    const nov = ev({ kind: 'sale', accountId: 'centro', sellerId: null, amountCents: 100_000, revenueCents: 10_000, occurredAt: '2026-11-10T00:00:00Z' });
    const r = computeCommissions([may, oct, nov], c);
    expect(r.entries.map((e) => [e.eventId, e.amountCents])).toEqual([[may.id, 7_000], [oct.id, 7_000]]);
    expect(r.skipped.map((x) => x.eventId)).toEqual([nov.id]);
  });

  test('bounty: QR de canciones con más de 100 peticiones en un mes → una vez por cuenta y mes', () => {
    const c = ctx({
      accounts: new Map([['sala', { zoneId: null, wonAt: null, wonBy: 'dj1', ownerId: 'dj1', status: 'customer' }], ['bar', { zoneId: null, wonAt: null, wonBy: 'dj1', ownerId: 'dj1', status: 'customer' }]]),
      plans: [plan('base', [rule('qr', 'QR con +100 peticiones: 30 €', { kinds: ['metric'] }, { type: 'bounty', metric: 'song_requests', threshold: 100, cents: 3000 })], { isDefault: true })],
    });
    const m = (account: string, q: number, at: string) => ev({ kind: 'metric', metric: 'song_requests', quantity: q, accountId: account, sellerId: null, amountCents: 0, revenueCents: 0, occurredAt: at });
    const r = computeCommissions([
      m('sala', 60, '2026-10-05T00:00:00Z'), m('sala', 45, '2026-10-20T00:00:00Z'),  // 105 en octubre → sí
      m('sala', 99, '2026-11-02T00:00:00Z'),                                           // 99 en noviembre → no
      m('bar', 40, '2026-10-31T23:00:00Z'), m('bar', 70, '2026-11-01T01:00:00Z'),     // repartido en dos meses → no
    ], c);
    expect(r.entries.map((e) => [e.kind, e.userId, e.accountId, e.period, e.amountCents])).toEqual([['bounty', 'dj1', 'sala', '2026-10', 3000]]);
    expect(r.entries[0].reason).toContain('105 song_requests');
    // Más peticiones el mismo mes no pagan otra vez.
    const again = computeCommissions([m('sala', 500, '2026-10-25T00:00:00Z')], ctx({ ...c, existing: asEntries(r.entries) }));
    expect(again.entries).toEqual([]);
  });

  test('referidos: quien invitó cobra un % durante N meses desde que entró su invitado', () => {
    const c = ctx({ plans: [plan('base', [rule('all', '30 %', {}, { type: 'percent', bps: 3000 })], { isDefault: true, referral: { bps: 1000, months: 12 } })] });
    const r = computeCommissions([ev({ sellerId: 'dj2', occurredAt: '2027-05-31T00:00:00Z' }), ev({ sellerId: 'dj2', occurredAt: '2027-06-01T00:00:00Z' })], c);
    expect(r.entries.map((e) => [e.userId, e.kind, e.amountCents])).toEqual([['dj2', 'commission', 30_000], ['dj1', 'referral', 3_000], ['dj2', 'commission', 30_000]]);
  });

  test('atribución: evento → autor de la propuesta → quien ganó la cuenta → quien la tiene', () => {
    const c = ctx({
      dossiers: new Map([['d1', { authorId: 'leo', accountId: null, eligibility: 'eligible', decision: null }]]),
      accounts: new Map([['won', { zoneId: null, wonAt: null, wonBy: 'ana', ownerId: 'ana', status: 'customer' }], ['held', { zoneId: null, wonAt: null, wonBy: null, ownerId: 'leo', status: 'open' }]]),
    });
    const r = computeCommissions([ev({ sellerId: null, dossierId: 'd1' }), ev({ sellerId: null, accountId: 'won' }), ev({ sellerId: null, accountId: 'held' }), ev({ sellerId: null })], c);
    expect(r.entries.map((e) => e.userId)).toEqual(['leo', 'ana', 'leo']);
    expect(r.skipped.map((s) => s.reason)).toEqual(['No se sabe quién la vendió']);
  });

  test('conflictos de cuenta: no elegible con motivo hasta que se aprueba', () => {
    const c = ctx({ dossiers: new Map([
      ['open', { authorId: 'leo', accountId: null, eligibility: 'claimed_by_other', decision: null }],
      ['ok', { authorId: 'leo', accountId: null, eligibility: 'claimed_by_other', decision: 'approved' }],
      ['no', { authorId: 'leo', accountId: null, eligibility: 'blocked', decision: 'rejected' }],
    ]), accounts: new Map([['blk', { zoneId: null, wonAt: null, wonBy: null, ownerId: null, status: 'blocked' }], ['other', { zoneId: null, wonAt: null, wonBy: 'ana', ownerId: 'ana', status: 'customer' }]]) });
    const r = computeCommissions([ev({ sellerId: null, dossierId: 'open' }), ev({ sellerId: null, dossierId: 'ok' }), ev({ sellerId: null, dossierId: 'no' }),
      ev({ sellerId: 'leo', accountId: 'blk' }), ev({ sellerId: 'leo', accountId: 'other' })], c);
    expect(r.entries.map((e) => [e.status, e.reason])).toEqual([
      ['ineligible', 'La trabaja otra persona (pendiente de decisión)'],
      ['pending', null],
      ['ineligible', 'Decidido sin comisión: cuenta bloqueada'],
      ['ineligible', 'Cuenta bloqueada'],
      ['ineligible', 'La cuenta es cliente de otra persona'],
    ]);
  });

  test('devolución total: la comisión (y el referido) quedan a cero', () => {
    const c = ctx({ plans: [plan('base', [rule('all', '30 %', {}, { type: 'percent', bps: 3333 })], { isDefault: true, referral: { bps: 1500, months: 120 } })] });
    const sale = ev({ sellerId: 'dj2', revenueCents: 99_999, amountCents: 99_999 });
    const first = computeCommissions([sale], c);
    const refund = ev({ kind: 'refund', sellerId: null, refundsEventId: sale.id, amountCents: 99_999, revenueCents: 99_999 });
    const r = computeCommissions([sale, refund], ctx({ ...c, existing: asEntries(first.entries) }));
    expect(r.entries.every((e) => e.kind === 'refund')).toBe(true);
    for (const u of ['dj2', 'dj1']) expect(sum([...first.entries, ...r.entries].filter((e) => e.userId === u))).toBe(0);
  });

  test('devoluciones parciales: nunca se devuelve más de lo cobrado', () => {
    const sale = ev({ revenueCents: 10_001, amountCents: 10_001 });
    let existing = asEntries(computeCommissions([sale], ctx()).entries);
    const events = [sale];
    for (let i = 0; i < 7; i++) {
      const refund = ev({ kind: 'refund', sellerId: null, refundsEventId: sale.id, revenueCents: 3_333, amountCents: 3_333 });
      events.push(refund);
      existing = [...existing, ...asEntries(computeCommissions(events, ctx({ existing })).entries)];
      expect(sum(existing)).toBeGreaterThanOrEqual(0);
    }
    expect(sum(existing)).toBe(0);
  });

  test('idempotente: procesar otra vez no crea nada; lo pendiente de confirmar no cuenta', () => {
    const events = [ev({}), ev({ sellerId: 'leo' }), ev({ status: 'pending' }), ev({ status: 'void' })];
    const first = computeCommissions(events, ctx());
    expect(first.entries).toHaveLength(2);
    expect(first.skipped).toEqual([{ eventId: events[2].id, reason: 'Pendiente de confirmar' }]);
    expect(computeCommissions(events, ctx({ existing: asEntries(first.entries) })).entries).toEqual([]);
  });

  test('sin plan: no se inventa una comisión', () => {
    const r = computeCommissions([ev({})], ctx({ plans: [] }));
    expect(r.entries).toEqual([]);
    expect(r.skipped[0].reason).toBe('No hay plan de comisiones');
  });

  test('propiedad: con importes aleatorios, nunca hay comisiones negativas fuera de devoluciones y el total cuadra al céntimo', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const c = ctx({ plans: [plan('base', [rule('a', 'x', { maxCents: 50_000 }, { type: 'percent', bps: 4567 }), rule('b', 'y', {}, { type: 'percent', bps: 1234 })], { isDefault: true })] });
    const events = Array.from({ length: 300 }, () => { const v = Math.floor(rnd() * 10_000_000); return ev({ amountCents: v, revenueCents: v }); });
    const r = computeCommissions(events, c);
    expect(r.entries).toHaveLength(300);
    const byId = new Map(events.map((e) => [e.id, e]));
    for (const e of r.entries) {
      const src = byId.get(e.eventId!)!;
      expect(e.amountCents).toBeGreaterThanOrEqual(0);
      const bps = src.amountCents <= 50_000 ? 4567 : 1234;
      expect(Math.abs(e.amountCents - (src.revenueCents * bps) / 10_000)).toBeLessThanOrEqual(0.5);
    }
  });
});
