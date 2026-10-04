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
  test('en la portada, sin coma, parte antes del último nexo', () => {
    expect(splitHeadline('Lo próximo que van a copiarte', true)).toEqual(['Lo próximo', ' que van a copiarte']);
    expect(splitHeadline('Lo que tus huéspedes van a contar cuando vuelvan a casa', true)).toEqual(['Lo que tus huéspedes van a contar', ' cuando vuelvan a casa']);
    expect(splitHeadline('Tu pantalla, trabajando toda la noche', true)).toEqual(['Tu pantalla,', ' trabajando toda la noche']);
    expect(splitHeadline('La herramienta que te faltaba para lo que ya montas', true)).toEqual(['La herramienta que te faltaba', ' para lo que ya montas']);
    expect(splitHeadline('Tu pantalla, vendiendo', true)).toEqual(['Tu pantalla,', ' vendiendo']);
    expect(splitHeadline('La hora en la que no pasa nada', true)).toEqual(['La hora en la que no pasa nada', null]);
    expect(splitHeadline('Lo que te pasa hoy', true)).toEqual(['Lo que te pasa hoy', null]);
    expect(splitHeadline('Lo próximo que van a copiarte')).toEqual(['Lo próximo que van a copiarte', null]);
  });
});
