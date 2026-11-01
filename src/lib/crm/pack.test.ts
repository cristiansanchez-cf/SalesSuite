/** Cualificación por espacio (§45): lo guardado solo vale si es un paquete conocido. */
import { describe, expect, test } from 'vitest';
import { NO_PACK_QUAL, normalizePack, QUAL_PACKS } from './pack';

describe('paquete de cualificación', () => {
  test('solo los paquetes conocidos; cualquier otra cosa (o nada) es «sin cualificación»', () => {
    expect(QUAL_PACKS).toEqual(['nightlife']);
    expect(normalizePack('nightlife')).toBe('nightlife');
    for (const v of [null, undefined, '', 'Nightlife', ' nightlife', 'otro', 0, true, { pack: 'nightlife' }]) expect(normalizePack(v)).toBeNull();
  });

  // BUG (src/lib/crm/pack.ts:12, normalizePack): compara String(v) pero devuelve `v` tal cual, así que ['nightlife']
  // pasa y sale un array tipado como QualPack. En Supabase la columna es text con check (no llega un array); en demo o
  // si cambia el origen, sí. Arreglo: devolver String(v). Quitar `.fails` cuando esté arreglado.
  test('una lista con el paquete dentro tampoco vale (String(["nightlife"]) no cuela)', () => {
    expect(normalizePack(['nightlife'])).toBeNull();
  });

  test('sin paquete solo se marca el tamaño', () => {
    expect(NO_PACK_QUAL).toEqual(['size']);
  });
});
