import { describe, expect, test } from 'vitest';
import { monthsBetween, mulDivRound, parseMoney, pctOf, periodOf } from './money';

describe('dinero', () => {
  test('porcentajes exactos al céntimo, mitad alejándose de cero', () => {
    expect(pctOf(100_000, 3000)).toBe(30_000);    // 30 % de 1.000 €
    expect(pctOf(27_000, 7000)).toBe(18_900);     // 70 % de 270 €
    expect(pctOf(5, 5000)).toBe(3);               // 2,5 → 3
    expect(pctOf(-5, 5000)).toBe(-3);
    expect(pctOf(1, 3333)).toBe(0);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(2, 1, 3)).toBe(1);
  });
  test('sin pérdida con importes enormes (BigInt)', () => {
    expect(pctOf(9_000_000_000_000, 3333)).toBe(2_999_700_000_000);
    expect(() => pctOf(0.5, 100)).toThrow();
  });
  test('el redondeo nunca se aleja más de medio céntimo del valor exacto', () => {
    for (let c = -2000; c <= 2000; c += 7) for (const bps of [1, 333, 1250, 3000, 6667, 9999]) {
      expect(Math.abs(pctOf(c, bps) - (c * bps) / 10_000)).toBeLessThanOrEqual(0.5);
    }
  });
  test('importes escritos a mano', () => {
    expect(parseMoney('1.000')).toBe(100_000);
    expect(parseMoney('1.234,56')).toBe(123_456);
    expect(parseMoney('1234.5')).toBe(123_450);
    expect(parseMoney('90')).toBe(9_000);
    expect(parseMoney('0,1')).toBe(10);
    expect(parseMoney(' 1 000,00 € ')).toBe(100_000);
    expect(parseMoney(19.99)).toBe(1999);
    expect(parseMoney('-25')).toBe(-2500);
    expect(() => parseMoney('abc')).toThrow();
    expect(() => parseMoney('1,2,3,4')).toThrow();
  });
  test('meses completos y periodo', () => {
    expect(monthsBetween('2026-01-15T10:00:00Z', '2026-07-14T23:00:00Z')).toBe(5);
    expect(monthsBetween('2026-01-15T10:00:00Z', '2026-07-15T10:00:00Z')).toBe(6);
    expect(monthsBetween('2026-01-31T00:00:00Z', '2026-02-28T00:00:00Z')).toBe(0);
    expect(monthsBetween('2025-11-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(2);
    expect(periodOf('2026-10-03T23:59:59Z')).toBe('2026-10');
  });
});
