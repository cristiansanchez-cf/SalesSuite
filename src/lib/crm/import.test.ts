import { describe, expect, test } from 'vitest';
import type { CrmField } from './fields';
import { buildPlan, niceCase, canonicalOption, cleanLabel, isJunkCompany, matchMember, profileColumns, rawFor, readCsv, suggestMapping, toIsoDate, toNumber, type PlanContext } from './import';

// Datos inventados: los CSV reales no entran en el repo.
const PROVEEDORES = `﻿Nombre,Ciudad,Estado Lead,Tipo,Precio desde €,Tiene Contacto,Último Post IG,Email,Canal Contacto,Responsable
Luz y Ritmo,Valencia,🆕 Sin contactar,DJ/AV,"€1,200.00",Yes,"March 5, 2026",hola@luzyritmo.test,,Ana Pérez García
Luz y Ritmo,Valencia,🆕 Sin contactar,DJ/AV,"€1,200.00",Yes,"March 5, 2026",hola@luzyritmo.test,,Ana Pérez García
Sonido Sur,Sevilla,✅ Interesado,DJ / AV,€300.00,No,,,,
Fiesta Norte,Granada,🤝 Acuerdo cerrado,DJ+AV,€450.00,No,"January 19, 2025",correo-raro,,Álvaro Ex
Disco Móvil Paco,Granada,🆕 Sin contactar,Discomóvil,,No,,,,
Foto Flash,Sevilla,🆕 Sin contactar,Fotomatón,,No,,,,
Beat DJ,Málaga,🆕 Sin contactar,DJ,€250.00,No,,,,
`;
const CONGRESO = `Name,Empresa/Local,Rol,Ciudad,Instagram URL,LinkedIn URL,Status,Puntuación ICP,Acción recomendada,Responsable
Bruno,La Brecha,Owner,Madrid,https://www.instagram.com/labrecha/,,No comenzado,3,Solicitar reunión,Ana Pérez
Bruno,Club Faro,Artist,Madrid,,,No comenzado,3,Solicitar reunión,
Carla,CEO,Promotor,Valencia,,https://linkedin.com/in/carla 🚀,Investigado,2,Valorar,
Dani,DJ.,,Bilbao,,,No comenzado,0,Omitir,
Eva,La Brecha,Operator,Madrid,https://www.instagram.com/labrecha/,,Hablando,3,Solicitar reunión,
Fer,,,Sevilla,,,No comenzado,1,Omitir,
`;
const members: PlanContext['members'] = [{ userId: 'u-ana', name: 'Ana Pérez', email: 'ana@enjoy.test' }];

describe('importar: valores', () => {
  test('etiquetas limpias y variantes unificadas', () => {
    expect(cleanLabel('🆕 Sin contactar')).toBe('Sin contactar');
    expect(cleanLabel('🤝 Acuerdo cerrado')).toBe('Acuerdo cerrado');
    expect(['DJ/AV', 'DJ+AV', 'DJ / AV'].map(canonicalOption)).toEqual(['DJ + AV', 'DJ + AV', 'DJ + AV']);
  });
  test('fechas, importes y casillas como vienen de Notion o Excel', () => {
    expect(toIsoDate('March 5, 2026')).toBe('2026-03-05');
    expect(toIsoDate('5 de marzo de 2026')).toBe('2026-03-05');
    expect(toIsoDate('05/03/2026')).toBe('2026-03-05');
    expect(toIsoDate('2026-03-05T10:00:00Z')).toBe('2026-03-05');
    expect(toNumber('€1,200.00')).toBe('1200.00');
    expect(toNumber('1.200,50 €')).toBe('1200.50');
    expect(toNumber('95%')).toBe('95');
    expect(rawFor('checkbox', 'Yes')).toBe('true');
    expect(rawFor('checkbox', 'No')).toBe('');
  });
  test('empresas que no lo son y responsables por nombre parcial', () => {
    expect(isJunkCompany('CEO', 'Carla')).toBe(true);
    expect(isJunkCompany('DJ.', 'Dani')).toBe(true);
    expect(isJunkCompany('La Brecha', 'Bruno')).toBe(false);
    expect(matchMember('Ana Pérez García', members)).toBe('u-ana');
    expect(matchMember('ana@enjoy.test', members)).toBe('u-ana');
    expect(matchMember('Álvaro Ex', members)).toBe(null);
  });
});

