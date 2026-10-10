import { describe, expect, test } from 'vitest';
import { buildMap, matchesTemp, temperature, zoneOwners } from './map';
import type { Zone } from '../accounts/types';
import type { AccountView } from '../accounts/service';
import type { Priority } from './priority';

const z = (id: string, name: string, parentId: string | null, at?: [number, number]): Zone => ({ id, tenantId: 't', parentId, name, kind: 'city', position: 0, lat: at?.[0] ?? null, lng: at?.[1] ?? null });
const zones = [z('es', 'España', null), z('v', 'Valencia', 'es', [39.47, -0.37]), z('r', 'Requena', 'v'), z('m', 'Madrid', 'es', [40.4, -3.7])];
const acc = (id: string, p: Partial<AccountView>) => ({ id, name: id, zoneId: null, zonePath: '', state: 'free', lat: null, lng: null, nextStep: null, placeRating: null, ownerName: null, ...p }) as AccountView;
const prio = (p: Partial<Priority>): Priority => ({ out: false, kills: [], score: 0, max: 100, qualified: true, kind: null, ...p } as Priority);

describe('mapa del CRM', () => {
  test('caliente, se enfría, sin cualificar', () => {
    expect(temperature(prio({ score: 75 }), undefined)).toBe('hot');
    expect(temperature(prio({ score: 75 }), 12)).toBe('cold');
    expect(temperature(prio({ out: true }), undefined)).toBe('cold');
    expect(temperature(prio({ qualified: false }), undefined)).toBe('unqualified');
    expect(temperature(prio({ score: 40 }), undefined)).toBe('normal');
    expect(matchesTemp('hot', 'caliente') && !matchesTemp('normal', 'caliente') && matchesTemp('normal', '')).toBe(true);
  });

  test('en su sitio, en su ciudad (aproximada), ciudad sin situar y sin ciudad', () => {
    const items = [
      acc('exacta', { zoneId: 'm', lat: 40.41, lng: -3.69 }), acc('en-madrid', { zoneId: 'm' }), acc('en-requena', { zoneId: 'r' }), acc('sin-ciudad', {}),
    ];
    const d = buildMap(items, zones, { prio: () => prio({ kind: 'venue' }), cooling: new Map(), rep: () => null });
    expect(d.points.map((p) => [p.id, p.exact, p.lat, p.kind])).toEqual([['exacta', true, 40.41, 'venue'], ['en-madrid', false, 40.4, 'venue']]);
    expect([d.exact, d.approx, d.unlocated, d.noCity]).toEqual([1, 1, 1, 1]);   // Requena aún no está situada
  });

  test('quién lleva la zona: la asignación más cercana subiendo', () => {
    const who = zoneOwners(zones, [{ userId: 'ana', zoneId: 'v' }, { userId: 'luis', zoneId: 'es' }]);
    expect(who('r')).toEqual(['ana']);
    expect(who('m')).toEqual(['luis']);
    expect(who(null)).toEqual([]);
  });
});
