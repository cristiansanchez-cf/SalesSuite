/**
 * Cualquier sitio de España al dar de alta una empresa (docs/CRM_DINAMICO.md §44, criterio de Cristian: «deberías
 * poder dar de alta de cualquier ciudad del país en el que operas»). Catálogo fijo de comunidades, provincias y las
 * ciudades que más se buscan (las capitales con otro nombre que su provincia, como Bilbao, y las grandes). Los nombres,
 * como los que deja «Ordenar ciudades» (zones-normalize): en español, provincia «Baleares», «Vizcaya»… con sus otros
 * nombres (`aka`) para encontrar las zonas que ya existen escritas de otra forma.
 *
 * Una opción del catálogo se elige con una clave `es|Comunidad|Provincia|Ciudad`; al guardar, el servidor la valida
 * contra el catálogo y crea la ruta que falte (España › Comunidad › Provincia › Ciudad). Un pueblo que no está en el
 * catálogo se escribe «Pueblo, Provincia».
 */
import type { Zone, ZoneKind } from './types';

export const SPAIN_NAME = 'España';
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

type City = string | [string, string[]];
interface Prov { name: string; aka?: string[]; cities?: City[] }
interface Region { name: string; aka?: string[]; provinces: Prov[] }

export const SPAIN: Region[] = [
  { name: 'Andalucía', provinces: [
    { name: 'Almería', cities: ['Roquetas de Mar', 'El Ejido'] },
    { name: 'Cádiz', cities: ['Jerez de la Frontera', 'Algeciras', 'San Fernando', 'Chiclana de la Frontera', 'El Puerto de Santa María', 'Sanlúcar de Barrameda', 'Tarifa'] },
    { name: 'Córdoba', cities: ['Lucena'] },
    { name: 'Granada', cities: ['Motril'] },
    { name: 'Huelva' },
    { name: 'Jaén', cities: ['Linares', 'Úbeda'] },
    { name: 'Málaga', cities: ['Marbella', 'Torremolinos', 'Fuengirola', 'Benalmádena', 'Estepona', 'Mijas', 'Vélez-Málaga', 'Nerja', 'Ronda'] },
    { name: 'Sevilla', cities: ['Dos Hermanas', 'Alcalá de Guadaíra', 'Utrera'] },
  ] },
  { name: 'Aragón', provinces: [{ name: 'Huesca', cities: ['Jaca'] }, { name: 'Teruel' }, { name: 'Zaragoza', cities: ['Calatayud'] }] },
  { name: 'Principado de Asturias', aka: ['Asturias'], provinces: [{ name: 'Asturias', cities: ['Oviedo', 'Gijón', 'Avilés'] }] },
  { name: 'Islas Baleares', aka: ['Illes Balears', 'Baleares'], provinces: [
    { name: 'Baleares', aka: ['Islas Baleares', 'Illes Balears'], cities: [['Palma de Mallorca', ['Palma']], ['Ibiza', ['Eivissa']], 'Manacor', ['Mahón', ['Maó']], 'Ciudadela', 'Sant Antoni de Portmany', 'Formentera'] },
  ] },
  { name: 'Canarias', aka: ['Islas Canarias'], provinces: [
    { name: 'Las Palmas', cities: ['Las Palmas de Gran Canaria', 'Telde', 'Arrecife', 'Puerto del Rosario', 'San Bartolomé de Tirajana', 'Maspalomas'] },
    { name: 'Santa Cruz de Tenerife', aka: ['Tenerife'], cities: ['San Cristóbal de La Laguna', 'Adeje', 'Arona', 'Puerto de la Cruz', 'Los Cristianos', 'Santa Cruz de La Palma'] },
  ] },
  { name: 'Cantabria', provinces: [{ name: 'Cantabria', cities: ['Santander', 'Torrelavega', 'Castro Urdiales'] }] },
  { name: 'Castilla-La Mancha', aka: ['Castilla La Mancha'], provinces: [
    { name: 'Albacete' }, { name: 'Ciudad Real', cities: ['Puertollano'] }, { name: 'Cuenca' }, { name: 'Guadalajara' }, { name: 'Toledo', cities: ['Talavera de la Reina'] },
  ] },
  { name: 'Castilla y León', provinces: [
    { name: 'Ávila' }, { name: 'Burgos', cities: ['Miranda de Ebro', 'Aranda de Duero'] }, { name: 'León', cities: ['Ponferrada'] }, { name: 'Palencia' },
    { name: 'Salamanca' }, { name: 'Segovia' }, { name: 'Soria' }, { name: 'Valladolid' }, { name: 'Zamora' },
  ] },
  { name: 'Cataluña', aka: ['Catalunya'], provinces: [
    { name: 'Barcelona', cities: ["L'Hospitalet de Llobregat", 'Badalona', 'Terrassa', 'Sabadell', 'Mataró', 'Santa Coloma de Gramenet', 'Cornellà de Llobregat', 'Sant Cugat del Vallès', 'Granollers', 'Manresa', 'Vic', 'Sitges', 'Castelldefels'] },
    { name: 'Girona', aka: ['Gerona'], cities: ['Figueres', 'Lloret de Mar', 'Blanes', 'Platja d\'Aro', 'Roses'] },
    { name: 'Lleida', aka: ['Lérida'] },
    { name: 'Tarragona', cities: ['Reus', 'Salou', 'Cambrils', 'Tortosa'] },
  ] },
  { name: 'Comunidad Valenciana', aka: ['Comunitat Valenciana', 'Valenciana'], provinces: [
    { name: 'Alicante', aka: ['Alacant'], cities: [['Elche', ['Elx']], 'Benidorm', 'Torrevieja', 'Orihuela', 'Alcoy', ['Dénia', ['Denia']], 'Elda', 'San Vicente del Raspeig', 'Jávea', 'Altea', 'Calpe', 'Villena'] },
    { name: 'Castellón', aka: ['Castelló', 'Castellón de la Plana'], cities: ['Vila-real', 'Benicàssim', 'Burriana', 'Vinaròs', 'Peñíscola', 'Oropesa del Mar'] },
    { name: 'Valencia', aka: ['València'], cities: ['Gandía', 'Torrent', 'Sagunto', 'Paterna', 'Mislata', 'Burjassot', 'Alzira', 'Xàtiva', 'Cullera', 'Requena', 'Ontinyent'] },
  ] },
  { name: 'Extremadura', provinces: [{ name: 'Badajoz', cities: ['Mérida', 'Don Benito'] }, { name: 'Cáceres', cities: ['Plasencia'] }] },
  { name: 'Galicia', provinces: [
    { name: 'A Coruña', aka: ['La Coruña', 'Coruña'], cities: ['Santiago de Compostela', 'Ferrol'] },
    { name: 'Lugo' }, { name: 'Ourense', aka: ['Orense'] },
    { name: 'Pontevedra', cities: ['Vigo', 'Vilagarcía de Arousa', 'Sanxenxo'] },
  ] },
  { name: 'Comunidad de Madrid', provinces: [
    { name: 'Madrid', cities: ['Alcalá de Henares', 'Móstoles', 'Fuenlabrada', 'Leganés', 'Getafe', 'Alcorcón', 'Torrejón de Ardoz', 'Parla', 'Alcobendas', 'Las Rozas de Madrid', 'San Sebastián de los Reyes', 'Pozuelo de Alarcón', 'Majadahonda', 'Rivas-Vaciamadrid', 'Collado Villalba', 'Aranjuez'] },
  ] },
  { name: 'Región de Murcia', aka: ['Murcia'], provinces: [{ name: 'Murcia', cities: ['Cartagena', 'Lorca', 'Molina de Segura', 'San Javier', 'Águilas'] }] },
  { name: 'Comunidad Foral de Navarra', aka: ['Navarra'], provinces: [{ name: 'Navarra', cities: [['Pamplona', ['Iruña']], 'Tudela'] }] },
  { name: 'País Vasco', aka: ['Euskadi'], provinces: [
    { name: 'Álava', aka: ['Araba'], cities: [['Vitoria-Gasteiz', ['Vitoria', 'Gasteiz']]] },
    { name: 'Guipúzcoa', aka: ['Gipuzkoa'], cities: [['San Sebastián', ['Donostia', 'Donostia-San Sebastián']], 'Irún', 'Zarautz'] },
    { name: 'Vizcaya', aka: ['Bizkaia'], cities: ['Bilbao', 'Barakaldo', 'Getxo', 'Portugalete', 'Durango'] },
  ] },
  { name: 'La Rioja', provinces: [{ name: 'La Rioja', cities: ['Logroño'] }] },
  { name: 'Ceuta', provinces: [{ name: 'Ceuta' }] },
  { name: 'Melilla', provinces: [{ name: 'Melilla' }] },
];