describe('importar empresas (proveedores)', () => {
  const { headers, rows } = readCsv(PROVEEDORES);
  const profiles = profileColumns(headers, rows, 'account', []);
  const by = (h: string) => profiles.find((p) => p.header === h)!;

  test('sugiere qué es cada columna', () => {
    expect(headers[0]).toBe('Nombre');
    expect(by('Nombre').suggestion).toEqual({ to: 'core', key: 'name' });
    expect(by('Ciudad').suggestion).toEqual({ to: 'core', key: 'city' });
    expect(by('Responsable').suggestion).toEqual({ to: 'core', key: 'owner' });
    expect(by('Estado Lead').suggestion).toMatchObject({ to: 'new', type: 'select', isStage: true });
    expect(by('Tipo').suggestion).toMatchObject({ to: 'new', type: 'select' });
    expect(by('Precio desde €').suggestion).toMatchObject({ to: 'new', type: 'money' });
    expect(by('Tiene Contacto').suggestion).toMatchObject({ to: 'new', type: 'checkbox' });
    expect(by('Último Post IG').suggestion).toMatchObject({ to: 'new', type: 'date' });
    expect(by('Canal Contacto').suggestion).toEqual({ to: 'ignore' });
  });

  test('plan: sin duplicados, tipos unificados, lo que no encaja a notas', () => {
    const mapping = suggestMapping(profiles, []);
    expect(mapping.values['Tipo']).toMatchObject({ 'DJ/AV': 'DJ + AV', 'DJ / AV': 'DJ + AV', 'DJ+AV': 'DJ + AV' });
    mapping.tag = 'proveedores-bodas';
    mapping.options = { 'Estado Lead': ['Sin contactar', 'Interesado', 'Acuerdo cerrado'] };
    const existing = { id: 'acc-beat', name: 'Beat DJ', city: 'Málaga', parentId: null, notes: null, fields: {}, tags: [] };
    const plan = buildPlan(headers, rows, mapping, { target: 'account', fields: [], accounts: [existing], contacts: [], members });
    expect(plan.stats).toMatchObject({ rows: 7, duplicates: 1, accountsCreated: 5, accountsMerged: 1, fieldsCreated: 6 });
    expect(plan.stats.unknownOwners).toEqual(['Álvaro Ex']);
    const estado = plan.newFields.find((f) => f.header === 'Estado Lead')!;
    expect(estado.options.map((o) => o.label)).toEqual(['Sin contactar', 'Interesado', 'Acuerdo cerrado']);
    expect(estado.isStage).toBe(true);
    expect(plan.newFields.find((f) => f.header === 'Tipo')!.options.map((o) => o.label)).toEqual(['DJ + AV', 'Discomóvil', 'Fotomatón', 'DJ']);
    const luz = plan.accounts.find((a) => a.name === 'Luz y Ritmo')!;
    expect(luz).toMatchObject({ city: 'Valencia', ownerId: 'u-ana', fields: { 'precio-desde': 1200, 'tiene-contacto': true, 'ultimo-post-ig': '2026-03-05', tipo: 'dj-av', email: 'hola@luzyritmo.test' } });
    const norte = plan.accounts.find((a) => a.name === 'Fiesta Norte')!;
    expect(norte.notes).toBe('Email: correo-raro');
    expect(plan.issues).toEqual([{ row: 5, column: 'Email', value: 'correo-raro', error: 'Email: email no válido' }]);
    expect(plan.accounts.find((a) => a.name === 'Beat DJ')!.existingId).toBe('acc-beat');
    expect(plan.cities.sort()).toEqual(['Granada', 'Málaga', 'Sevilla', 'Valencia']);
  });
});

