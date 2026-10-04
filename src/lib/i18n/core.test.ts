import { describe, expect, test } from 'vitest';
import { formatters, fromAcceptLanguage, resolveLocale } from './core';

describe('idiomas', () => {
  test('preferencia guardada, cookie, navegador, espacio', () => {
    expect(resolveLocale({ user: 'ko', cookie: 'en', accept: 'pt-BR' })).toBe('ko');
    expect(resolveLocale({ user: null, cookie: 'en', accept: 'pt-BR' })).toBe('en');
    // El navegador no decide: español salvo que se elija otro idioma.
    expect(resolveLocale({ accept: 'pt-BR,pt;q=0.9,en;q=0.8' })).toBe('es');
    expect(resolveLocale({ accept: 'en-GB', tenant: 'es-ES' })).toBe('es');
    expect(resolveLocale({ accept: 'fr-FR,fr;q=0.9', tenant: 'en-GB' })).toBe('en');
    expect(resolveLocale({ user: 'xx', accept: 'de' })).toBe('es');
    expect(fromAcceptLanguage('de;q=1, ko;q=0.5, en;q=0.7')).toBe('en');
  });
  test('formatos según idioma', () => {
    expect(formatters('es').money(123_456).replace(/\s/g, ' ')).toBe('1234,56 €');
    expect(formatters('en').money(123_456)).toBe('€1,234.56');
    expect(formatters('pt').money(123_456).replace(/\s/g, ' ')).toBe('€ 1.234,56');
    expect(formatters('ko').money(123_456, 'KRW')).toMatch(/₩/);
    expect(formatters('en').relative(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2 days ago');
  });
});
