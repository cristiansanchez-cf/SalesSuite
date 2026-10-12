import { describe, expect, it } from 'vitest';
import type { PriceOption } from '../admin/types';
import { chargeable, suggestTariff, withCoupon } from './charge';

const opt = (id: string, o: Partial<PriceOption> = {}): PriceOption => ({
  id, label: id, amount: 100, currency: 'EUR', period: 'month', paymentLink: `https://buy.stripe.com/${id}`, segmentId: null, position: 0, active: true, ...o,
});

describe('Generar pago: la tarifa que sale marcada', () => {
  const os = [
    opt('boda', { segmentId: 'bodas', isDefault: true, position: 1 }),
    opt('mediano', { segmentId: 'noche', size: 'medium', isDefault: true, position: 2 }),
    opt('pequeno', { segmentId: 'noche', size: 'small', position: 3 }),
    opt('grande', { segmentId: 'noche', size: 'large', position: 4 }),
    opt('festival', { quoteOnly: true, position: 5 }),
    opt('sin-enlace', { paymentLink: null, position: 6 }),
  ];
  it('solo las que se cobran con enlace', () => expect(chargeable(os).map((o) => o.id)).toEqual(['boda', 'mediano', 'pequeno', 'grande']));
  it('la de su tamaño', () => {
    expect(suggestTariff(os, { size: 'small', segmentId: 'noche' })?.id).toBe('pequeno');
    expect(suggestTariff(os, { size: 'large', segmentId: 'noche' })?.id).toBe('grande');
  });
  it('sin tamaño: la típica de su sector', () => expect(suggestTariff(os, { segmentId: 'noche' })?.id).toBe('mediano'));
  it('tamaño sin tarifa propia: no la de otro tamaño', () => expect(suggestTariff(os, { size: 'huge', segmentId: 'bodas' })?.id).toBe('boda'));
  it('nada que cobrar', () => expect(suggestTariff([opt('x', { active: false })], {})).toBeNull());
});

describe('Generar pago: cupón', () => {
  it('porcentaje, fijo y meses gratis', () => {
    expect(withCoupon(249, { kind: 'percent', value: 2000 })).toBe(199.2);
    expect(withCoupon(249, { kind: 'fixed', value: 5000 })).toBe(199);
    expect(withCoupon(249, { kind: 'free_months', value: 1 })).toBe(0);
    expect(withCoupon(249, null)).toBe(249);
  });
});
