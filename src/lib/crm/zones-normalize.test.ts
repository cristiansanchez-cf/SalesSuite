import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';
import { FIXES_TOOL, isUnordered, PLACES_TOOL, buildZonePlan, fixtureZoneFixes, fixtureZoneNames, pathFor, sanitizeFixes, sanitizePlaces, withNote, zoneRows, REVIEW_TAG, type PlaceClass } from './zones-normalize';
import type { Zone } from '../accounts/types';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const REP = '11111111-1111-4111-8111-111111111111';
const place = (raw: string, p: Partial<PlaceClass>): PlaceClass => ({ raw, country: 'España', region: null, province: null, town: null, note: null, review: false, ...p });
const zone = (id: string, name: string, parentId: string | null, kind: Zone['kind'] = 'city'): Zone => ({ id, tenantId: ENJOY, parentId, name, kind, position: 0 });

describe('ruta de cada sitio', () => {
  test('Comunidad › Provincia › Pueblo; la capital va en su provincia; fuera, País › Ciudad', () => {
    expect(pathFor(place('Requena (Valencia)', { region: 'Comunidad Valenciana', province: 'Valencia', town: 'Requena' })).map((x) => `${x.kind}:${x.name}`))
      .toEqual(['country:España', 'region:Comunidad Valenciana', 'province:Valencia', 'city:Requena']);
    expect(pathFor(place('VALENCIA', { region: 'Comunidad Valenciana', province: 'Valencia', town: 'Valencia' })).map((x) => x.name))
      .toEqual(['España', 'Comunidad Valenciana', 'Valencia']);
    expect(pathFor(place('Leiria, Portugal', { country: 'Portugal', town: 'Leiria' })).map((x) => x.name)).toEqual(['Portugal', 'Leiria']);
    expect(pathFor(place('Account Executive', { country: null }))).toEqual([]);
  });
});

describe('qué queda por ordenar', () => {
  test('lo ordenado no; lo de la importación sí', () => {
    const zs = [zone('es', 'España', null, 'country'), zone('cv', 'Comunidad Valenciana', 'es', 'region'), zone('v', 'Valencia', 'cv', 'province'),
      zone('r', 'Requena', 'v'), zone('pt', 'Portugal', null, 'country'), zone('li', 'Lisboa', 'pt'), zone('suelta', 'Madrid', null),
      zone('raw1', 'Requena (Valencia)', 'es'), zone('raw2', 'SEVILLA', 'v'), zone('raw3', '28039', 'v'), zone('raw4', 'Alicante', 'es')];
    const byId = new Map(zs.map((z) => [z.id, z]));
    const out = zs.filter((z) => isUnordered(z, byId)).map((z) => z.id);
    expect(out).toEqual(['suelta', 'raw1', 'raw2', 'raw3', 'raw4']);  // Lisboa dentro de Portugal está bien
  });
});

describe('plan', () => {
  const zones = [zone('es', 'España', null, 'country'), zone('cv', 'Comunidad Valenciana', 'es', 'region'), zone('vlc', 'Valencia', 'cv'),
    zone('x1', 'VALENCIA', 'es'), zone('x2', 'Requena (Valencia)', 'es'), zone('x3', 'Account Executive', 'es'), zone('x4', '28039', 'es')];
  const counts = new Map([['vlc', 5], ['x1', 2], ['x2', 1], ['x3', 1]]);
  const classes = [
    place('Valencia', { region: 'Comunidad Valenciana', province: 'Valencia', town: 'Valencia' }),
    place('VALENCIA', { region: 'Comunidad Valenciana', province: 'Valencia', town: 'Valencia' }),
    place('Requena (Valencia)', { region: 'Comunidad Valenciana', province: 'Valencia', town: 'Requena', note: '(Valencia)' }),
    place('Account Executive', { country: null, note: 'Account Executive' }),
  ];
  const plan = buildZonePlan(zones, counts, classes);
  test('une duplicados en la zona que ya existe y deja como está lo que ya está bien', () => {
    const vlc = plan.groups.find((g) => g.label === 'España › Comunidad Valenciana › Valencia')!;
    expect(vlc.path.map((p) => p.existingId)).toEqual(['es', 'cv', 'vlc']);
    expect(vlc.sources.map((s) => s.raw)).toEqual(['VALENCIA']);
    expect(plan.same).toBe(1);
  });
  test('el pueblo cuelga de la provincia (nueva) y las vacías no entran', () => {
    const req = plan.groups.find((g) => g.label.endsWith('Requena'))!;
    expect(req.path.map((p) => p.existingId)).toEqual(['es', 'cv', 'vlc', null]);
    expect(plan.groups.flatMap((g) => g.sources).some((s) => s.raw === '28039')).toBe(false);
  });
  test('lo que no es un sitio, aparte', () => {
    expect(plan.junk).toEqual([{ zoneId: 'x3', raw: 'Account Executive', accounts: 1 }]);
  });
});

