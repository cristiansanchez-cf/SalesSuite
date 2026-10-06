import { describe, expect, test } from 'vitest';
import { splitHeadline } from './headline';

describe('titular de la portada (loose = true)', () => {
  test('con coma: la cola puede ser de una palabra; sin loose, no', () => {
    expect(splitHeadline('Hola, Marta', true)).toEqual(['Hola,', ' Marta']);
    expect(splitHeadline('Hola, Marta')).toEqual(['Hola, Marta', null]);
  });
  test('la coma demasiado pronto (antes del 3.er carácter) no parte, y con coma no se busca nexo', () => {
    expect(splitHeadline('Sí, que vuelvan cuando quieran', true)).toEqual(['Sí, que vuelvan cuando quieran', null]);
  });
  test('coma pegada o al final', () => {
    expect(splitHeadline('Tu pantalla,vendiendo para ti', true)).toEqual(['Tu pantalla,vendiendo', ' para ti']);
    expect(splitHeadline('Tu pantalla,', true)).toEqual(['Tu pantalla,', null]);
  });
  test('nexos en inglés también parten', () => {
    expect(splitHeadline('The screen that sells for you', true)).toEqual(['The screen that sells', ' for you']);
    expect(splitHeadline('Your crowd on screen while you work', true)).toEqual(['Your crowd on screen', ' while you work']);
  });
  test('el nexo no distingue mayúsculas', () => {
    expect(splitHeadline('Tu local CUANDO cierra la puerta', true)).toEqual(['Tu local', ' CUANDO cierra la puerta']);
  });
  test('parte en el ÚLTIMO nexo válido', () => {
    expect(splitHeadline('Fotos que se suben solas mientras bailan', true)).toEqual(['Fotos que se suben solas', ' mientras bailan']);
  });
  test('hacen falta dos palabras o más a cada lado', () => {
    expect(splitHeadline('Fiesta para todos los públicos', true)).toEqual(['Fiesta para todos los públicos', null]);
    expect(splitHeadline('Lo mejor de la noche para', true)).toEqual(['Lo mejor de la noche para', null]);
    expect(splitHeadline('Tu sala llena cuando quieras', true)).toEqual(['Tu sala llena', ' cuando quieras']);
  });
  test('no deja un artículo o preposición colgando; prueba un nexo anterior', () => {
    expect(splitHeadline('Lo que pasa cuando suena la que esperas', true)).toEqual(['Lo que pasa', ' cuando suena la que esperas']);
    expect(splitHeadline('The night of the year with friends', true)).toEqual(['The night of the year', ' with friends']);
  });
  test('sin nexo, vacío o de una palabra: entero', () => {
    expect(splitHeadline('Tu noche en grande', true)).toEqual(['Tu noche en grande', null]);
    expect(splitHeadline('', true)).toEqual(['', null]);
    expect(splitHeadline('Enjoy', true)).toEqual(['Enjoy', null]);
  });
  test('las dos partes juntas son siempre el titular original', () => {
    for (const t of ['Lo próximo que van a copiarte', 'Tu pantalla, vendiendo', 'La hora en la que no pasa nada', 'The screen that sells for you', 'Hola, Marta', '']) {
      const [a, b] = splitHeadline(t, true);
      expect(a + (b ?? '')).toBe(t);
    }
  });
});
