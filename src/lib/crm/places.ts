/**
 * Google Places (API nueva, «Text Search»): busca un local por nombre y ciudad y devuelve lo que sirve para
 * contactar e ir: teléfono, web, dirección, enlace de Maps, horario y ubicación. Solo servidor (GOOGLE_MAPS_API_KEY).
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export interface PlaceResult {
  placeId: string; name: string; address: string | null; phone: string | null; website: string | null; mapsUrl: string | null;
  hours: string[] | null; lat: number | null; lng: number | null; status: string | null;
}
const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.internationalPhoneNumber', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.regularOpeningHours.weekdayDescriptions', 'places.location', 'places.businessStatus'].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parsePlaces(json: any): PlaceResult[] {
  return (json?.places ?? []).map((p: any) => ({
    placeId: String(p.id ?? ''), name: String(p.displayName?.text ?? ''), address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null, mapsUrl: p.googleMapsUri ?? null,
    hours: Array.isArray(p.regularOpeningHours?.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions.slice(0, 14) : null,
    lat: typeof p.location?.latitude === 'number' ? p.location.latitude : null, lng: typeof p.location?.longitude === 'number' ? p.location.longitude : null,
    status: p.businessStatus ?? null,
  })).filter((p: PlaceResult) => p.placeId);
}

export async function searchPlaces(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<PlaceResult[]> {
  const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: query, languageCode: 'es', regionCode: 'ES', maxResultCount: 3 }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return parsePlaces(await res.json());
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

/** Interfaz para el servicio (en pruebas se cambia por una falsa). */
export interface PlacesApi { search(query: string): Promise<PlaceResult[]>; details(placeId: string): Promise<PlaceResult | null> }
export const googlePlaces = (apiKey: string): PlacesApi => ({ search: (q) => searchPlaces(q, apiKey), details: (id) => placeDetails(id, apiKey) });
