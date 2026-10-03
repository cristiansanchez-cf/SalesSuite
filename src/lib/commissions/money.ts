/**
 * Dinero en céntimos enteros (docs/COMMISSIONS.md §3). Nada de coma flotante: las multiplicaciones van en
 * BigInt y se redondea UNA vez, al céntimo, mitad alejándose de cero.
 */
export function assertCents(n: number, what = 'importe'): number {
  if (!Number.isSafeInteger(n)) throw new Error(`${what}: debe ser un número entero de céntimos (${n})`);
  return n;
}

/** round(a × b / d), mitad alejándose de cero, exacto. */
export function mulDivRound(a: number, b: number, d: number): number {
  assertCents(a); assertCents(b, 'factor'); assertCents(d, 'divisor');
  if (d === 0) throw new Error('división por cero');
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(d);
  const neg = (num < 0n) !== (den < 0n);
  const n = num < 0n ? -num : num;
  const dd = den < 0n ? -den : den;
  const q = (n * 2n + dd) / (dd * 2n);
  const r = Number(neg ? -q : q);
  return assertCents(r, 'resultado');
}

/** Porcentaje en puntos básicos (3000 = 30 %). */
export const pctOf = (cents: number, bps: number) => mulDivRound(cents, bps, 10_000);

/** Euros con decimales (texto de formulario o API) → céntimos, sin pasar por float: «1.234,56», «1234.5», «90». */
export function parseMoney(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Importe no válido');
    return parseMoney(input.toFixed(2));
  }
  let s = input.trim().replace(/\s|€/g, '');
  if (!s) throw new Error('Importe vacío');
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  // El último separador con 1–2 cifras detrás es el decimal; el resto, miles.
  const m = /^(.*?)(?:[.,](\d{1,2}))?$/.exec(s)!;
  const int = m[1].replace(/[.,]/g, '');
  if (!/^\d+$/.test(int || '0') || (m[1] && !/^\d{1,3}([.,]?\d{3})*$|^\d+$/.test(m[1]))) throw new Error('Importe no válido');
  const cents = Number(int || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return assertCents(neg ? -cents : cents);
}

export function formatMoney(cents: number, currency = 'EUR', locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Meses naturales completos entre dos fechas (UTC): del 15/01 al 14/07 son 5; al 15/07, 6. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  const dayA = a.getUTCDate() * 86_400_000 + (a.getTime() % 86_400_000);
  const dayB = b.getUTCDate() * 86_400_000 + (b.getTime() % 86_400_000);
  if (dayB < dayA) m--;
  return m;
}

/** «2026-10» (UTC). */
export const periodOf = (iso: string) => new Date(iso).toISOString().slice(0, 7);
