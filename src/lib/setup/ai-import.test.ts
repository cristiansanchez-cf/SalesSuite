import { describe, expect, it } from 'vitest';
import { extractJson, importBlock, kindOf, parseBlock, periodOf, preview, promptFor, roleOf } from './ai-import';

describe('configuración con IA', () => {
  it('saca el JSON aunque venga con texto y ```json alrededor', () => {
    expect(extractJson('Aquí lo tienes:\n```json\n{"a": 1}\n```\n¡Suerte!')).toEqual({ a: 1 });
    expect(extractJson('blah {"a": {"b": 2}} fin')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('sin json')).toThrow(/No encuentro/);
    expect(() => extractJson('```json\n{"a": \n```')).toThrow(/cortado/);
  });
  it('entiende papeles, tipos de jugada y cobros dichos a su manera', () => {
    expect(roleOf('Quien decide')).toBe('decisor');
    expect(roleOf('Guardián')).toBe('guardian');
    expect(roleOf('algo raro')).toBe('influenciador');
    expect(kindOf('Objeción')).toBe('objection');
    expect(kindOf('guion')).toBe('script');
    expect(periodOf('al mes')).toBe('month');
    expect(periodOf('Por evento')).toBe('event');
  });
  it('el formato equivocado en el paso equivocado se explica', () => {
    expect(() => parseBlock('empresa', '{"sectores": []}')).toThrow(/paso correcto/);
    const p = parseBlock('precios', '{"tarifas": [{"nombre": "Local", "importe": "249 €", "cobro": "mes"}]}');
    expect(p.tarifas[0].importe).toBe(249);
    expect(p.descuentos).toEqual([]);
  });
  it('el prompt lleva a quién ayuda, la primera pregunta y el formato', () => {
    const t = promptFor('mercado', { person: 'Cristian', company: 'Enjoy' });
    expect(t).toContain('Eres el asistente de Cristian, de Enjoy');
    expect(t).toContain('```json');
    expect(t).toContain('"actores"');
  });
  it('vista previa: solo añade lo que falta; importar escribe lo mismo', async () => {
    const saved: unknown[] = [];
    const deps = {
      playbook: {
        market: async () => [{ id: 's1', key: 'locales', name: 'Locales', personas: [{ key: 'propietario', name: 'Dueño' }] }],
        saveSegment: async (i: unknown) => { saved.push(i); return 's2'; }, savePersona: async (i: unknown) => { saved.push(i); return 'p'; },
        listAll: async () => ({ plays: [] }), createPlay: async (i: unknown) => { saved.push(i); return 'x'; },
      },
      evidence: { facets: async () => [], saveFacet: async (i: unknown) => saved.push(i) },
      prices: { list: async () => [], save: async (i: Record<string, unknown>) => { saved.push(i); return 'o'; } },
      coupons: { list: async () => [], save: async (i: unknown) => saved.push(i) },
    };
    const data = parseBlock('mercado', JSON.stringify({ sectores: [
      { nombre: 'Locales', actores: [{ nombre: 'Dueño', papel: 'decisor' }, { nombre: 'DJ', papel: 'guardian' }] },
      { nombre: 'Festivales', actores: [{ nombre: 'Director', papel: 'decide' }] },
    ] }));
    const pv = await preview('mercado', data, deps);
    expect(pv.skip).toEqual(['Sector Locales', 'Dueño (Locales)']);
    expect(pv.add).toEqual(['DJ (Locales) · guardian', 'Sector Festivales', 'Director (Festivales) · decisor']);
    expect(saved).toEqual([]);
    await importBlock('mercado', data, deps);
    expect(saved).toHaveLength(3);
  });
});
