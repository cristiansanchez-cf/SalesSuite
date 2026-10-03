import { describe, expect, test } from 'vitest';
import { cleanSituation, compare, mergeSituation, winRate } from './similarity';
import type { Facet } from './types';

const facets: Facet[] = [
  { id: 'f1', key: 'personalidad', label: 'Tipo de personalidad', question: null, icon: null, scope: 'contact', multi: false, weight: 2, position: 1, status: 'official',
    options: [{ key: 'analitico', label: 'Analítico' }, { key: 'directo', label: 'Directo' }] },
  { id: 'f2', key: 'region', label: 'Región', question: null, icon: null, scope: 'account', multi: false, weight: 2, position: 2, status: 'official',
    options: [{ key: 'brasil', label: 'Brasil' }, { key: 'corea', label: 'Corea' }] },
  { id: 'f3', key: 'rasgos', label: 'Rasgos', question: null, icon: null, scope: 'account', multi: true, weight: 1, position: 3, status: 'official',
    options: [{ key: 'pantalla', label: 'Tiene pantalla' }, { key: 'dj', label: 'DJ residente' }] },
];
const names = { segment: (id: string) => ({ s1: 'Ocio nocturno', s2: 'Bodas' }[id] ?? null), persona: (id: string) => ({ p1: 'DJ residente' }[id] ?? null), facets };

describe('similitud de situaciones', () => {
  test('suma sector, actores y facetas; explica coincidencias', () => {
    const r = compare(
      { segmentId: 's1', personaIds: ['p1'], situation: { personalidad: ['analitico'], rasgos: ['pantalla', 'dj'] } },
      { segmentId: 's1', personaIds: ['p1', 'p2'], situation: { personalidad: ['analitico'], rasgos: ['dj'] } }, names);
    expect(r.score).toBe(3 + 2 + 2 + 1);
    expect(r.matches.map((m) => m.label)).toEqual(['Ocio nocturno', 'DJ residente', 'Analítico', 'DJ residente']);
    expect(r.differs).toEqual([]);
  });

  test('otra región resta y se avisa (lo de Brasil se ve en Corea, marcado)', () => {
    const r = compare({ segmentId: null, personaIds: [], situation: { region: ['corea'] } }, { segmentId: 's1', personaIds: [], situation: { region: ['brasil'] } }, names);
    expect(r.score).toBe(-1);
    expect(r.differs.map((d) => d.label)).toEqual(['Región: Brasil']);
  });

  test('«no lo sé» no suma ni resta', () => {
    expect(compare({ segmentId: null, personaIds: [], situation: {} }, { segmentId: 's1', personaIds: ['p1'], situation: { region: ['brasil'] } }, names).score).toBe(0);
  });

  test('limpia opciones que ya no existen y respeta single/multi', () => {
    expect(cleanSituation({ personalidad: ['directo', 'analitico'], rasgos: ['dj', 'dj', 'borrado'], vieja: ['x'] }, facets))
      .toEqual({ personalidad: ['directo'], rasgos: ['dj'] });
    expect(mergeSituation({ rasgos: ['dj'] }, { rasgos: ['pantalla'], personalidad: ['directo'] })).toEqual({ rasgos: ['dj', 'pantalla'], personalidad: ['directo'] });
  });

  test('tasa suavizada: 1 de 1 no es 100 %', () => {
    expect(winRate(1, 1)).toBeCloseTo(2 / 3);
    expect(winRate(0, 0)).toBe(0.5);
  });
});