describe('qué se acepta de la IA', () => {
  test('solo los textos pedidos, sin duplicados; sin país no hay ruta', () => {
    const r = sanitizePlaces({ places: [
      { raw: 'Dénia', country: 'España', region: 'Comunidad Valenciana', province: 'Alicante', town: 'Dénia', note: null, review: false },
      { raw: 'Dénia', country: 'España', region: 'x', province: 'x', town: 'x', note: null, review: false },
      { raw: 'Inventado', country: 'España', region: null, province: null, town: null, note: null, review: false },
      { raw: 'UNITY', country: null, region: 'Galicia', province: 'Lugo', town: null, note: 'UNITY', review: true },
    ] }, ['Dénia', 'UNITY']);
    expect(r.map((x) => x.raw)).toEqual(['Dénia', 'UNITY']);
    expect(r[1]).toMatchObject({ country: null, region: null, province: null, review: true });
  });
  test('la nota del Notion se añade una vez', () => {
    const n = withNote('Tiene DJ.', 'Barcelona creo que no es correcto');
    expect(n).toBe('Tiene DJ.\nCiudad en el Notion: Barcelona creo que no es correcto');
    expect(withNote(n, 'Barcelona creo que no es correcto')).toBe(n);
  });
});

describe('ordenar ciudades en el espacio', () => {
  beforeEach(() => { resetDemoDb(); });
  const svc = (u: string, role: string) => createCrmService(demoCrmDb(u), demoAccountsDb(u), demoAdminDb(), { userId: u, email: 'x@enjoy.test', displayName: null, tenantId: ENJOY, role } as never,
    { places: null, routes: null, research: null, zoneNames: fixtureZoneNames() });
  test('importar y ordenar ciudades: solo admin (un/a gerente tampoco)', async () => {
    const lead = svc(REP, 'lead');
    for (const p of [lead.zonesOverview(), lead.zonesTree(), lead.zonesCleanup(), lead.imports()]) await expect(p).rejects.toMatchObject({ status: 403 });
    await expect(svc(ADMIN, 'admin').zonesOverview()).resolves.toBeTruthy();
  });
  const setup = () => {
    const d = demoDb();
    const es = d.zone.find((z) => z.name === 'España')!.id;
    const add = (name: string) => { const id = `00000000-0000-4000-8000-00000000f${String(d.zone.length).padStart(3, '0')}`; d.zone.push({ id, tenant_id: ENJOY, parent_id: es, name, kind: 'city', position: 9 }); return id; };
    const acc = (n: string) => d.account.find((a) => a.name === n)!;
    acc('Sala Marina').zone_id = add('Requena (Valencia)');
    acc('Discoteca Faro').zone_id = add('Barcelona creo que no es correcto, que están en Valencia');
    acc('Terraza Azahar').zone_id = add('Account Executive');
    add('28039');
    return { acc, vlc: d.zone.find((z) => z.name === 'Valencia')!.id };
  };

  test('solo admin o gerente', async () => {
    await expect(svc(REP, 'rep').zonesOverview()).rejects.toMatchObject({ status: 403 });
  });

  test('analizar → aplicar → deshacer → borrar vacías', async () => {
    const { acc, vlc } = setup();
    const s = svc(ADMIN, 'admin');
    const o = await s.zonesOverview();
    expect(o.raws).toEqual(expect.arrayContaining(['Requena (Valencia)', 'Account Executive']));
    expect(o.raws).not.toContain('28039');  // vacía: no hace falta clasificarla
    const classes = await s.zonesClassify(o.raws);
    const plan = await s.zonesPlan(classes);
    expect(plan.groups.map((g) => g.label)).toEqual(expect.arrayContaining(['España › Comunidad Valenciana › Valencia › Requena']));

    const r = await s.zonesApply(classes);
    expect(r.moved).toBeGreaterThanOrEqual(3);
    const d = demoDb();
    const req = d.zone.find((z) => z.name === 'Requena')!;
    expect(d.zone.find((z) => z.id === req.parent_id)?.id).toBe(vlc);  // Requena cuelga de Valencia (la que ya había)
    expect(acc('Sala Marina').zone_id).toBe(req.id);
    expect(acc('Sala Marina').notes).toContain('Ciudad en el Notion: Requena (Valencia)');
    // La nota decía Valencia: va a Valencia, marcada «revisar».
    expect(acc('Discoteca Faro').zone_id).toBe(vlc);
    expect(acc('Discoteca Faro').tags).toContain(REVIEW_TAG);
    // No es un sitio: sin zona, con su texto en la nota y a revisar.
    expect(acc('Terraza Azahar')).toMatchObject({ zone_id: null });
    expect(acc('Terraza Azahar').tags).toContain(REVIEW_TAG);

    const last = (await s.zonesOverview()).last!;
    await s.zonesUndo(last.id);
    expect(acc('Sala Marina').zone_id).toBe(d.zone.find((z) => z.name === 'Requena (Valencia)')!.id);
    expect(acc('Sala Marina').notes ?? '').not.toContain('Ciudad en el Notion');
    expect(acc('Discoteca Faro').tags).not.toContain(REVIEW_TAG);
    expect(d.zone.some((z) => z.name === 'Requena')).toBe(false);  // la creada, vacía otra vez: fuera
    await expect(s.zonesUndo(last.id)).rejects.toMatchObject({ status: 404 });

    await s.zonesApply(classes);
    const removed = await s.zonesCleanup();
    expect(removed).toBeGreaterThanOrEqual(4);  // las tres de la importación y «28039»
    expect(d.zone.some((z) => z.name === '28039' || z.name === 'Account Executive')).toBe(false);
    expect(d.zone.some((z) => z.name === 'Comunidad Valenciana')).toBe(true);  // asignada a un comercial: se queda
  });
});