export interface PathStep { name: string; kind: ZoneKind; aka: string[] }
export interface CatalogPlace { key: string; name: string; aka: string[]; path: PathStep[] }

const SEP = '|';
const cityOf = (c: City): [string, string[]] => (typeof c === 'string' ? [c, []] : c);

/** Ruta de zonas, sin repetir un nombre (Cantabria › Cantabria → Cantabria; la capital no cuelga de sí misma). */
function pathOf(region: Region, prov: Prov | null, town: [string, string[]] | null): PathStep[] {
  const out: PathStep[] = [{ name: SPAIN_NAME, kind: 'country', aka: ['Spain'] }];
  const push = (name: string, kind: ZoneKind, aka: string[] = []) => { if (!out.some((x) => norm(x.name) === norm(name))) out.push({ name, kind, aka }); };
  push(region.name, 'region', region.aka);
  if (prov) push(prov.name, 'province', prov.aka);
  if (town) push(town[0], 'city', town[1]);
  return out;
}

/** Todas las opciones del catálogo: comunidades, provincias y ciudades. */
export function spainCatalog(): CatalogPlace[] {
  const out: CatalogPlace[] = [];
  for (const r of SPAIN) {
    // Una comunidad de una sola provincia con su mismo nombre (Cantabria, La Rioja, Ceuta…) ya sale como provincia.
    if (!(r.provinces.length === 1 && norm(r.provinces[0].name) === norm(r.name))) out.push({ key: ['es', r.name].join(SEP), name: r.name, aka: r.aka ?? [], path: pathOf(r, null, null) });
    for (const p of r.provinces) {
      out.push({ key: ['es', r.name, p.name].join(SEP), name: p.name, aka: p.aka ?? [], path: pathOf(r, p, null) });
      for (const c of p.cities ?? []) {
        const [name, aka] = cityOf(c);
        out.push({ key: ['es', r.name, p.name, name].join(SEP), name, aka, path: pathOf(r, p, [name, aka]) });
      }
    }
  }
  return out;
}

