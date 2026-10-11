/**
 * Google Places (API nueva, «Text Search»): busca un local por nombre y ciudad y devuelve lo que sirve para
 * contactar e ir: teléfono, web, dirección, enlace de Maps, horario y ubicación. Solo servidor (GOOGLE_MAPS_API_KEY).
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export interface PlaceResult {
  placeId: string; name: string; address: string | null; phone: string | null; website: string | null; mapsUrl: string | null;
  hours: string[] | null; lat: number | null; lng: number | null; status: string | null;
  /** Valoración (0–5), número de reseñas, foto (nombre en Places: «places/…/photos/…») y tipo («Discoteca»). */
  rating?: number | null; reviews?: number | null; photo?: string | null; type?: string | null;
  /** La dirección por partes, para poner la ciudad (docs/CRM_DINAMICO.md §15). */
  place?: PlaceParts;
}
export interface PlaceParts { city: string | null; province: string | null; region: string | null; country: string | null }
const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.internationalPhoneNumber', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.regularOpeningHours.weekdayDescriptions', 'places.location', 'places.businessStatus',
  'places.rating', 'places.userRatingCount', 'places.photos', 'places.primaryTypeDisplayName', 'places.addressComponents'].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parsePlaces(json: any): PlaceResult[] {
  return (json?.places ?? []).map((p: any) => ({
    placeId: String(p.id ?? ''), name: String(p.displayName?.text ?? ''), address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null, mapsUrl: p.googleMapsUri ?? null,
    hours: Array.isArray(p.regularOpeningHours?.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions.slice(0, 14) : null,
    lat: typeof p.location?.latitude === 'number' ? p.location.latitude : null, lng: typeof p.location?.longitude === 'number' ? p.location.longitude : null,
    status: p.businessStatus ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null, reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    photo: typeof p.photos?.[0]?.name === 'string' && PHOTO_NAME.test(p.photos[0].name) ? p.photos[0].name : null,
    type: p.primaryTypeDisplayName?.text ?? null, place: parts(p.addressComponents),
  })).filter((p: PlaceResult) => p.placeId);
}
/** Nombre de una foto de Places (lo único que se acepta para pedirla). */
export const PHOTO_NAME = /^places\/[\w-]{5,300}\/photos\/[\w-]{5,600}$/;
function parts(cs: any): PlaceParts {
  const get = (t: string) => (Array.isArray(cs) ? cs.find((c: any) => Array.isArray(c?.types) && c.types.includes(t))?.longText ?? null : null);
  return { city: get('locality') ?? get('postal_town') ?? get('administrative_area_level_4'), province: get('administrative_area_level_2'), region: get('administrative_area_level_1'), country: get('country') };
}

export async function searchPlaces(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<PlaceResult[]> {
  const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: query, languageCode: 'es', regionCode: 'ES', maxResultCount: 5 }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return parsePlaces(await res.json());
}

/**
 * Buscar clientes en una zona (docs/CRM_DINAMICO.md §19): «discotecas en Valencia», hasta 3 páginas de 20 (lo máximo
 * que da Google). Con el punto de la zona, Google prioriza lo que está cerca (`locationBias`, radio en metros).
 */
export interface AreaOptions { near?: { lat: number; lng: number; radius: number } | null; maxPages?: number; regionCode?: string; languageCode?: string }
export async function searchArea(query: string, apiKey: string, o: AreaOptions = {}, fetchImpl: typeof fetch = fetch): Promise<{ results: PlaceResult[]; pages: number }> {
  const out: PlaceResult[] = [];
  let token: string | undefined;
  let pages = 0;
  const max = Math.max(1, Math.min(o.maxPages ?? 3, 3));
  do {
    const body: Record<string, unknown> = { textQuery: query, languageCode: o.languageCode ?? 'es', regionCode: o.regionCode ?? 'ES', pageSize: 20 };
    if (o.near) body.locationBias = { circle: { center: { latitude: o.near.lat, longitude: o.near.lng }, radius: Math.min(Math.max(o.near.radius, 1000), 50000) } };
    if (token) body.pageToken = token;
    const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': `${FIELDS},nextPageToken` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const json = (await res.json()) as { nextPageToken?: unknown };
    pages++;
    for (const p of parsePlaces(json)) if (!out.some((x) => x.placeId === p.placeId)) out.push(p);
    token = typeof json.nextPageToken === 'string' && json.nextPageToken ? json.nextPageToken : undefined;
  } while (token && pages < max);
  return { results: out.slice(0, 60), pages };
}

const DETAIL_FIELDS = FIELDS.split(',').map((f) => f.replace(/^places\./, '')).join(',');
export async function placeDetails(placeId: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<PlaceResult | null> {
  if (!/^[\w-]{5,300}$/.test(placeId)) return null;
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${placeId}?languageCode=es`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAIL_FIELDS },
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return parsePlaces({ places: [await res.json()] })[0] ?? null;
}

/**
 * La foto, sin enseñar la clave: Google devuelve una dirección pública de la imagen (photoUri) y el navegador va ahí.
 * https://developers.google.com/maps/documentation/places/web-service/place-photos
 */
export async function photoUri(name: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!PHOTO_NAME.test(name)) return null;
  const res = await fetchImpl(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=480&skipHttpRedirect=true`, { headers: { 'X-Goog-Api-Key': apiKey } });
  if (!res.ok) return null;
  const uri = ((await res.json().catch(() => ({}))) as { photoUri?: unknown }).photoUri;
  return typeof uri === 'string' && /^https:\/\//.test(uri) ? uri : null;
}

/** Interfaz para el servicio (en pruebas se cambia por una falsa). */
export interface PlacesApi {
  search(query: string): Promise<PlaceResult[]>; details(placeId: string): Promise<PlaceResult | null>; photo?(name: string): Promise<string | null>;
  /** Buscar clientes en una zona (§19); `pages` = llamadas a Google (cada una cuenta para el tope). */
  area?(query: string, o?: AreaOptions): Promise<{ results: PlaceResult[]; pages: number }>;
}
export const googlePlaces = (apiKey: string): PlacesApi => ({ search: (q) => searchPlaces(q, apiKey), details: (id) => placeDetails(id, apiKey), photo: (n) => photoUri(n, apiKey), area: (q, o) => searchArea(q, apiKey, o) });

/**
 * Google de pruebas (AI_RESEARCH_FIXTURE=1, sin clave): dos resultados fijos con el nombre buscado, sin llamar a nadie.
 * La web es de mentira (.test) y su «escaneo» también (fixtureWebsite).
 */
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
export function fixturePlaces(): PlacesApi {
  const make = (q: string, i: number): PlaceResult => {
    const name = i === 0 ? q.split(' ').slice(0, 3).join(' ') : `${q.split(' ')[0]} Bar`;
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '') || 'local';
    return { placeId: `fx${i}_${Buffer.from(q.slice(0, 120)).toString('base64url')}`, name, address: 'Calle de la Paz 1, 46003 Valencia, España', phone: '+34 960 000 00' + i,
      website: `https://${slug}.test/`, mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(name)}`, hours: ['viernes: 23:00–6:00', 'sábado: 23:00–6:00'],
      // Un punto distinto por búsqueda (dentro de España), siempre el mismo para lo mismo.
      lat: 37 + (hash(q) % 500) / 100 + i / 100, lng: -6 + ((hash(q) >>> 9) % 700) / 100, status: 'OPERATIONAL', rating: i === 0 ? 4.4 : 3.9, reviews: i === 0 ? 312 : 41, photo: null, type: 'Discoteca',
      place: { city: 'Valencia', province: 'Valencia', region: 'Comunidad Valenciana', country: 'España' } };
  };
  // Buscar en una zona: 12 sitios fijos con lo buscado (uno cerrado, uno sin web), en dos «páginas».
  const NAMES = ['Sol', 'Luna', 'Mar', 'Neón', 'Faro', 'Duna', 'Brisa', 'Coral', 'Rayo', 'Nube', 'Eco', 'Vía'];
  const area = (q: string): PlaceResult[] => NAMES.map((n, i) => {
    const what = q.split(/\s+en\s+/i)[0].trim() || 'Local';
    const name = `${what.charAt(0).toUpperCase()}${what.slice(1).replace(/s$/, '')} ${n}`;
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');
    return { placeId: `fxa${i}_${hash(q).toString(36)}`, name, address: `Calle ${n} ${i + 1}, 4600${i % 10} Valencia, España`, phone: `+34 961 000 ${String(100 + i)}`,
      website: i === 3 ? null : `https://${slug}.test/`, mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(name)}`, hours: ['sábado: 23:00–6:00'],
      lat: 39.46 + i / 300, lng: -0.38 + i / 300, status: i === 5 ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL', rating: 3.5 + (i % 5) / 4, reviews: 20 + i * 37, photo: null, type: 'Discoteca',
      place: { city: 'Valencia', province: 'Valencia', region: 'Comunidad Valenciana', country: 'España' } };
  });
  return {
    async search(q) { return [make(q, 0), make(q, 1)]; },
    async area(q) { return { results: area(q), pages: 2 }; },
    // El id lleva lo buscado: se rehace igual en otra petición.
    async details(id) { const m = /^fx([01])_([\w-]+)$/.exec(id); return m ? make(Buffer.from(m[2], 'base64url').toString(), Number(m[1])) : null; },
    async photo() { return null; },
  };
}
