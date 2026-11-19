/**
 * Dónde está una empresa nueva que se crea desde el asistente (criterio de Cristian: «La Parada en Almería» se creó sin
 * ciudad). Sin IA: se busca en lo que contó un sitio conocido (sus zonas y el catálogo de España); si no hay, se le
 * pregunta y lo que escriba se busca igual (y en Google, para el resto del mundo). El valor es el del buscador de
 * ciudades del CRM (§44): id de zona, clave del catálogo («es|…») o «g:<id de Google>»; al guardar se crea la zona.
 */
import { zonePath } from '../accounts/rules';
import { missingPlaces, SPAIN_NAME } from '../accounts/spain';
import type { Zone } from '../accounts/types';

export interface Place { v: string; label: string }
interface Opt { v: string; name: string; names: string[]; label: string; rank: number }

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Ciudades antes que provincias y regiones (lo más concreto primero); las zonas que ya hay, antes que el catálogo. */
const KIND_RANK: Record<string, number> = { city: 0, area: 1, province: 2, region: 3, country: 4 };
const short = (path: string) => path.split(' › ').filter((x, i) => !(i === 0 && x === SPAIN_NAME)).join(' › ');

function options(zones: Zone[]): Opt[] {
  const own = zones.map((z) => ({ v: z.id, name: z.name, names: [norm(z.name)], label: short(zonePath(zones, z.id)), rank: (KIND_RANK[z.kind] ?? 5) * 2 }));
  const cat = missingPlaces(zones).map((c) => {
    const last = c.path[c.path.length - 1]!;
    return { v: c.key, name: c.name, names: [c.name, ...c.aka].map(norm), label: short(c.path.map((x) => x.name).join(' › ')), rank: (KIND_RANK[last.kind] ?? 5) * 2 + 1 };
  });
  return [...own, ...cat];
}

/** Un sitio conocido nombrado en el texto («…un local en Almería…»): el más concreto y, a igualdad, el nombre más largo. */
export function placeIn(text: string, zones: Zone[]): Place | null {
  const t = ` ${norm(text).replace(/[^\p{L}\p{N} ]/gu, ' ')} `;
  let best: Opt | null = null;
  for (const o of options(zones)) {
    const hit = o.names.find((n) => n.length >= 4 && t.includes(` ${n} `));
    if (!hit) continue;
    if (!best || o.rank < best.rank || (o.rank === best.rank && o.name.length > best.name.length)) best = o;
  }
  return best ? { v: best.v, label: best.label } : null;
}

/** Lo que escribe cuando se le pregunta («almeria», «Roquetas»): primero lo que empieza igual, lo más concreto antes. */
export function searchPlaces(q: string, zones: Zone[], max = 5): Place[] {
  const n = norm(q);
  if (n.length < 2) return [];
  const scored = options(zones).flatMap((o) => {
    const starts = o.names.some((x) => x.startsWith(n)), has = o.names.some((x) => x.includes(n));
    return starts || has ? [{ o, s: (starts ? 0 : 20) + o.rank + (o.names.includes(n) ? -10 : 0) }] : [];
  }).sort((a, b) => a.s - b.s);
  const seen = new Set<string>();
  return scored.filter(({ o }) => !seen.has(o.label) && seen.add(o.label)).slice(0, max).map(({ o }) => ({ v: o.v, label: o.label }));
}
