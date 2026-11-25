/**
 * ¿Es la misma persona? (criterio de Cristian, 25-nov-2026: en Havana salían «Mireia» y «Mireia Havana», «José María» y
 * «Jose Maria Havana»). Los contactos del móvil suelen llevar la empresa detrás del nombre; al apuntar, la IA lo copia
 * tal cual y se creaba otra persona. Dentro de una empresa: mismo teléfono o email, o el mismo nombre sin tildes y sin
 * las palabras del nombre de la empresa (o uno es el principio del otro: «Mireia» y «Mireia López»).
 */
import { nameKey } from './prospect';

export interface PersonLike { name: string; phone?: string | null; email?: string | null }
const digits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-9);

/** El nombre sin la empresa pegada detrás («Mireia Havana» en Havana → «Mireia»); si no queda nada, tal cual. */
export function withoutCompany(name: string, company: string): string {
  const co = new Set(nameKey(company).split(' ').filter((w) => w.length >= 3));
  const words = name.trim().split(/\s+/);
  let end = words.length;
  while (end > 1 && co.has(nameKey(words[end - 1]!))) end--;
  return words.slice(0, end).join(' ');
}
const tokens = (name: string, company: string) => nameKey(withoutCompany(name, company)).split(' ').filter(Boolean);

export function samePerson(a: PersonLike, b: PersonLike, company: string): boolean {
  if (digits(a.phone).length === 9 && digits(a.phone) === digits(b.phone)) return true;
  if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) return true;
  const x = tokens(a.name, company), y = tokens(b.name, company);
  if (!x.length || !y.length || x[0] !== y[0]) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w, i) => long[i] === w);
}
