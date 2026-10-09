/**
 * Ruta del día (docs/CRM_DINAMICO.md §12): las visitas que tocan, en el orden más corto, con la hora estimada de
 * llegada, el horario de hoy y la ruta para abrir en Google Maps. Una sola lógica, pura y probada; Google (Routes
 * API) solo optimiza el orden y da los tiempos. Sin Google, se ordena por cercanía (sin coste).
 */
export interface Point { lat: number; lng: number }
export interface Stop extends Point { id: string; name: string }

/** Distancia en km entre dos puntos (haversine). */
export function km(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Orden por cercanía: desde el punto de salida, siempre a la parada más cercana que quede. */
export function nearestOrder<T extends Point>(start: Point | null, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let here: Point | null = start;
  while (left.length) {
    let best = 0;
    if (here) { let d = Infinity; left.forEach((s, i) => { const x = km(here!, s); if (x < d) { d = x; best = i; } }); }
    const [next] = left.splice(best, 1);
    out.push(next);
    here = next;
  }
  return out;
}

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const strip = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** La línea de hoy del horario de Google («viernes: 23:00–6:00»), sin el día. null si no hay. */
export function todayHours(hours: string[] | null | undefined, now: Date): { text: string; closed: boolean } | null {
  if (!hours?.length) return null;
  const d = now.getDay();
  const line = hours.find((h) => { const k = strip(h.split(':')[0]); return k === strip(DAYS_ES[d]) || k === DAYS_EN[d]; });
  if (!line) return null;
  const text = line.slice(line.indexOf(':') + 1).trim();
  return { text, closed: /cerrado|closed/i.test(text) };
}

/** Enlaces de navegación de Google Maps (máximo 9 paradas intermedias por enlace: si hay más, se trocea). */
export function mapsLinks(origin: Point | null, ordered: Point[]): string[] {
  if (!ordered.length) return [];
  const p = (x: Point) => `${x.lat},${x.lng}`;
  const links: string[] = [];
  let from: Point | null = origin;
  for (let i = 0; i < ordered.length; i += 10) {
    const part = ordered.slice(i, i + 10);
    const dest = part[part.length - 1];
    const q = new URLSearchParams({ api: '1', destination: p(dest), travelmode: 'driving' });
    if (from) q.set('origin', p(from));
    if (part.length > 1) q.set('waypoints', part.slice(0, -1).map(p).join('|'));
    links.push(`https://www.google.com/maps/dir/?${q}`);
    from = dest;
  }
  return links;
}

/** Lo que devuelve Google: el orden óptimo de las paradas intermedias y el tiempo de cada tramo. */
export interface RouteResult { order: number[]; legSeconds: number[]; legMeters: number[] }
export interface RoutesApi { compute(origin: Point, destination: Point, intermediates: Point[]): Promise<RouteResult | null> }

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseRoute(json: any, intermediates: number): RouteResult | null {
  const r = json?.routes?.[0];
  if (!r) return null;
  const order: number[] = Array.isArray(r.optimizedIntermediateWaypointIndex) && r.optimizedIntermediateWaypointIndex.length === intermediates
    ? r.optimizedIntermediateWaypointIndex : Array.from({ length: intermediates }, (_, i) => i);
  const secs = (s: unknown) => Number(String(s ?? '0').replace(/s$/, '')) || 0;
  return { order, legSeconds: (r.legs ?? []).map((l: any) => secs(l.duration)), legMeters: (r.legs ?? []).map((l: any) => Number(l.distanceMeters) || 0) };
}

/** Google Routes API (computeRoutes) con el orden optimizado. https://developers.google.com/maps/documentation/routes/opt-way */
export const googleRoutes = (apiKey: string, fetchImpl: typeof fetch = fetch): RoutesApi => ({
  async compute(origin, destination, intermediates) {
    const wp = (x: Point) => ({ location: { latLng: { latitude: x.lat, longitude: x.lng } } });
    const res = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.legs.distanceMeters' },
      body: JSON.stringify({ origin: wp(origin), destination: wp(destination), intermediates: intermediates.map(wp), travelMode: 'DRIVE',
        optimizeWaypointOrder: intermediates.length > 1, languageCode: 'es' }),
    });
    if (!res.ok) throw new Error(`Google Routes ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return parseRoute(await res.json(), intermediates.length);
  },
});

export interface PlannedStop<T> { stop: T; arrival: Date; legMinutes: number | null; legKm: number | null }
export interface Plan<T> { stops: PlannedStop<T>[]; totalMinutes: number | null; totalKm: number; by: 'google' | 'distance'; links: string[] }

/** Minutos que se queda en cada sitio (para estimar la llegada al siguiente). */
export const VISIT_MINUTES = 20;

/**
 * Planifica: primero por cercanía (la última parada es el destino) y, si hay Google, deja que optimice las intermedias
 * y dé los tiempos reales. La llegada estimada suma los tramos y la visita en cada sitio.
 */
export async function planRoute<T extends Stop>(stops: T[], opts: { start: Point | null; at: Date; routes: RoutesApi | null }): Promise<Plan<T>> {
  let ordered = nearestOrder(opts.start, stops);
  let legSeconds: number[] | null = null;
  let legMeters: number[] | null = null;
  let by: Plan<T>['by'] = 'distance';
  const origin = opts.start ?? ordered[0];
  if (opts.routes && ordered.length >= 1 && (opts.start || ordered.length >= 2)) {
    const dest = ordered[ordered.length - 1];
    const mids = opts.start ? ordered.slice(0, -1) : ordered.slice(1, -1);
    try {
      const r = await opts.routes.compute(origin, dest, mids);
      if (r) {
        const first = opts.start ? [] : [ordered[0]];
        ordered = [...first, ...r.order.map((i) => mids[i]), dest];
        legSeconds = r.legSeconds; legMeters = r.legMeters; by = 'google';
      }
    } catch (e) { console.warn('[route]', e instanceof Error ? e.message : e); }
  }
  // Tramo i: llegada a la parada i (si se sale de la primera parada, ese tramo es 0).
  const offset = opts.start ? 0 : 1;
  let t = opts.at.getTime();
  let prev: Point = origin;
  let totalKm = 0;
  let totalSec = 0;
  const planned = ordered.map((s, i) => {
    const leg = i - offset;
    const sec = leg >= 0 && legSeconds ? legSeconds[leg] ?? null : leg < 0 ? 0 : null;
    const m = leg >= 0 && legMeters ? legMeters[leg] ?? null : null;
    const kmLeg = m !== null ? m / 1000 : leg < 0 ? 0 : km(prev, s);
    // Sin Google, se estima a 30 km/h de media en ciudad.
    const secs = sec ?? (kmLeg / 30) * 3600;
    if (i > 0) t += VISIT_MINUTES * 60_000;
    t += secs * 1000;
    totalKm += kmLeg; totalSec += secs;
    prev = s;
    return { stop: s, arrival: new Date(t), legMinutes: leg < 0 ? null : Math.round(secs / 60), legKm: leg < 0 ? null : Math.round(kmLeg * 10) / 10 };
  });
  return { stops: planned, totalMinutes: Math.round(totalSec / 60), totalKm: Math.round(totalKm * 10) / 10, by, links: mapsLinks(opts.start, ordered) };
}
