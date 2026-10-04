import { describe, expect, test } from 'vitest';
import { splitHeadline } from './headline';

describe('titular a dos tonos', () => {
  test('parte en la primera coma', () => {
    expect(splitHeadline('Tu pantalla, desde tu móvil')).toEqual(['Tu pantalla,', ' desde tu móvil']);
    expect(splitHeadline('El contenido de tu fiesta, para llenar la siguiente')).toEqual(['El contenido de tu fiesta,', ' para llenar la siguiente']);
  });
  test('sin coma, o con una cola de una palabra, va entero', () => {
    expect(splitHeadline('Lo que te pasa hoy')).toEqual(['Lo que te pasa hoy', null]);
    expect(splitHeadline('Hola, Marta')).toEqual(['Hola, Marta', null]);
  });
});
