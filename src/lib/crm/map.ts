/**
 * Mapa del CRM (docs/CRM_DINAMICO.md §16). Lógica pura: qué va en su sitio exacto (ubicación de Google), qué va en el
 * punto de su ciudad (no tiene ubicación, pero su ciudad sí; «aproximada») y qué no se puede situar.
 * Además: caliente / se enfría, y quién lleva la zona de cada empresa (para colorear por comercial).
 */
import type { Zone } from '../accounts/types';
import type { AccountView } from '../accounts/service';
import type { Priority } from './priority';

/** Desde estos puntos (y sin enfriarse ni estar fuera) una empresa está «caliente». */
export const HOT_SCORE = 60;
export type Temperature = 'hot' | 'cold' | 'unqualified' | 'normal';
export type TempFilter = '' | 'caliente' | 'frio' | 'sin';

export function temperature(p: Priority, coolingDays: number | undefined): Temperature {
  if (p.out || coolingDays !== undefined) return 'cold';
  if (!p.qualified) return 'unqualified';
  return p.score >= HOT_SCORE ? 'hot' : 'normal';
}
export const matchesTemp = (t: Temperature, f: TempFilter) =>
  !f || (f === 'caliente' && t === 'hot') || (f === 'frio' && t === 'cold') || (f === 'sin' && t === 'unqualified');

/** Quién lleva la zona de una empresa: la asignación más cercana subiendo por sus zonas (la ciudad, su provincia…). */
export function zoneOwners(zones: Zone[], assignments: Array<{ userId: string; zoneId: string }>): (zoneId: string | null) => string[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const at = new Map<string, string[]>();
  for (const a of assignments) at.set(a.zoneId, [...(at.get(a.zoneId) ?? []), a.userId]);
  return (zoneId) => {
    for (let z = zoneId ? byId.get(zoneId) : undefined, i = 0; z && i < 10; z = z.parentId ? byId.get(z.parentId) : undefined, i++) {
      const who = at.get(z.id);
      if (who?.length) return who;
    }
    return [];
  };
}

export interface MapPoint {
  id: string; name: string; lat: number; lng: number; exact: boolean; kind: Priority['kind']; state: AccountView['state']; zone: string; temp: Temperature; score: number;
  cooling: number | null; next: string | null; rating: number | null; owner: string | null; rep: string | null;
}
export interface MapData { points: MapPoint[]; exact: number; approx: number; unlocated: number; noCity: number }

export function buildMap(items: AccountView[], zones: Zone[], o: {
  prio: (a: AccountView) => Priority; cooling: Map<string, number>; rep: (zoneId: string | null) => string | null;
}): MapData {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const points: MapPoint[] = [];
  let exact = 0;
  let unlocated = 0;
  let noCity = 0;
  for (const a of items) {
    const z = a.zoneId ? byId.get(a.zoneId) : undefined;
    const own = a.lat != null && a.lng != null;
    if (!own && !z) { noCity++; continue; }
    if (!own && (z!.lat == null || z!.lng == null)) { unlocated++; continue; }
    const p = o.prio(a);
    if (own) exact++;
    points.push({ id: a.id, name: a.name, lat: own ? a.lat! : z!.lat!, lng: own ? a.lng! : z!.lng!, exact: own, kind: p.kind, state: a.state, zone: a.zonePath,
      temp: temperature(p, o.cooling.get(a.id)), score: p.score, cooling: o.cooling.get(a.id) ?? null, next: a.nextStep, rating: a.placeRating,
      owner: a.ownerName, rep: o.rep(a.zoneId) });
  }
  return { points, exact, approx: points.length - exact, unlocated, noCity };
}

/** Colores fijos por estado y una paleta para los comerciales (en orden). */
export const STATE_COLOR: Record<AccountView['state'], string> = {
  mine: '#6a2bd9', free: '#15803d', taken: '#9ca3af', my_customer: '#0e7490', customer: '#2563eb', blocked: '#b42318',
};
/** Icono de cada tipo (del set de la consola). */
export const KIND_ICON = { venue: 'music', promoter: 'megaphone', concert: 'ticket' } as const;
export const REP_COLORS = ['#6a2bd9', '#0e7490', '#c2410c', '#15803d', '#be185d', '#2563eb', '#a16207', '#4d7c0f', '#7c3aed', '#0f766e'];