describe('importar personas (congreso)', () => {
  const { headers, rows } = readCsv(CONGRESO);
  const profiles = profileColumns(headers, rows, 'contact', []);
  const mapping = suggestMapping(profiles, []);

  test('columnas de persona', () => {
    expect(mapping.columns['Empresa/Local']).toEqual({ to: 'core', key: 'company' });
    expect(mapping.columns['Rol']).toEqual({ to: 'core', key: 'role' });
    expect(mapping.columns['Instagram URL']).toEqual({ to: 'core', key: 'instagram' });
    expect(mapping.columns['LinkedIn URL']).toEqual({ to: 'core', key: 'linkedin' });
    expect(mapping.columns['Status']).toMatchObject({ to: 'new', type: 'select', isStage: true });
  });

  test('una persona en dos empresas, empresas compartidas, cargos como empresa y bandeja sin empresa', () => {
    const plan = buildPlan(headers, rows, mapping, { target: 'contact', fields: [], accounts: [], contacts: [], members });
    // Bruno sale dos veces con empresas distintas: son dos personas (sin email ni LinkedIn no se puede saber).
    expect(plan.contacts.map((c) => c.name)).toEqual(['Bruno', 'Bruno', 'Carla', 'Dani', 'Eva', 'Fer']);
    expect(plan.accounts.map((a) => a.name).sort()).toEqual(['Club Faro', 'La Brecha']);
    const brecha = plan.accounts.find((a) => a.name === 'La Brecha')!;
    const eva = plan.contacts.find((c) => c.name === 'Eva')!;
    expect(eva.companies).toEqual([{ ref: brecha.ref, role: 'Operator' }]);
    const carla = plan.contacts.find((c) => c.name === 'Carla')!;
    expect(carla.companies).toEqual([]);
    expect(carla.linkedin).toBe('https://linkedin.com/in/carla');
    expect(carla.notes).toBe('Empresa/Local: CEO');
    expect(plan.contacts.find((c) => c.name === 'Dani')!.notes).toBeNull();
    expect(plan.junkCompanies.sort()).toEqual(['CEO', 'DJ.']);
    expect(plan.stats).toMatchObject({ contactsCreated: 6, links: 3, noCompany: 3, accountsCreated: 2 });
    expect(plan.contacts[0].ownerId).toBe('u-ana');
    expect(plan.contacts.find((c) => c.name === 'Fer')!.fields).toMatchObject({ 'accion-recomendada': 'omitir' });
  });

  test('vuelve a importar: se fusiona con lo que ya hay por nombre + empresa', () => {
    const ctx: PlanContext = { target: 'contact', fields: [], members, contacts: [{ id: 'c-eva', name: 'Eva', email: null, linkedin: null, companies: ['La Brecha'] }],
      accounts: [{ id: 'a-brecha', name: 'La Brecha', city: 'Madrid', parentId: null, notes: null, fields: {}, tags: [] }] };
    const plan = buildPlan(headers, rows, mapping, ctx);
    expect(plan.contacts.find((c) => c.name === 'Eva')!.existingId).toBe('c-eva');
    expect(plan.accounts.find((a) => a.name === 'La Brecha')!.existingId).toBe('a-brecha');
  });

  test('un campo de opciones que ya existe gana las que faltan', () => {
    const accion: CrmField = { id: 'f1', tenantId: 't', key: 'accion', label: 'Acción recomendada', type: 'select', options: [{ key: 'valorar', label: 'Valorar' }],
      group: null, position: 0, help: null, required: false, inList: false, filterable: false, segments: [], archivedAt: null, target: 'contact', tags: [], isStage: false };
    const p = profileColumns(headers, rows, 'contact', [accion]);
    const m = suggestMapping(p, [accion]);
    expect(m.columns['Acción recomendada']).toEqual({ to: 'field', key: 'accion' });
    const plan = buildPlan(headers, rows, m, { target: 'contact', fields: [accion], accounts: [], contacts: [], members });
    expect(plan.fieldOptions[0].options.map((o) => o.label)).toEqual(['Valorar', 'Solicitar reunión', 'Omitir']);
    expect(plan.contacts.find((c) => c.name === 'Fer')!.fields.accion).toBe('omitir');
  });
});

describe('importar: datos limpios', () => {
  test('mayúsculas uniformes sin romper lo que ya viene bien', () => {
    expect(niceCase('LA RÍTMICA CLUB')).toBe('La Rítmica Club');
    expect(niceCase('aaron ruiz')).toBe('Aaron Ruiz');
    expect(niceCase('SALA DE LA LUZ BCN')).toBe('Sala de la Luz BCN');
    expect(niceCase('DJ Mikel')).toBe('DJ Mikel');
    expect(niceCase('McDonald\'s')).toBe('McDonald\'s');
    expect(niceCase('  club   faro ')).toBe('Club Faro');
  });

  test('lo que no cabe en su columna va a notas y no rompe la importación', () => {
    const long = 'Valencia, aunque también trabaja en Alicante, Castellón y alrededores durante toda la temporada de verano';
    const { headers, rows } = readCsv(`Name,Empresa/Local,Rol,Ciudad\nLUCÍA PÉREZ,SALA MARINA,owner,"${long}"\n`);
    const m = suggestMapping(profileColumns(headers, rows, 'contact', []), []);
    const plan = buildPlan(headers, rows, m, { target: 'contact', fields: [], accounts: [], contacts: [], members });
    const c = plan.contacts[0];
    expect(c).toMatchObject({ name: 'Lucía Pérez', city: null, notes: `Ciudad: ${long}` });
    expect(c.companies[0].role).toBe('Owner');
    expect(plan.accounts[0].name).toBe('Sala Marina');
    expect(plan.issues[0]).toMatchObject({ row: 2, column: 'Ciudad', error: 'Demasiado largo (máx. 80)' });
  });
});

