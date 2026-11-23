/**
 * El nombre de una empresa para compararlo (docs/ORG.md §Propuestas vinculadas): sin mayúsculas, tildes, signos ni
 * «S.L.»/«S.A.» al final. Igual que public.company_key() (migración 20270114): «Zafiro Zone, S.L.» → «zafiro zone».
 */
const FROM = 'áàäâãåéèëêíìïîóòöôõúùüûñçý';
const TO = 'aaaaaaeeeeiiiiooooouuuuncy';

export function companyKey(name: string | null | undefined): string | null {
  const low = [...String(name ?? '').toLowerCase()].map((c) => { const i = FROM.indexOf(c); return i >= 0 ? TO[i] : c; }).join('');
  const k = low.replace(/[^a-z0-9]+/g, ' ').trim().replace(/ (s l u|s l|s a|slu|sl|sa)$/, '');
  return k || null;
}

/** La empresa con ese nombre, si hay una sola (con dos o más, mejor no adivinar). */
export function accountByCompany<T extends { name: string }>(accounts: T[], company: string | null | undefined): T | null {
  const k = companyKey(company);
  if (!k || k.length < 3) return null;
  const hits = accounts.filter((a) => companyKey(a.name) === k);
  return hits.length === 1 ? hits[0]! : null;
}
