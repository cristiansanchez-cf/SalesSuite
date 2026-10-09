import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';
import { parsePlaces, type PlaceResult, type PlacesApi } from './places';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const REP = '11111111-1111-4111-8111-111111111111';
const place = (p: Partial<PlaceResult>): PlaceResult => ({ placeId: 'p1', name: 'Club Sol', address: 'C/ Mar 1, Valencia', phone: '+34 961 000 000', website: 'https://clubsol.test',
  mapsUrl: 'https://maps.google.com/?cid=1', hours: ['lunes: Cerrado', 'viernes: 23:00–6:00'], lat: 39.47, lng: -0.37, status: 'OPERATIONAL', ...p });
const fake = (results: PlaceResult[]): PlacesApi => ({ async search() { return results; }, async details(id) { return results.find((r) => r.placeId === id) ?? null; } });
const svc = (api: PlacesApi | null) => createCrmService(demoCrmDb(REP), demoAccountsDb(REP), demoAdminDb(), { userId: REP, email: 'rep@enjoy.test', displayName: null, tenantId: ENJOY, role: 'rep' } as never, { places: api });

describe('Google Places', () => {
  beforeEach(() => { resetDemoDb(); });

  test('lee la respuesta de la API nueva', () => {
    const [p] = parsePlaces({ places: [{ id: 'abc', displayName: { text: 'Sala X' }, nationalPhoneNumber: '961 00 00 00', googleMapsUri: 'https://maps.google.com/?cid=9',
      regularOpeningHours: { weekdayDescriptions: ['viernes: 23:00–6:00'] }, location: { latitude: 39.4, longitude: -0.3 }, businessStatus: 'OPERATIONAL' }] });
    expect(p).toMatchObject({ placeId: 'abc', name: 'Sala X', phone: '961 00 00 00', hours: ['viernes: 23:00–6:00'], lat: 39.4, website: null });
  });

  test('usar un resultado rellena huecos y no pisa lo escrito a mano', async () => {
    const club = demoDb().account.find((a) => a.name === 'Club Sol')!;
    club.website = 'https://web-a-mano.test';
    const s = svc(fake([place({})]));
    expect((await s.googleCandidates(club.id)).map((r) => r.name)).toEqual(['Club Sol']);
    await s.googleApply(club.id, 'p1');
    expect(club).toMatchObject({ phone: '+34 961 000 000', website: 'https://web-a-mano.test', maps_url: 'https://maps.google.com/?cid=1', lat: 39.47, place_id: 'p1' });
    expect(club.hours).toEqual(['lunes: Cerrado', 'viernes: 23:00–6:00']);
  });

  test('en bloque: solo si el nombre coincide; lo demás queda marcado para revisar a mano', async () => {
    const s = svc(fake([place({ name: 'Otro sitio distinto' })]));
    const ids = demoDb().account.filter((a) => a.tenant_id === ENJOY && !a.owner_id).map((a) => a.id);
    const r = await s.googleFill(ids);
    expect(r.filled).toBe(0);
    expect(r.skipped).toBe(ids.length);
    expect(demoDb().account.find((a) => a.id === ids[0])!.place_status).toBe('not_found');
    expect((await s.googleFill(ids)).skipped).toBe(0);   // ya buscadas: no se repiten (no se gasta)
  });

  test('sin clave, un aviso claro', async () => {
    await expect(svc(null).googleCandidates(demoDb().account[0].id)).rejects.toMatchObject({ status: 503 });
  });
});
