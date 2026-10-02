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
