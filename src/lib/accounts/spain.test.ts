import { describe, expect, it } from 'vitest';
import { SPAIN, existingFor, missingPlaces, operatesInSpain, pathForKey, pathForParts, planPath, provinceNamed, spainCatalog } from './spain';
import type { Zone } from './types';

const zone = (id: string, name: string, parentId: string | null, kind: Zone['kind']): Zone => ({ id, tenantId: 't', parentId, name, kind, position: 0 });
const names = (p: { name: string }[] | null) => p?.map((x) => x.name);

describe('catálogo de España (§44)', () => {
  it('Bilbao cuelga de Vizcaya, en el País Vasco; las 52 provincias están', () => {
    const c = spainCatalog();
    expect(names(c.find((x) => x.name === 'Bilbao')!.path)).toEqual(['España', 'País Vasco', 'Vizcaya', 'Bilbao']);
    expect(SPAIN.flatMap((r) => r.provinces)).toHaveLength(52);
    // Cantabria no se repite (comunidad = provincia) y la comunidad no sale aparte.
    expect(names(c.find((x) => x.name === 'Santander')!.path)).toEqual(['España', 'Cantabria', 'Santander']);
    expect(c.filter((x) => x.name === 'Cantabria')).toHaveLength(1);
  });
  it('una clave se valida contra el catálogo; un pueblo libre, con su provincia', () => {
    expect(names(pathForKey('es|Comunidad Valenciana|Valencia|requena'))).toEqual(['España', 'Comunidad Valenciana', 'Valencia', 'Requena']);
    expect(names(pathForKey('es|País Vasco|Vizcaya|bilbao'))).toEqual(['España', 'País Vasco', 'Vizcaya', 'Bilbao']);
    expect(pathForKey('es|Narnia|Vizcaya')).toBeNull();
    expect(pathForKey('es|País Vasco|Valencia')).toBeNull();
    expect(pathForKey('es|País Vasco|Vizcaya|<script>')).toBeNull();
    expect(provinceNamed('bizkaia')).toEqual({ region: 'País Vasco', province: 'Vizcaya' });
  });
  it('reutiliza lo que ya hay (con otro nombre o suelto arriba) y no lo ofrece dos veces', () => {
    const zones = [zone('es', 'España', null, 'country'), zone('pv', 'Euskadi', 'es', 'region'), zone('bi', 'Bizkaia', 'pv', 'province'), zone('loose', 'Málaga', null, 'city')];
    const bilbao = pathForKey('es|País Vasco|Vizcaya|Bilbao')!;
    expect(existingFor(zones, bilbao).id).toBeNull();
    expect(planPath(zones, bilbao)).toEqual({ create: [{ name: 'España', kind: 'country' }, { name: 'Euskadi', kind: 'region' }, { name: 'Bizkaia', kind: 'province' }, { name: 'Bilbao', kind: 'city' }] });
    expect(existingFor(zones, pathForKey('es|Andalucía|Málaga')!).id).toBe('loose');
    const missing = missingPlaces(zones).map((x) => x.name);
    expect(missing).toContain('Bilbao');
    expect(missing).not.toContain('Vizcaya');
    expect(missing).not.toContain('Málaga');
  });
  it('fuera de España no se ofrece el catálogo', () => {
    expect(operatesInSpain([zone('kr', 'Corea del Sur', null, 'country')])).toBe(false);
    expect(operatesInSpain([])).toBe(true);
  });
});

describe('sitios de Google en cualquier país (§44)', () => {
  it('fuera: País › Región › Ciudad', () => {
    expect(names(pathForParts({ city: 'Busan', province: null, region: 'Busan', country: 'Corea del Sur' }, 'city'))).toEqual(['Corea del Sur', 'Busan']);
    expect(names(pathForParts({ city: 'Osaka', province: null, region: 'Prefectura de Osaka', country: 'Japón' }, 'city'))).toEqual(['Japón', 'Prefectura de Osaka', 'Osaka']);
    expect(names(pathForParts({ city: null, province: null, region: 'Gyeonggi', country: 'Corea del Sur' }, 'region'))).toEqual(['Corea del Sur', 'Gyeonggi']);
    expect(pathForParts({ city: 'X', province: null, region: null, country: null }, 'city')).toBeNull();
  });
  it('en España, con los nombres del catálogo', () => {
    expect(names(pathForParts({ city: 'Bilbao', province: 'Bizkaia', region: 'Euskadi', country: 'España' }, 'city'))).toEqual(['España', 'País Vasco', 'Vizcaya', 'Bilbao']);
    expect(names(pathForParts({ city: 'Requena', province: 'Valencia', region: 'Comunidad Valenciana', country: 'España' }, 'city'))).toEqual(['España', 'Comunidad Valenciana', 'Valencia', 'Requena']);
    expect(names(pathForParts({ city: 'Valencia', province: 'Valencia', region: 'Comunidad Valenciana', country: 'España' }, 'city'))).toEqual(['España', 'Comunidad Valenciana', 'Valencia']);
  });
});
