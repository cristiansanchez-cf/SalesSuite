/**
 * Enlace de pago (docs/COMMISSIONS.md §Tarifas). Las tarifas guardan el Payment Link de Stripe; la consola le añade:
 *  · client_reference_id = la propuesta (y por ella, el vendedor): Stripe lo devuelve en el checkout y en el webhook,
 *    así cada pago se atribuye a quien lo vendió.
 *  · prefilled_promo_code = el cupón elegido (el mismo código tiene que existir como promotion code en Stripe).
 * Solo se tocan enlaces https; si el enlace no es de Stripe se devuelve igual, con los mismos parámetros.
 */
export const paymentRef = (dossierId: string) => `dossier_${dossierId}`;

export function paymentUrl(link: string, o: { dossierId: string; couponCode?: string | null }): string | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  u.searchParams.set('client_reference_id', paymentRef(o.dossierId));
  if (o.couponCode && /^[A-Z0-9][A-Z0-9-]{1,31}$/.test(o.couponCode)) u.searchParams.set('prefilled_promo_code', o.couponCode);
  else u.searchParams.delete('prefilled_promo_code');
  return u.toString();
}