describe('terminar: arreglos sobre lo que ya hay', () => {
  const zones = [zone('es', 'España', null, 'city'), zone('cat', 'Cataluña', 'es', 'region'), zone('ger', 'Gerona', 'cat', 'province'),
    zone('gir', 'Girona', 'cat', 'province'), zone('aro', 'Castillo de Aro', 'ger', 'city')];
  test('árbol con empresas directas y con lo de dentro', () => {
    const rows = zoneRows(zones, new Map([['aro', 2], ['gir', 3]]));
    expect(rows.map((r) => `${r.depth}:${r.name}:${r.direct}/${r.total}`)).toEqual(['0:España:0/5', '1:Cataluña:0/5', '2:Gerona:0/2', '3:Castillo de Aro:2/2', '2:Girona:3/3']);
  });
  test('solo arreglos válidos: ids que existen, sin meterla en sí misma, sin cambios vacíos', () => {
    const f = sanitizeFixes({ fixes: [
      { op: 'merge', id: 'ger', target: 'gir', reason: 'Mismo sitio' },
      { op: 'merge', id: 'cat', target: 'aro', reason: 'dentro de sí misma' },
      { op: 'kind', id: 'es', kind: 'country', reason: 'País' },
      { op: 'kind', id: 'gir', kind: 'province', reason: 'ya lo es' },
      { op: 'rename', id: 'nope', name: 'x', reason: '' },
      { op: 'move', id: 'aro', target: 'aro', reason: '' },
    ] }, zones);
    expect(f.map((x) => `${x.op}:${x.id}`)).toEqual(['merge:ger', 'kind:es']);
  });
});

