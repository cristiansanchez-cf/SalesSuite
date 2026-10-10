import { describe, expect, test } from 'vitest';
import { applyTranslations, overrideTexts, readTranslations, systemPrompt } from './translate';

describe('traducir los textos propios de una propuesta', () => {
  const props = { title: 'Tu centro, lleno todo el año', cta: { label: 'Reserva tu demo', href: 'https://oquea.com' }, color: '#00aaff', items: ['Más buceadores', '2026'], key: 'hero.bg' };
  test('solo los textos (sin URLs, colores, números ni claves)', () => {
    expect(overrideTexts(props)).toEqual(['Tu centro, lleno todo el año', 'Reserva tu demo', 'Más buceadores']);
  });
  test('se cambian los textos y se respeta la forma', () => {
    const out = applyTranslations(props, new Map([['Reserva tu demo', '데모 예약'], ['Más buceadores', '더 많은 다이버']]));
    expect(out).toEqual({ ...props, cta: { label: '데모 예약', href: 'https://oquea.com' }, items: ['더 많은 다이버', '2026'] });
  });
  test('las claves que no son texto no se traducen (tip.kind «info» rompía el bloque)', () => {
    const p = { tip: { kind: 'info', text: 'Va por fases' }, screens: [{ screen: 'map', icon: 'pin' }] };
    expect(overrideTexts(p)).toEqual(['Va por fases']);
    const out = applyTranslations(p, new Map([['info', '안내'], ['Va por fases', '단계별로 진행'], ['map', '지도']]));
    expect(out).toEqual({ tip: { kind: 'info', text: '단계별로 진행' }, screens: [{ screen: 'map', icon: 'pin' }] });
  });
  test('lo que devuelve la IA: solo índices pedidos y textos no vacíos', () => {
    const m = readTranslations({ items: [{ i: 0, t: '하나' }, { i: 5, t: 'x' }, { i: 1, t: ' ' }, { i: 'a', t: 'y' }] }, ['uno', 'dos']);
    expect([...m]).toEqual([['uno', '하나']]);
  });
  test('el prompt lleva el idioma y el glosario del espacio', () => {
    const p = systemPrompt('Oquea', 'ko-KR', ['centro de buceo → 다이빙 센터']);
    expect(p).toContain('Korean');
    expect(p).toContain('centro de buceo → 다이빙 센터');
  });
});
