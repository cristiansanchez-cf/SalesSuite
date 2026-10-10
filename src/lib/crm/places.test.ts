import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';
import { parsePlaces, type PlaceResult, type PlacesApi } from './places';
import type { WebsiteApi } from './website';
import { zoneForPlace } from './zones-normalize';
import type { Zone } from '../accounts/types';

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

  test('«Es este»: ciudad por la dirección, redes y email de su web, valoración y foto; dice qué ha rellenado', async () => {
    const d = demoDb();
    const club = d.account.find((a) => a.name === 'Club Sol')!;
    Object.assign(club, { zone_id: null, phone: null, email: null, instagram: 'https://www.instagram.com/a_mano/' });
    const vlc = d.zone.find((z) => z.tenant_id === ENJOY && z.name === 'Valencia')!;
    const web: WebsiteApi = { async scan() { return { instagram: 'https://www.instagram.com/de_la_web/', facebook: 'https://www.facebook.com/clubsol', linkedin: null, email: 'hola@clubsol.es' }; } };
    const s = createCrmService(demoCrmDb(REP), demoAccountsDb(REP), demoAdminDb(), { userId: REP, email: 'rep@enjoy.test', displayName: null, tenantId: ENJOY, role: 'rep' } as never,
      { places: fake([place({ rating: 4.46, reviews: 312, photo: 'places/p1/photos/foto1', place: { city: 'València', province: 'Valencia', region: 'Comunitat Valenciana', country: 'España' } })]), website: web });
    const r = await s.googleApply(club.id, 'p1');
    expect(r.zone).toBe('Valencia');
    expect(r.filled).toEqual(expect.arrayContaining(['phone', 'email', 'facebook']));
    expect(r.filled).not.toContain('instagram');
    expect(club).toMatchObject({ zone_id: vlc.id, email: 'hola@clubsol.es', facebook: 'https://www.facebook.com/clubsol', instagram: 'https://www.instagram.com/a_mano/', place_rating: 4.5, place_reviews: 312, place_photo: 'places/p1/photos/foto1' });
  });

  test('la ciudad: pueblo, si no provincia…; con dos iguales, la de su provincia; nunca crea zonas', () => {
    const z = (id: string, name: string, parentId: string | null, kind: Zone['kind'] = 'city'): Zone => ({ id, tenantId: ENJOY, parentId, name, kind, position: 0 });
    const zones = [z('es', 'España', null, 'country'), z('cv', 'Comunidad Valenciana', 'es', 'region'), z('v', 'Valencia', 'cv', 'province'), z('a', 'Alicante', 'cv', 'province'),
      z('r', 'Requena', 'v'), z('sj1', 'San Juan', 'a'), z('m', 'Madrid', 'es', 'province'), z('sj2', 'San Juan', 'm')];
    const at = (city: string | null, province: string | null) => zoneForPlace(zones, { city, province, region: 'Comunitat Valenciana', country: 'España' })?.id ?? null;
    expect(at('Requena', 'Valencia')).toBe('r');
    expect(at('Utiel', 'Província de València')).toBe('v');
    expect(at('San Juan', 'Alicante')).toBe('sj1');
    expect(at('Lisboa', null)).toBe('es');
    expect(zoneForPlace(zones, { city: 'Oporto', province: null, region: null, country: 'Portugal' })).toBeNull();
  });

  test('lee de Google valoración, foto y la dirección por partes', () => {
    const [p] = parsePlaces({ places: [{ id: 'abc', displayName: { text: 'Sala X' }, rating: 4.2, userRatingCount: 88, photos: [{ name: 'places/abc12/photos/AbC-123' }], primaryTypeDisplayName: { text: 'Discoteca' },
      addressComponents: [{ longText: 'Requena', types: ['locality', 'political'] }, { longText: 'Valencia', types: ['administrative_area_level_2'] }, { longText: 'España', types: ['country'] }] }] });
    expect(p).toMatchObject({ rating: 4.2, reviews: 88, photo: 'places/abc12/photos/AbC-123', type: 'Discoteca', place: { city: 'Requena', province: 'Valencia', region: null, country: 'España' } });
    expect(parsePlaces({ places: [{ id: 'abc', photos: [{ name: '../../evil' }] }] })[0].photo).toBeNull();
  });

  test('sin clave, un aviso claro', async () => {
    await expect(svc(null).googleCandidates(demoDb().account[0].id)).rejects.toMatchObject({ status: 503 });
  });
});
