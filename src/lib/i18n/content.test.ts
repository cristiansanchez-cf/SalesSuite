import { describe, expect, test } from 'vitest';
import { applyTexts, batchTexts, extractTexts, isText, planWork, sourceHash, type ContentItem } from './content';

describe('contenido traducido', () => {
  test('solo texto para leer: ni claves, ni enlaces, ni rutas, ni números', () => {
    expect(isText('Condiciones')).toBe(true);
    expect(isText('Inmersión a las 9:00')).toBe(true);
    expect(isText('como-funciona-v')).toBe(false);
    expect(isText('asset:img/x.png')).toBe(false);
    expect(isText('https://oquea.app')).toBe(false);
    expect(isText('26/02/2026')).toBe(false);
  });

  test('saca los textos de una jugada y de las props de un módulo, sin claves ni medios', () => {
    expect(extractTexts('play', { title: 'Abrir', body: 'Hola {company}', whenToUse: null, key: 'abrir', kind: 'opener' }))
      .toEqual([['title', 'Abrir'], ['body', 'Hola {company}']]);
    const props = { title: 'Tu nombre', screens: [{ screen: 'share-card' }], photo: 'asset:x.webp', cards: [{ icon: 'check', title: 'En todas' }], sample: { cards: ['dive'], activity: 'Inmersión a las 9:00' } };
    expect(extractTexts('module_version', { props })).toEqual([
      ['props/title', 'Tu nombre'], ['props/cards/0/title', 'En todas'], ['props/sample/activity', 'Inmersión a las 9:00'],
    ]);
  });

  test('pone la traducción encima sin tocar el original ni lo que ha cambiado de forma', () => {
    const src = { title: 'Abrir', body: 'Hola', list: ['uno'] };
    const out = applyTexts(src, { title: '열기', 'list/0': '하나', missing: 'x', 'body/0': 'y' });
    expect(out).toEqual({ title: '열기', body: 'Hola', list: ['하나'] });
    expect(src.title).toBe('Abrir');
  });

  test('la huella cambia si cambia un texto', () => {
    expect(sourceHash([['title', 'A']])).not.toBe(sourceHash([['title', 'B']]));
    expect(sourceHash([['title', 'A']])).toHaveLength(32);
  });
});


describe('qué traducir', () => {
  const a: ContentItem = { kind: 'play', ref: 'a', pairs: [['title', 'Abrir']] };
  const b: ContentItem = { kind: 'play', ref: 'b', pairs: [['title', 'Cerrar']] };
  test('solo lo nuevo o cambiado; lo revisado sin cambios se queda; lo que ya no existe se borra', () => {
    const stored = [
      { kind: 'play' as const, ref: 'a', sourceHash: sourceHash(a.pairs), status: 'reviewed' as const },
      { kind: 'play' as const, ref: 'b', sourceHash: 'otra-huella', status: 'auto' as const },
      { kind: 'play' as const, ref: 'z', sourceHash: 'x', status: 'auto' as const },
    ];
    const { todo, stale } = planWork([a, b], stored);
    expect(todo.map((x) => x.ref)).toEqual(['b']);
    expect(stale.map((x) => x.ref)).toEqual(['z']);
    expect(planWork([a, b], stored, true).todo).toHaveLength(2);
  });
  test('tandas de textos únicos', () => {
    const items: ContentItem[] = [a, { ...b, pairs: [['title', 'Abrir'], ['body', 'x'.repeat(10)]] }];
    expect(batchTexts(items, 12)).toEqual([['Abrir'], ['x'.repeat(10)]]);
  });
});
