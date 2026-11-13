import { describe, expect, test } from 'vitest';
import { collectTextFields, fieldLabel, setAt, textOverrides } from './text-fields';

const defaults = {
  eyebrow: 'Hoy', title: 'Lo que pasa', mock: 'asset:img/x.svg', autoAdvanceMs: 0,
  cards: [{ problem: 'A', solution: 'B' }, { problem: 'C', solution: 'D' }],
  seals: [{ size: 'compacto', x: 44, y: 76 }],
  ctas: [{ label: 'Hablemos', href: 'https://x.com' }],
};

describe('editar textos de una diapositiva', () => {
  test('solo los textos para leer, sin imágenes, enlaces ni ajustes', () => {
    const f = collectTextFields(defaults);
    expect(f.map((x) => x.path.join('.'))).toEqual(['eyebrow', 'title', 'cards.0.problem', 'cards.0.solution', 'cards.1.problem', 'cards.1.solution', 'ctas.0.label']);
  });

  test('etiquetas en castellano: «Tarjeta 2 · Problema»', () => {
    expect(fieldLabel(['cards', 1, 'problem'])).toBe('Tarjeta 2 · Problema');
    expect(fieldLabel(['tabs', 0, 'bullets', 2])).toBe('Apartado 1 · Punto 3');
    expect(fieldLabel(['title'])).toBe('Título');
  });

  test('un texto dentro de una lista guarda la lista entera, con lo demás como estaba', () => {
    const edited = setAt(defaults, ['cards', 1, 'problem'], 'Nuevo');
    const o = textOverrides(defaults, defaults, edited, { seals: [{ size: 'placa', x: 1, y: 2 }] });
    expect(o.cards).toEqual([{ problem: 'A', solution: 'B' }, { problem: 'Nuevo', solution: 'D' }]);
    expect(o.seals).toEqual([{ size: 'placa', x: 1, y: 2 }]);
    expect(o).not.toHaveProperty('title');
  });

  test('volver a escribir el texto del catálogo quita el cambio', () => {
    const current = { ...defaults, title: 'Otro' };
    const o = textOverrides(defaults, current, { ...current, title: 'Lo que pasa' }, { title: 'Otro' });
    expect(o).toEqual({});
  });
});

describe('quitar un apartado', () => {
  test('quita el elemento de la lista y deja los demás', async () => {
    const { removeAt, elementPaths } = await import('./text-fields');
    const p = { tabs: [{ label: 'A', bullets: ['x', 'y', 'z'] }, { label: 'B', bullets: [] }] };
    expect(removeAt(p, ['tabs', 0]).tabs.map((t) => t.label)).toEqual(['B']);
    expect(removeAt(p, ['tabs', 0, 'bullets', 1]).tabs[0].bullets).toEqual(['x', 'z']);
    expect(p.tabs).toHaveLength(2);
    expect(elementPaths(['tabs', 0, 'bullets', 2])).toEqual([['tabs', 0], ['tabs', 0, 'bullets', 2]]);
  });
});
