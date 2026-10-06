import { describe, expect, test } from 'vitest';
import { eligibility, stateFor, withDescendants, zoneCovers, zonePath } from './rules';
import { DEFAULT_RULES, type Account, type Zone } from './types';

const T = 't';
const zones: Zone[] = [
  { id: 'es', tenantId: T, parentId: null, name: 'España', kind: 'country', position: 0 },
  { id: 'cv', tenantId: T, parentId: 'es', name: 'Comunidad Valenciana', kind: 'region', position: 0 },
  { id: 'vlc', tenantId: T, parentId: 'cv', name: 'Valencia', kind: 'city', position: 0 },
  { id: 'mad', tenantId: T, parentId: 'es', name: 'Madrid', kind: 'city', position: 0 },
];
const now = new Date('2026-10-03T10:00:00Z');
const acc = (p: Partial<Account> = {}): Account => ({
  id: 'a', tenantId: T, name: 'Club', zoneId: 'vlc', segmentId: null, address: null, externalRef: null, notes: null, status: 'open', blockedReason: null,
  ownerId: null, claimedUntil: null, lastTouchAt: null, lastTouchBy: null, wonAt: null, wonBy: null, wonDossierId: null, createdBy: null, createdAt: now.toISOString(), fields: {}, ...p,
});
const ctx = { zones, assignments: [{ userId: 'ana', zoneId: 'cv' }, { userId: 'bea', zoneId: 'mad' }], now };
const later = new Date(now.getTime() + 86_400_000).toISOString();
const before = new Date(now.getTime() - 1).toISOString();

describe('reglas de cuentas', () => {
  test('zonas: una región cubre sus ciudades, no al revés', () => {
    expect(zoneCovers(zones, 'cv', 'vlc')).toBe(true);
    expect(zoneCovers(zones, 'vlc', 'cv')).toBe(false);
    expect(zoneCovers(zones, 'mad', 'vlc')).toBe(false);
    expect([...withDescendants(zones, ['es'])].sort()).toEqual(['cv', 'es', 'mad', 'vlc']);
    expect(zonePath(zones, 'vlc')).toBe('España › Comunidad Valenciana › Valencia');
  });

  test('libre, reservada para otro, reserva caducada', () => {
    expect(eligibility(acc(), 'bea', DEFAULT_RULES, ctx)).toBe('eligible');
    expect(eligibility(acc({ ownerId: 'ana', claimedUntil: later }), 'bea', DEFAULT_RULES, ctx)).toBe('claimed_by_other');
    expect(eligibility(acc({ ownerId: 'ana', claimedUntil: later }), 'ana', DEFAULT_RULES, ctx)).toBe('eligible');
    expect(eligibility(acc({ ownerId: 'ana', claimedUntil: before }), 'bea', DEFAULT_RULES, ctx)).toBe('eligible');
  });

  test('cliente de otro y bloqueada: nunca para otro', () => {
    expect(eligibility(acc({ status: 'customer', wonBy: 'ana', ownerId: 'ana' }), 'bea', DEFAULT_RULES, ctx)).toBe('claimed_by_other');
    expect(eligibility(acc({ status: 'customer', wonBy: 'ana', ownerId: 'ana' }), 'ana', DEFAULT_RULES, ctx)).toBe('eligible');
    expect(eligibility(acc({ status: 'blocked', ownerId: 'ana', claimedUntil: later }), 'ana', DEFAULT_RULES, ctx)).toBe('blocked');
  });

  test('zonas estrictas: fuera de tu zona no; sin zonas asignadas, sin límite', () => {
    const strict = { ...DEFAULT_RULES, strictZones: true };
    expect(eligibility(acc(), 'bea', strict, ctx)).toBe('out_of_zone');
    expect(eligibility(acc(), 'ana', strict, ctx)).toBe('eligible');
    expect(eligibility(acc(), 'carla', strict, ctx)).toBe('eligible');
    expect(eligibility(acc({ zoneId: null }), 'bea', strict, ctx)).toBe('eligible');
  });

  test('sin cuenta: depende de la regla', () => {
    expect(eligibility(null, 'ana', DEFAULT_RULES, ctx)).toBe('eligible');
    expect(eligibility(null, 'ana', { ...DEFAULT_RULES, requireAccount: true }, ctx)).toBe('no_account');
  });

  test('estado visible', () => {
    expect(stateFor(acc(), 'ana', now)).toBe('free');
    expect(stateFor(acc({ ownerId: 'ana', claimedUntil: later }), 'ana', now)).toBe('mine');
    expect(stateFor(acc({ ownerId: 'ana', claimedUntil: later }), 'bea', now)).toBe('taken');
    expect(stateFor(acc({ ownerId: 'ana', claimedUntil: before }), 'bea', now)).toBe('free');
    expect(stateFor(acc({ status: 'customer', wonBy: 'ana' }), 'ana', now)).toBe('my_customer');
    expect(stateFor(acc({ status: 'blocked' }), 'ana', now)).toBe('blocked');
  });
});
