/**
 * Buscar clientes por zona en Google Maps (docs/CRM_DINAMICO.md §19). Lógica pura: qué se busca, qué sale marcado y
 * qué ya está en el CRM. Google solo se llama en el servicio; aquí no hay IA.
 */
import type { Account, Zone } from '../accounts/types';
import type { PlaceResult } from './places';

/** Lo que se le pide a Google: «discotecas en Valencia, Comunidad Valenciana, España». */
export function areaQuery(what: string, zone: Zone | null, zones: Zone[]): string {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const path: string[] = [];
  for (let z = zone, i = 0; z && i < 6; z = z.parentId ? byId.get(z.parentId) ?? null : null, i++) path.push(z.name);
  const w = what.trim().replace(/\s+/g, ' ');
  return path.length ? `${w} en ${path.join(', ')}` : w;
}

/** Radio de búsqueda alrededor del punto de la zona, según lo grande que es (Google admite hasta 50 km). */
export const RADIUS: Record<Zone['kind'], number> = { area: 3000, city: 12000, province: 40000, region: 50000, country: 50000 };

/** Nombre para comparar: sin tildes, mayúsculas ni signos. */
export const nameKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

export type CandidateState = 'new' | 'have' | 'maybe' | 'closed';
export interface Candidate extends PlaceResult {
  /** new: se importa · have: ya está en el CRM (misma ficha de Google) · maybe: hay una empresa con el mismo nombre ·
   *  closed: Google dice que ha cerrado. Solo «new» sale marcado. */
  state: CandidateState;
  /** La empresa del CRM (si ya está, o la que se llama igual). */
  accountId: string | null;
  accountName: string | null;
  discarded: boolean;
}

/** Cada resultado de Google, con lo que ya sabemos de él en el CRM. Lo importado en esta búsqueda cuenta como «ya está». */
export function markCandidates(results: PlaceResult[], accounts: Pick<Account, 'id' | 'name' | 'placeId' | 'discardedAt'>[], imported: Record<string, string> = {}): Candidate[] {
  const byPlace = new Map(accounts.filter((a) => a.placeId).map((a) => [a.placeId!, a]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byName = new Map<string, (typeof accounts)[number]>();
  for (const a of accounts) { const k = nameKey(a.name); if (k && !byName.has(k)) byName.set(k, a); }
  return results.map((p) => {
    const have = byPlace.get(p.placeId) ?? (imported[p.placeId] ? byId.get(imported[p.placeId]) : undefined);
    if (have) return { ...p, state: 'have', accountId: have.id, accountName: have.name, discarded: !!have.discardedAt };
    if (/^CLOSED/.test(p.status ?? '')) return { ...p, state: 'closed', accountId: null, accountName: null, discarded: false };
    const same = byName.get(nameKey(p.name));
    if (same) return { ...p, state: 'maybe', accountId: same.id, accountName: same.name, discarded: !!same.discardedAt };
    return { ...p, state: 'new', accountId: null, accountName: null, discarded: false };
  });
}

/** Resumen de una búsqueda: cuántas salen, cuántas son nuevas y cuántas ya estaban o se han importado. */
export function sweepCounts(cs: Candidate[]) {
  return { found: cs.length, fresh: cs.filter((c) => c.state === 'new' || c.state === 'maybe').length, have: cs.filter((c) => c.state === 'have').length };
}

/** Lo que se guarda de cada resultado (sin nada que no se use). */
export function slimPlace(p: PlaceResult): PlaceResult {
  return { placeId: p.placeId.slice(0, 300), name: p.name.slice(0, 160), address: p.address?.slice(0, 300) ?? null, phone: p.phone?.slice(0, 40) ?? null,
    website: p.website && /^https?:\/\//i.test(p.website) ? p.website.slice(0, 300) : null, mapsUrl: p.mapsUrl && /^https?:\/\//i.test(p.mapsUrl) ? p.mapsUrl.slice(0, 500) : null,
    hours: p.hours?.slice(0, 7).map((h) => h.slice(0, 80)) ?? null, lat: p.lat, lng: p.lng, status: p.status, rating: p.rating ?? null, reviews: p.reviews ?? null,
    photo: p.photo ?? null, type: p.type?.slice(0, 80) ?? null, place: p.place };
}
