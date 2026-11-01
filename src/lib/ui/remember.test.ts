/** Filtros que se recuerdan (§23): vuelves a la lista o al mapa y siguen los de la última vez; `?todo=1`, sin filtros. */
import type { AstroCookies } from 'astro';
import { describe, expect, test } from 'vitest';
import type { Zone } from '../accounts/types';
import { COUNTRY_COOKIE, myCountry, rememberedFilters, saveFilters } from './remember';

/** Galletas en memoria (lo justo de AstroCookies). */
function jar(init: Record<string, string> = {}) {
  const store = new Map(Object.entries(init));
  const sets: Array<{ key: string; value: string; opts: Record<string, unknown> }> = [];
  const cookies = {
    get: (k: string) => (store.has(k) ? { value: store.get(k)! } : undefined),
    set: (k: string, v: string, opts: Record<string, unknown>) => { store.set(k, v); sets.push({ key: k, value: v, opts }); },
  } as unknown as AstroCookies;
  return { cookies, store, sets };
}
const zone = (id: string, parentId: string | null, kind: Zone['kind'] = 'city'): Zone => ({ id, tenantId: 't', parentId, name: id, kind, position: 0, lat: null, lng: null });
const ZONES = [zone('es', null, 'country'), zone('cv', 'es', 'region'), zone('vlc', 'cv', 'province'), zone('pt', null, 'country'), zone('lis', 'pt')];
const url = (qs: string) => new URL(`https://enjoy.test/admin/accounts${qs}`);

describe('filtros recordados', () => {
  test('con filtros propios en la URL, mandan los de la URL (y no se restaura nada)', () => {
    const { cookies } = jar({ co_f_list: 'zona=vlc' });
    const r = rememberedFilters(url('?q=sol&ok=1'), cookies, 'co_f_list');
    expect([r.q.get('q'), r.q.get('zona'), r.restored, r.fresh]).toEqual(['sol', null, false, false]);
  });

  test('sin filtros en la URL: los de la última vez, con los avisos de ahora encima', () => {
    const { cookies } = jar({ co_f_list: 'zona=vlc&q=club&ok=viejo' });
    const r = rememberedFilters(url('?ok=guardado&n=3'), cookies, 'co_f_list');
    expect(Object.fromEntries(r.q)).toEqual({ zona: 'vlc', q: 'club', ok: 'guardado', n: '3' });
    expect([r.restored, r.fresh]).toEqual([true, false]);
  });

  test('la primera vez (sin galleta): vacío y «fresh» (la página pone el país de quien entra)', () => {
    const r = rememberedFilters(url(''), jar().cookies, 'co_f_list');
    expect([r.q.toString(), r.restored, r.fresh]).toEqual(['', false, true]);
  });

  test('`?todo=1` es «sin filtros, a propósito»: no restaura aunque haya galleta', () => {
    const r = rememberedFilters(url('?todo=1'), jar({ co_f_list: 'zona=vlc' }).cookies, 'co_f_list');
    expect([r.q.get('zona'), r.restored, r.fresh]).toEqual([null, false, false]);
  });

  test('cada pantalla tiene su galleta (la lista no pisa al mapa)', () => {
    const { cookies } = jar({ co_f_list: 'q=lista', co_f_map: 'q=mapa' });
    expect(rememberedFilters(url(''), cookies, 'co_f_map').q.get('q')).toBe('mapa');
  });

  test('guardar: sin avisos ni vacíos; solo en /admin, httpOnly y 90 días', () => {
    const { cookies, sets } = jar();
    saveFilters(cookies, 'co_f_list', new URLSearchParams('q=sol&ok=1&n=2&tag=&todo=1'), ZONES);
    expect(sets).toEqual([{ key: 'co_f_list', value: 'q=sol', opts: { path: '/admin', maxAge: 60 * 60 * 24 * 90, sameSite: 'lax', httpOnly: true } }]);
  });

  test('sin filtros también se recuerda («todo=1»): al volver no reaparece el país por defecto', () => {
    const { cookies, store } = jar();
    saveFilters(cookies, 'co_f_list', new URLSearchParams('ok=1'), ZONES);
    expect(store.get('co_f_list')).toBe('todo=1');
    const r = rememberedFilters(url(''), cookies, 'co_f_list');
    expect([r.q.get('todo'), r.restored, r.fresh]).toEqual(['1', true, false]);
  });

  test('si se eligió un sitio, se recuerda su país; si la zona no existe, no', () => {
    const a = jar();
    saveFilters(a.cookies, 'co_f_map', new URLSearchParams('zona=vlc'), ZONES);
    expect(a.store.get(COUNTRY_COOKIE)).toBe('es');
    const b = jar();
    saveFilters(b.cookies, 'co_f_map', new URLSearchParams('zona=inventada'), ZONES);
    expect(b.store.has(COUNTRY_COOKIE)).toBe(false);
  });

  test('país por defecto: el elegido la última vez, si no el de mi zona, si no el único con ciudades', () => {
    expect(myCountry(jar({ [COUNTRY_COOKIE]: 'pt' }).cookies, ZONES, ['vlc'])).toBe('pt');
    expect(myCountry(jar({ [COUNTRY_COOKIE]: 'inventado' }).cookies, ZONES, ['vlc'])).toBe('es');
    expect(myCountry(jar().cookies, ZONES, ['lis'])).toBe('pt');
    expect(myCountry(jar().cookies, ZONES, [])).toBeNull();                       // dos países con ciudades: no se adivina
    expect(myCountry(jar().cookies, ZONES.filter((z) => z.id !== 'lis'), [])).toBe('es');
  });
});
