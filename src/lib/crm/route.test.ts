import { describe, expect, test } from 'vitest';
import { km, mapsLinks, nearestOrder, parseRoute, planRoute, todayHours, type RoutesApi } from './route';

// Valencia: Ruzafa, Carmen, Cabanyal, Benimaclet (coordenadas aproximadas, inventadas para la prueba).
const ruzafa = { id: 'r', name: 'Ruzafa', lat: 39.462, lng: -0.374 };
const carmen = { id: 'c', name: 'Carmen', lat: 39.478, lng: -0.380 };
const cabanyal = { id: 'k', name: 'Cabanyal', lat: 39.469, lng: -0.329 };
const benimaclet = { id: 'b', name: 'Benimaclet', lat: 39.487, lng: -0.360 };
const at = new Date('2026-10-09T18:00:00');

describe('ruta del día', () => {
  test('distancia y orden por cercanía', () => {
    expect(km(ruzafa, carmen)).toBeGreaterThan(1.5);
    expect(km(ruzafa, carmen)).toBeLessThan(2.5);
    expect(nearestOrder(ruzafa, [cabanyal, benimaclet, carmen]).map((s) => s.id)).toEqual(['c', 'b', 'k']);
  });

  test('horario de hoy desde lo que da Google', () => {
    const h = ['lunes: Cerrado', 'viernes: 23:00–6:00', 'sábado: 23:00–7:00'];
    expect(todayHours(h, at)).toEqual({ text: '23:00–6:00', closed: false });          // 9-oct-2026 es viernes
    expect(todayHours(h, new Date('2026-10-12T12:00:00'))).toEqual({ text: 'Cerrado', closed: true });
    expect(todayHours(null, at)).toBeNull();
  });

  test('enlace de Google Maps con paradas; si hay más de 10, en varios tramos', () => {
    const [one] = mapsLinks(ruzafa, [carmen, benimaclet]);
    expect(one).toContain('origin=39.462%2C-0.374');
    expect(one).toContain('destination=39.487%2C-0.36');
    expect(one).toContain('waypoints=39.478%2C-0.38');
    expect(mapsLinks(null, Array.from({ length: 12 }, () => carmen))).toHaveLength(2);
  });

  test('sin Google: por cercanía, con llegada estimada (ciudad a 30 km/h + 20 min por visita)', async () => {
    const plan = await planRoute([cabanyal, carmen], { start: ruzafa, at, routes: null });
    expect(plan.by).toBe('distance');
    expect(plan.stops.map((s) => s.stop.id)).toEqual(['c', 'k']);
    expect(plan.stops[0].arrival.getTime()).toBeGreaterThan(at.getTime());
    expect(plan.stops[1].arrival.getTime() - plan.stops[0].arrival.getTime()).toBeGreaterThan(20 * 60_000);
  });

  test('con Google: usa su orden optimizado y sus tiempos', async () => {
    const calls: number[] = [];
    const google: RoutesApi = { async compute(_o, _d, mids) { calls.push(mids.length); return { order: [1, 0], legSeconds: [600, 600, 600], legMeters: [2000, 3000, 4000] }; } };
    const plan = await planRoute([carmen, benimaclet, cabanyal], { start: ruzafa, at, routes: google });
    expect(plan.by).toBe('google');
    expect(calls).toEqual([2]);
    expect(plan.totalKm).toBe(9);
    expect(plan.stops[0].arrival).toEqual(new Date('2026-10-09T18:10:00'));
    expect(plan.stops[1].arrival).toEqual(new Date('2026-10-09T18:40:00'));   // 10 min de tramo + 20 de visita
  });

  test('si Google falla, sigue por cercanía', async () => {
    const broken: RoutesApi = { async compute() { throw new Error('403'); } };
    expect((await planRoute([carmen, cabanyal], { start: ruzafa, at, routes: broken })).by).toBe('distance');
  });

  test('lee la respuesta de computeRoutes', () => {
    expect(parseRoute({ routes: [{ optimizedIntermediateWaypointIndex: [1, 0], legs: [{ duration: '305s', distanceMeters: 1200 }] }] }, 2))
      .toEqual({ order: [1, 0], legSeconds: [305], legMeters: [1200] });
    expect(parseRoute({}, 1)).toBeNull();
  });
});
