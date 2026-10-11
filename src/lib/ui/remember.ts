/**
 * Filtros que se recuerdan (§23, criterio de Cristian: «cada vez que entras en el detalle y vas para atrás tienes que
 * volver a hacer la búsqueda»). Si se llega a la lista o al mapa sin filtros en la URL (desde el menú o «← Empresas»),
 * se usan los de la última vez; si es la primera, el país de quien entra. `?todo=1` es «sin filtros, a propósito».
 * Van en cookies de este navegador (no hace falta configurar nada).
 */
import type { AstroCookies } from 'astro';
import type { Zone } from '../accounts/types';
import { countryOf, defaultCountry } from '../accounts/places';

const OPTS = { path: '/admin', maxAge: 60 * 60 * 24 * 90, sameSite: 'lax' as const, httpOnly: true };
const PASS = ['ok', 'n', 'todo'];
export const COUNTRY_COOKIE = 'co_pais';

export function rememberedFilters(url: URL, cookies: AstroCookies, key: string): { q: URLSearchParams; restored: boolean; fresh: boolean } {
  const own = [...url.searchParams.keys()].some((k) => !PASS.includes(k));
  if (own || url.searchParams.has('todo')) return { q: url.searchParams, restored: false, fresh: false };
  const saved = cookies.get(key)?.value;
  const q = new URLSearchParams(saved ?? '');
  for (const k of ['ok', 'n']) { const v = url.searchParams.get(k); if (v !== null) q.set(k, v); }
  return { q, restored: !!saved, fresh: !saved };
}

/** Guarda los filtros de ahora (sin los avisos) y, si se eligió un sitio, su país. */
export function saveFilters(cookies: AstroCookies, key: string, q: URLSearchParams, zones: Zone[]) {
  const keep = new URLSearchParams([...q].filter(([k, v]) => !PASS.includes(k) && v));
  cookies.set(key, keep.size ? keep.toString() : 'todo=1', OPTS);   // vacío también se recuerda (no vuelve el país)
  const zona = keep.get('zona');
  const c = zona ? countryOf(zones, zona) : null;
  if (c) cookies.set(COUNTRY_COOKIE, c.id, OPTS);
}

/** El país por defecto de quien entra (el que eligió la última vez, el de su zona o el único que hay). */
export const myCountry = (cookies: AstroCookies, zones: Zone[], myZoneIds: string[]) => defaultCountry(zones, myZoneIds, cookies.get(COUNTRY_COOKIE)?.value);
