import { describe, expect, test } from 'vitest';
import { resolveItemPrice, resolveTotal } from './pricing';

const item = (defaultPrice: number | null, priceOverride: number | null) => ({ defaultPrice, priceOverride, currency: 'EUR' });
const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('pricing', () => {
  test('per_module: override ?? default', () => {
    expect(resolveItemPrice(item(450, null), 'per_module', 'EUR', 'es-ES')?.amount).toBe(450);
    expect(resolveItemPrice(item(450, 250), 'per_module', 'EUR', 'es-ES')?.amount).toBe(250);
    expect(resolveItemPrice(item(null, null), 'per_module', 'EUR', 'es-ES')).toBeNull();
    expect(resolveItemPrice(item(0, null), 'per_module', 'EUR', 'es-ES')?.amount).toBe(0);
  });

  test('none/total: sin precio por item', () => {
    expect(resolveItemPrice(item(450, 250), 'none', 'EUR', 'es-ES')).toBeNull();
    expect(resolveItemPrice(item(450, 250), 'total', 'EUR', 'es-ES')).toBeNull();
  });

  test('total del dossier según modo', () => {
    const items = [item(450, null), item(300, 250), item(null, null)];
    const base = { totalPrice: 1500, currency: 'EUR', locale: 'es-ES', items: items as never };
    expect(resolveTotal({ ...base, priceMode: 'none' })).toBeNull();
    expect(resolveTotal({ ...base, priceMode: 'total' })?.amount).toBe(1500);
    const pm = resolveTotal({ ...base, priceMode: 'per_module' })!;
    expect(pm.amount).toBe(700);
    expect(nbsp(pm.formatted)).toBe('700 €');
  });

  test('per_module sin ningún precio → sin total', () => {
    expect(resolveTotal({ priceMode: 'per_module', totalPrice: null, currency: 'EUR', locale: 'es-ES', items: [item(null, null)] as never })).toBeNull();
  });

  test('decimales y redondeo', () => {
    const t = resolveTotal({ priceMode: 'per_module', totalPrice: null, currency: 'EUR', locale: 'es-ES', items: [item(0.1, null), item(0.2, null)] as never })!;
    expect(t.amount).toBe(0.3);
  });
});

describe('cupones', () => {
  const base = { priceMode: 'total' as const, totalPrice: 1000, currency: 'EUR', locale: 'es-ES', items: [] };
  test('porcentaje, fijo y meses gratis, al céntimo', () => {
    const p = resolveTotal({ ...base, discount: { code: 'LANZA30', label: '30 % de lanzamiento', kind: 'percent', value: 3000 } })!;
    expect(p.amount).toBe(700);
    expect(nbsp(p.before!.formatted)).toBe('1000 €');
    expect(p.discount).toEqual({ code: 'LANZA30', label: '30 % de lanzamiento', kind: 'percent' });
    expect(resolveTotal({ ...base, totalPrice: 99.99, discount: { code: 'X', label: 'x', kind: 'percent', value: 3333 } })!.amount).toBe(66.66);
    expect(resolveTotal({ ...base, discount: { code: 'F', label: '150 € menos', kind: 'fixed', value: 15_000 } })!.amount).toBe(850);
    expect(resolveTotal({ ...base, totalPrice: 100, discount: { code: 'F', label: 'x', kind: 'fixed', value: 15_000 } })!.amount).toBe(0);
    const free = resolveTotal({ ...base, discount: { code: 'M', label: 'Primer mes gratis', kind: 'free_months', value: 1 } })!;
    expect(free.amount).toBe(1000);
    expect(free.before).toBeUndefined();
    expect(free.discount?.label).toBe('Primer mes gratis');
  });
});