export const isPlaceKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith(`es${SEP}`);
/** Clave de un pueblo que no está en el catálogo («Requena, Valencia»). */
export const townKey = (region: string, province: string, town: string) => ['es', region, province, town.replace(/[|]/g, ' ').trim()].join(SEP);

/**
 * La ruta de una clave, validada contra el catálogo: comunidad y provincia tienen que existir; el pueblo puede ser libre
 * (corto, sin cosas raras). null si no vale.
 */
export function pathForKey(key: string): PathStep[] | null {
  const [es, rn, pn, tn, ...rest] = key.split(SEP);
  if (es !== 'es' || rest.length) return null;
  const r = SPAIN.find((x) => x.name === rn);
  if (!r) return null;
  if (pn === undefined) return pathOf(r, null, null);
  const p = r.provinces.find((x) => x.name === pn);
  if (!p) return null;
  if (tn === undefined) return pathOf(r, p, null);
  const town = tn.replace(/\s+/g, ' ').trim();
  if (!town || town.length > 60 || /[<>{}\[\]\\/@#$%^*=_~`"0-9]/.test(town)) return null;
  const known = (p.cities ?? []).map(cityOf).find(([n, aka]) => [n, ...aka].some((x) => norm(x) === norm(town)));
  return pathOf(r, p, known ?? [town.charAt(0).toUpperCase() + town.slice(1), []]);
}

/** La provincia (con su comunidad) de un texto: «Valencia», «Bizkaia», «Lérida». */
export function provinceNamed(text: string): { region: string; province: string } | null {
  const t = norm(text);
  if (!t) return null;
  for (const r of SPAIN) for (const p of r.provinces) if ([p.name, ...(p.aka ?? [])].some((x) => norm(x) === t)) return { region: r.name, province: p.name };
  return null;
}

/**
 * La zona que ya existe para una ruta (sin crear nada): bajando por la ruta por nombre (o su otro nombre) bajo el
 * mismo padre; si no está entera, una zona con el nombre del final que cuelgue de algún tramo de la ruta o esté suelta
 * arriba (lo que deja una importación: «Bilbao» sin ordenar). `prefix` es lo que sí existe al bajar.
 */
export function existingFor(zones: Zone[], path: PathStep[]): { id: string | null; prefix: Zone[] } {
  const prefix: Zone[] = [];
  let parent: string | null = null;
  for (const step of path) {
    const names = new Set([step.name, ...step.aka].map(norm));
    const hit = zones.find((z) => (z.parentId ?? null) === parent && names.has(norm(z.name)));
    if (!hit) break;
    prefix.push(hit);
    parent = hit.id;
  }
  if (prefix.length === path.length) return { id: prefix[prefix.length - 1].id, prefix };
  const last = path[path.length - 1];
  if (last.kind === 'country') return { id: null, prefix };
  const names = new Set([last.name, ...last.aka].map(norm));
  const ctx = new Set(path.slice(0, -1).flatMap((s) => [s.name, ...s.aka]).map(norm));
  const byId = new Map(zones.map((z) => [z.id, z]));
  const ups = (z: Zone) => { const out: string[] = []; for (let u = z.parentId ? byId.get(z.parentId) : undefined, i = 0; u && i < 8; u = u.parentId ? byId.get(u.parentId) : undefined, i++) out.push(norm(u.name)); return out; };
  const hits = zones.filter((z) => z.kind !== 'country' && names.has(norm(z.name)))
    .map((z) => ({ z, up: ups(z) }))
    .filter(({ up }) => !up.length || up.some((u) => ctx.has(u)))
    .sort((a, b) => b.up.filter((u) => ctx.has(u)).length - a.up.filter((u) => ctx.has(u)).length);
  return { id: hits[0]?.z.id ?? null, prefix };
}

/** ¿Opera este espacio en España? (tiene «España» arriba o aún no tiene ningún país). */
export function operatesInSpain(zones: Zone[]): boolean {
  const tops = zones.filter((z) => !z.parentId && z.kind === 'country');
  return !tops.length || tops.some((z) => ['espana', 'spain'].includes(norm(z.name)));
}

/** Opciones del buscador de ciudad: lo que falta del catálogo (lo que ya es una zona sale como zona). */
export function missingPlaces(zones: Zone[]): CatalogPlace[] {
  if (!operatesInSpain(zones)) return [];
  return spainCatalog().filter((c) => !existingFor(zones, c.path).id);
}

/**
 * Ruta de un sitio de Google (§44, cualquier país): País › Región › Ciudad. En España se pasa por el catálogo para que
 * salgan los mismos nombres («Vizcaya», no «Bizkaia») y la provincia. `kind` = qué es el sitio elegido (hasta dónde baja).
 */
export function pathForParts(p: { city: string | null; province: string | null; region: string | null; country: string | null }, kind: 'city' | 'province' | 'region' | 'country'): PathStep[] | null {
  if (!p.country) return null;
  if (['espana', 'spain'].includes(norm(p.country))) {
    const prov = provinceNamed(p.province ?? '') ?? (kind === 'city' || kind === 'province' ? provinceNamed(p.region ?? '') : null);
    if (prov) {
      const town = kind === 'city' && p.city && norm(p.city) !== norm(prov.province) ? p.city : null;
      return pathForKey(town ? townKey(prov.region, prov.province, town) : ['es', prov.region, prov.province].join(SEP));
    }
    const reg = SPAIN.find((r) => [r.name, ...(r.aka ?? [])].some((x) => norm(x) === norm(p.region)));
    if (reg) return pathForKey(['es', reg.name].join(SEP));
    if (kind === 'country') return [{ name: SPAIN_NAME, kind: 'country', aka: ['Spain'] }];
  }
  const out: PathStep[] = [];
  const push = (name: string | null, k: ZoneKind) => { const n = name?.trim().slice(0, 80); if (n && !out.some((x) => norm(x.name) === norm(n))) out.push({ name: n, kind: k, aka: [] }); };
  push(p.country, 'country');
  if (kind !== 'country') push(p.region, 'region');
  if (kind === 'city' || kind === 'province') push(kind === 'city' ? p.city ?? p.province : p.province, kind);
  return out;
}

/** La zona para una ruta: la que ya existe o, si no, la ruta a crear (con los nombres de los tramos que ya existen). */
export function planPath(zones: Zone[], path: PathStep[]): { id: string } | { create: Array<{ name: string; kind: ZoneKind }> } {
  const { id, prefix } = existingFor(zones, path);
  if (id) return { id };
  return { create: path.map((p, i) => ({ name: prefix[i]?.name ?? p.name, kind: prefix[i]?.kind ?? p.kind })) };
}
