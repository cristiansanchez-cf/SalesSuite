import { describe, expect, it } from 'vitest';
import { paymentUrl } from './payment';

describe('enlace de pago', () => {
  const D = '0d0c0b0a-0000-4000-8000-000000000001';
  it('añade la propuesta (vendedor) y el cupón', () => {
    const u = new URL(paymentUrl('https://buy.stripe.com/abc123', { dossierId: D, couponCode: 'LANZA30' })!);
    expect(u.searchParams.get('client_reference_id')).toBe(`dossier_${D}`);
    expect(u.searchParams.get('prefilled_promo_code')).toBe('LANZA30');
  });
  it('sin cupón no hay código; conserva otros parámetros', () => {
    const u = new URL(paymentUrl('https://buy.stripe.com/abc123?locale=es&prefilled_promo_code=VIEJO', { dossierId: D })!);
    expect(u.searchParams.get('prefilled_promo_code')).toBeNull();
    expect(u.searchParams.get('locale')).toBe('es');
  });
  it('rechaza lo que no es https', () => {
    expect(paymentUrl('http://buy.stripe.com/x', { dossierId: D })).toBeNull();
    expect(paymentUrl('javascript:alert(1)', { dossierId: D })).toBeNull();
    expect(paymentUrl('no es un enlace', { dossierId: D })).toBeNull();
  });
});
