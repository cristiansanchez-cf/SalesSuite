import { describe, expect, it } from 'vitest';
import { countOf, formatCount, plain, rich } from './ui';

describe('deck ui', () => {
  it('rich: acento y negrita', () => {
    expect(rich('Ronda semilla de *150.000€.*')).toEqual([{ text: 'Ronda semilla de ' }, { text: '150.000€.', accent: true }]);
    expect(rich('ya **genera ingresos** y *rápido*')).toEqual([{ text: 'ya ' }, { text: 'genera ingresos', bold: true }, { text: ' y ' }, { text: 'rápido', accent: true }]);
    expect(plain('a *b* **c**')).toBe('a b c');
  });
  it('countOf: cifras con sus separadores', () => {
    const c = countOf('47.500€')!;
    expect([c.prefix, c.target, c.suffix, formatCount(c.target, c)]).toEqual(['', 47500, '€', '47.500']);
    const d = countOf('~9,700')!;
    expect([d.prefix, d.target, formatCount(d.target, d)]).toEqual(['~', 9700, '9,700']);
    const e = countOf('26,3%')!;
    expect([e.target, e.decimals, formatCount(e.target, e), e.suffix]).toEqual([26.3, 1, '26,3', '%']);
    expect(countOf('200+')!.suffix).toBe('+');
    expect(countOf('~€4k solo en pujas')!.prefix).toBe('~€');
    expect(countOf('24% de pago')!.target).toBe(24);
    expect(countOf('—')).toBeNull();
    expect(formatCount(1500000, { decimals: 0, group: '.', dec: ',' })).toBe('1.500.000');
  });
});
