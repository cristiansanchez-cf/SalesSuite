/**
 * País → provincia (§23, criterio de Cristian: «por comunidad autónoma no tiene casi sentido»). Lo que se elige en los
 * filtros de lista, mapa y búsqueda: el país y, dentro, sus provincias directamente (saltando las comunidades). Lo que
 * cuelga del país sin provincia (Madrid como ciudad, una región sin provincias) cuenta como una provincia más.
 */
import type { Zone } from './types';

export function countryOf(zones: Zone[], zoneId: string | null | undefined): Zone | null {
  const byId = new Map(zones.map((z) => [z.id, z]));
  let z = zoneId ? byId.get(zoneId) : undefined;
  for (let i = 0; z && z.parentId && i < 12; i++) z = byId.get(z.parentId);
  return z ?? null;
}

export function provincesOf(zones: Zone[], countryId: string): Zone[] {
  const kids = (id: string) => zones.filter((z) => z.parentId === id);
  const out: Zone[] = [];
  for (const c of kids(countryId)) {
    if (c.kind === 'region') {
      const provs = kids(c.id).filter((x) => x.kind === 'province');
      if (provs.length) out.push(...provs); else out.push(c);
    } else out.push(c);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * El país de quien entra, si no ha elegido otro: el de su zona asignada; si no tiene, el único país con algo dentro.
 * `saved` es lo que eligió la última vez (cookie), si sigue existiendo.
 */
export function defaultCountry(zones: Zone[], myZoneIds: string[], saved: string | undefined): string | null {
  const tops = zones.filter((z) => !z.parentId);
  if (saved && tops.some((z) => z.id === saved)) return saved;
  const mine = myZoneIds.map((id) => countryOf(zones, id)?.id).find(Boolean);
  if (mine) return mine;
  const withKids = tops.filter((t) => zones.some((z) => z.parentId === t.id));
  return withKids.length === 1 ? withKids[0].id : null;
}
