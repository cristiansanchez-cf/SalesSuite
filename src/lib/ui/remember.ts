/**
 * Filtros que se recuerdan (§23, criterio de Cristian: «cada vez que entras en el detalle y vas para atrás tienes que
 * volver a hacer la búsqueda»), pero solo DENTRO del CRM: si la página anterior era del CRM (la ficha de una empresa,
 * el mapa…), al volver a la lista sigue la búsqueda. Si se viene de otra sección, o al día siguiente, se entra limpio:
 * primera pestaña y sin filtros (criterio de Cristian: «ayer miraba promotoras y hoy sigo ahí: ¿dónde están mis
 * empresas?»). El rastro lo pone el middleware (CRM_TRAIL). `?todo=1` es «sin filtros, a propósito».
 */
import type { AstroCookies } from 'astro';
import type { Zone } from '../accounts/types';
import { countryOf, defaultCountry } from '../accounts/places';

const OPTS = { path: '/admin', maxAge: 60 * 60 * 24 * 90, sameSite: 'lax' as const, httpOnly: true };
/** Cookie del rastro: la última página era del CRM (la pone y la quita el middleware; 4 horas como mucho). */
export const CRM_TRAIL = 'co_crm';
/** Páginas del CRM (lo que deja recuperar los filtros al volver a la lista). */
export const isCrmPath = (path: string) => /^\/admin\/(accounts|people|leads)(\/|$)/.test(path);
const PASS = ['ok', 'n', 'todo'];
export const COUNTRY_COOKIE = 'co_pais';

/** `trail`: la página anterior era del CRM (Astro.locals.crmTrail). Sin él, nada de lo guardado: entrar limpio. */
export function rememberedFilters(url: URL, cookies: AstroCookies, key: string, trail = true): { q: URLSearchParams; restored: boolean; fresh: boolean } {
  const own = [...url.searchParams.keys()].some((k) => !PASS.includes(k));
  if (own || url.searchParams.has('todo')) return { q: url.searchParams, restored: false, fresh: false };
  const saved = trail ? cookies.get(key)?.value : undefined;
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