describe('terminar en el espacio', () => {
  beforeEach(() => { resetDemoDb(); });
  const svc = (u: string, role: string) => createCrmService(demoCrmDb(u), demoAccountsDb(u), demoAdminDb(), { userId: u, email: 'x@enjoy.test', displayName: null, tenantId: ENJOY, role } as never,
    { places: null, routes: null, research: null, zoneNames: fixtureZoneNames(), zoneFixes: fixtureZoneFixes() });

  test('juntar: empresas, pueblos y asignaciones pasan a la otra; renombrar encima de otra igual = juntar', async () => {
    const d = demoDb();
    const cat = d.zone.find((z) => z.name === 'Cataluña')!.id;
    const add = (id: string, name: string, parent: string, kind = 'province') => { d.zone.push({ id, tenant_id: ENJOY, parent_id: parent, name, kind: kind as never, position: 0 }); return id; };
    const ger = add('00000000-0000-4000-8000-0000000fa001', 'Gerona', cat);
    const gir = add('00000000-0000-4000-8000-0000000fa002', 'Girona', cat);
    const aro = add('00000000-0000-4000-8000-0000000fa003', 'Castillo de Aro', ger, 'city');
    add('00000000-0000-4000-8000-0000000fa004', 'Lloret', ger, 'city');
    add('00000000-0000-4000-8000-0000000fa005', 'Lloret', gir, 'city');
    const faro = d.account.find((a) => a.name === 'Discoteca Faro')!;
    faro.zone_id = ger;
    d.membership_zone.push({ tenant_id: ENJOY, user_id: REP, zone_id: ger });
    const s = svc(ADMIN, 'admin');
    await expect(svc(REP, 'rep').zonesFix([{ op: 'merge', id: ger, target: gir }])).rejects.toMatchObject({ status: 403 });

    expect(await s.zonesFix([{ op: 'merge', id: ger, target: gir }])).toEqual({ applied: 1 });
    expect(d.zone.some((z) => z.id === ger)).toBe(false);
    expect(faro.zone_id).toBe(gir);
    expect(d.zone.find((z) => z.id === aro)?.parent_id).toBe(gir);  // el pueblo pasa a Girona
    expect(d.zone.filter((z) => z.name === 'Lloret')).toHaveLength(1);  // el que estaba en las dos, uno solo
    expect(d.membership_zone.some((m) => m.user_id === REP && m.zone_id === gir)).toBe(true);  // quien llevaba Gerona lleva Girona

    // Renombrar «Castillo de Aro» a «Lloret» (ya existe al lado): se juntan.
    await s.zonesFix([{ op: 'rename', id: aro, name: 'Lloret' }]);
    expect(d.zone.some((z) => z.id === aro)).toBe(false);
    // Tipo y mover.
    const es = d.zone.find((z) => z.name === 'España')!;
    await s.zonesFix([{ op: 'kind', id: es.id, kind: 'country' }, { op: 'move', id: gir, target: null }]);
    expect(d.zone.find((z) => z.id === gir)?.parent_id).toBeNull();
  });

  test('revisar con IA propone; no toca nada hasta aplicar', async () => {
    const d = demoDb();
    const before = JSON.stringify(d.zone);
    const fixes = await svc(ADMIN, 'admin').zonesReview();
    expect(Array.isArray(fixes)).toBe(true);
    expect(JSON.stringify(d.zone)).toBe(before);
  });
});

describe('esquemas de las herramientas de la IA', () => {
  // Un campo que admite «vacío» (type con null) no lleva además lista cerrada (enum): el esquema estricto lo rechaza.
  const bad = (v: unknown): boolean => {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.type) && o.type.includes('null') && Array.isArray(o.enum)) return true;
    return Object.values(o).some(bad);
  };
  test('sin enum en campos que admiten null', () => {
    expect(bad(FIXES_TOOL.input_schema)).toBe(false);
    expect(bad(PLACES_TOOL.input_schema)).toBe(false);
  });
});
