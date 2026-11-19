/** Formato de teléfono para leer y mientras se escribe (sin dependencias: lo usa también el navegador). */
/** Prefijos de país de 1 y 2 cifras (el resto, de 3): para separar «+34 694 904 149». */
const CC1 = new Set(['1', '7']);
const CC2 = new Set(['20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98']);

/**
 * Un teléfono como se lee: «+34 694 904 149», «694 904 149». Con «+», el prefijo del país aparte; el resto, de 3 en 3.
 * Lo usa también el navegador mientras se escribe (mismo código en el script de Mi cuenta).
 */
export function formatPhone(raw: string): string {
  const v = String(raw ?? '');
  const plus = v.trim().startsWith('+');
  const d = v.replace(/\D/g, '').slice(0, 15);
  if (!d) return plus ? '+' : '';
  const groups = (s: string) => s.match(/.{1,3}/g)?.join(' ') ?? '';
  if (!plus) return groups(d);
  const cc = CC1.has(d[0]!) ? d.slice(0, 1) : CC2.has(d.slice(0, 2)) ? d.slice(0, 2) : d.slice(0, 3);
  const rest = d.slice(cc.length);
  return `+${cc}${rest ? ` ${groups(rest)}` : ''}`;
}
