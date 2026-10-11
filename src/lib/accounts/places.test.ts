import { describe, expect, test } from 'vitest';
import { countryOf, defaultCountry, provincesOf } from './places';
import type { Zone } from './types';

const z = (id: string, parentId: string | null, name: string, kind: Zone['kind']): Zone => ({ id, tenantId: 't', parentId, name, kind, position: 0, lat: null, lng: null } as Zone);
const zones = [
  z('es', null, 'España', 'country'), z('cv', 'es', 'Comunidad Valenciana', 'region'), z('vlc', 'cv', 'Valencia', 'province'), z('cs', 'cv', 'Castellón', 'province'),
  z('city', 'vlc', 'Gandía', 'city'), z('mad', 'es', 'Madrid', 'city'), z('ri', 'es', 'La Rioja', 'region'), z('pt', null, 'Portugal', 'country'),
];

describe('país → provincia (§23)', () => {
  test('las provincias del país, saltando la comunidad; lo que cuelga sin provincia cuenta como una', () => {
    expect(provincesOf(zones, 'es').map((x) => x.name)).toEqual(['Castellón', 'La Rioja', 'Madrid', 'Valencia']);
  });
  test('el país de una zona', () => { expect(countryOf(zones, 'city')?.id).toBe('es'); expect(countryOf(zones, null)).toBeNull(); });
  test('país por defecto: el elegido; si no, el de tu zona; si no, el único con algo dentro', () => {
    expect(defaultCountry(zones, ['vlc'], 'pt')).toBe('pt');
    expect(defaultCountry(zones, ['vlc'], 'borrado')).toBe('es');
    expect(defaultCountry(zones, [], undefined)).toBe('es');
    expect(defaultCountry([...zones, z('ls', 'pt', 'Lisboa', 'city')], [], undefined)).toBeNull();
  });
});
