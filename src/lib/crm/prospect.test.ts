import { describe, expect, test } from 'vitest';
import { areaQuery, markCandidates, nameKey, slimPlace, sweepCounts } from './prospect';
import { fixturePlaces, searchArea, type PlaceResult } from './places';
import type { Zone } from '../accounts/types';

const Z = (id: string, name: string, kind: Zone['kind'], parentId: string | null = null): Zone => ({ id, tenantId: 't', parentId, name, kind, position: 0 });
const zones = [Z('es', 'España', 'country'), Z('cv', 'Comunidad Valenciana', 'region', 'es'), Z('vlc', 'Valencia', 'province', 'cv')];
const P = (id: string, name: string, extra: Partial<PlaceResult> = {}): PlaceResult => ({ placeId: id, name, address: null, phone: null, website: null, mapsUrl: null, hours: null, lat: null, lng: null, status: 'OPERATIONAL', ...extra });

describe('buscar clientes (§19)', () => {
  test('lo que se pide a Google: qué en la zona con su ruta', () => {
    expect(areaQuery(' discotecas ', zones[2], zones)).toBe('discotecas en Valencia, Comunidad Valenciana, España');
    expect(areaQuery('discotecas', null, zones)).toBe('discotecas');
  });
  test('marca cada resultado: nueva, ya la tienes (misma ficha o importada), mismo nombre, cerrada', () => {
    const accounts = [
      { id: 'a1', name: 'Sala Sol', placeId: 'p1', discardedAt: null },
      { id: 'a2', name: 'Café Bolsería', placeId: null, discardedAt: '2026-10-01' },
      { id: 'a3', name: 'Radio City', placeId: null, discardedAt: null },
    ];
    const cs = markCandidates([P('p1', 'Sala Sol Valencia'), P('p2', 'CAFE BOLSERIA'), P('p3', 'Ghecko'), P('p4', 'Cerrada', { status: 'CLOSED_PERMANENTLY' }), P('p5', 'Otra')], accounts, { p5: 'a3' });
    expect(cs.map((c) => c.state)).toEqual(['have', 'maybe', 'new', 'closed', 'have']);
    expect(cs[1]).toMatchObject({ accountId: 'a2', discarded: true });
    expect(cs[4].accountId).toBe('a3');
    expect(sweepCounts(cs)).toEqual({ found: 5, fresh: 2, have: 2 });
  });
  test('nombre para comparar sin tildes ni signos', () => { expect(nameKey('  Café  Bolsería! ')).toBe('cafe bolseria'); });
  test('lo que se guarda: sin enlaces que no sean web y recortado', () => {
    const s = slimPlace(P('p', 'x'.repeat(300), { website: 'javascript:alert(1)', mapsUrl: 'https://maps.google.com/?q=1', hours: Array(14).fill('lunes') }));
    expect(s.website).toBeNull(); expect(s.mapsUrl).toMatch(/^https:/); expect(s.name).toHaveLength(160); expect(s.hours).toHaveLength(7);
  });
  test('Google por páginas: sigue el nextPageToken (máx. 3), sin repetir, con el punto de la zona', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const page = (ids: string[], token?: string) => ({ places: ids.map((id) => ({ id, displayName: { text: id } })), ...(token ? { nextPageToken: token } : {}) });
    const pages = [page(['a', 'b'], 't1'), page(['b', 'c'], 't2'), page(['d'], 't3'), page(['e'])];
    const fetchImpl = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(pages[bodies.length - 1])); }) as unknown as typeof fetch;
    const r = await searchArea('discotecas en Valencia', 'k', { near: { lat: 39.47, lng: -0.38, radius: 999999 } }, fetchImpl);
    expect(r.pages).toBe(3);
    expect(r.results.map((x) => x.placeId)).toEqual(['a', 'b', 'c', 'd']);
    expect(bodies[1].pageToken).toBe('t1');
    expect((bodies[0].locationBias as { circle: { radius: number } }).circle.radius).toBe(50000);
  });
  test('Google de pruebas: 12 sitios, uno cerrado y uno sin web', async () => {
    const r = await fixturePlaces().area!('discotecas en Valencia');
    expect(r.results).toHaveLength(12);
    expect(r.results.filter((x) => x.status === 'CLOSED_PERMANENTLY')).toHaveLength(1);
    expect(r.results.filter((x) => !x.website)).toHaveLength(1);
    expect(r.results[0].name).toBe('Discoteca Sol');
  });
});
