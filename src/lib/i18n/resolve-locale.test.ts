import { describe, expect, test } from 'vitest';
import { fromAcceptLanguage, resolveLocale } from './core';

describe('resolveLocale (docs/I18N.md): lo elegido → idioma del espacio → español', () => {
  test('sin nada: español', () => {
    expect(resolveLocale({})).toBe('es');
    expect(resolveLocale({ user: null, cookie: null, tenant: null, accept: null })).toBe('es');
  });
  test('el navegador nunca decide, diga lo que diga', () => {
    for (const accept of ['en-US,en;q=0.9', 'pt-BR', 'ko-KR,ko;q=0.9', 'en', '*', 'fr-FR,fr;q=0.9,en;q=0.8']) {
      expect(resolveLocale({ accept })).toBe('es');
    }
  });
  test('cada idioma soportado, por preferencia guardada, por cookie o por el espacio', () => {
    for (const l of ['es', 'en', 'pt', 'ko'] as const) {
      expect(resolveLocale({ user: l, accept: 'en' })).toBe(l);
      expect(resolveLocale({ cookie: l, accept: 'ko' })).toBe(l);
      expect(resolveLocale({ tenant: l })).toBe(l);
    }
  });
  test('la preferencia de la cuenta gana a la cookie, y la cookie al idioma del espacio', () => {
    expect(resolveLocale({ user: 'pt', cookie: 'ko', tenant: 'en-GB' })).toBe('pt');
    expect(resolveLocale({ cookie: 'ko', tenant: 'en-GB' })).toBe('ko');
    // Elegir español explícitamente gana a un espacio en inglés.
    expect(resolveLocale({ cookie: 'es', tenant: 'en-GB' })).toBe('es');
    expect(resolveLocale({ user: 'es', cookie: 'en' })).toBe('es');
  });
  test('valores no soportados o raros se ignoran y se pasa al siguiente', () => {
    expect(resolveLocale({ user: 'fr', cookie: 'pt' })).toBe('pt');
    expect(resolveLocale({ user: '', cookie: 'en' })).toBe('en');
    expect(resolveLocale({ user: 'en-GB', cookie: 'ko' })).toBe('ko');  // la preferencia se guarda como código corto
    expect(resolveLocale({ cookie: 'undefined' })).toBe('es');
    expect(resolveLocale({ cookie: '<script>' })).toBe('es');
    expect(resolveLocale({ cookie: ' en ' })).toBe('es');
    expect(resolveLocale({ user: 'xx', cookie: 'yy', tenant: 'zz' })).toBe('es');
  });
  test('idioma del espacio: etiqueta BCP-47 en cualquier caja; si no es soportado, español', () => {
    expect(resolveLocale({ tenant: 'pt-BR' })).toBe('pt');
    expect(resolveLocale({ tenant: 'KO-kr' })).toBe('ko');
    expect(resolveLocale({ tenant: 'EN' })).toBe('en');
    expect(resolveLocale({ tenant: 'fr-FR' })).toBe('es');
    expect(resolveLocale({ tenant: '' })).toBe('es');
    expect(resolveLocale({ tenant: 'e' })).toBe('es');
  });
  test('la cookie y la preferencia distinguen mayúsculas (se guardan en minúscula)', () => {
    expect(resolveLocale({ cookie: 'EN' })).toBe('es');
    expect(resolveLocale({ user: 'Pt', tenant: 'ko' })).toBe('ko');
  });
});

describe('fromAcceptLanguage: el mejor idioma del navegador (solo informa, no decide)', () => {
  test('vacío, nulo o sin idiomas soportados', () => {
    expect(fromAcceptLanguage(null)).toBeNull();
    expect(fromAcceptLanguage(undefined)).toBeNull();
    expect(fromAcceptLanguage('')).toBeNull();
    expect(fromAcceptLanguage('fr-FR,de;q=0.9')).toBeNull();
    expect(fromAcceptLanguage('*')).toBeNull();
  });
  test('por calidad, mayúsculas y espacios', () => {
    expect(fromAcceptLanguage('EN-us')).toBe('en');
    expect(fromAcceptLanguage(' pt-BR ; q=0.4 , ko ; q=0.8')).toBe('ko');
    expect(fromAcceptLanguage('en;q=abc, pt;q=0.1')).toBe('pt');
  });
});
