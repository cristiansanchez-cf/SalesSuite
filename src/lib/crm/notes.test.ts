import { describe, expect, test } from 'vitest';
import { claudeNotes, fixtureNotes, matchAccounts, nameScore, NOTES_SYSTEM, NOTES_TOOL, notesSystem, notesTool, sanitizeContact, sanitizeNotes, sanitizePeople } from './notes';

describe('apuntar con IA (§20)', () => {
  test('solo lo que vale: sitio, interacción y lo que sabemos por separado, campos y cualificación permitidos', () => {
    const r = sanitizeNotes({ items: [
      { venue: '  Gecko ', interaction: 'Visita: solo observar', key_facts: ['Se llena los sábados', 'a', 'b', 'c'], facts: ['Dos pantallas pequeñas', '  ', 'DJ accesible'], fit: 'Todos los servicios', fields: [{ key: 'aforo', value: '500' }, { key: 'MAL KEY', value: 'x' }],
        channel: 'visit', outcome: 'note', day: '2026-10-10', next_step: 'Mirar redes', next_days: 2, qualification: { screens: 'yes', decider: 'jefe', coverage: 'true', kind: null } },
      { venue: 'Vacío', interaction: null, facts: [], fit: null, fields: [] },
      { venue: 'Malo', interaction: 'Nos echó el dueño', facts: [], discard: 'avoid', discard_why: ' el dueño nos echó ', qualification: { format: 'hall, pub,inventado,pub' } },
      { venue: 'Raro', interaction: 'Visita', facts: [], discard: 'borrar_todo', discard_why: 'x', entity: 'promoter',
        works_at: [{ place: ' Sala X ', days: 'fri, sat,viernes', freq: 'regular', role: '' }, { place: '', days: 'mon' }, { place: 'Sala Y', days: '', freq: 'siempre', role: 'guest' }],
        qualification: { pstyle: 'international, techno, rock', pdyn: 'yes', dfollow: 'muchos' } },
      { venue: 'X', interaction: null, facts: ['y'], channel: 'paloma', outcome: 'quizá', day: 'el sábado', next_days: 9999, qualification: {} },
    ] });
    expect(r).toHaveLength(4);
    // Proponer descartar (§23): solo con un motivo conocido; se pregunta antes de hacerlo.
    expect(r.find((x) => x.venue === 'Malo')).toMatchObject({ discard: 'avoid', discardWhy: 'el dueño nos echó', qualification: { format: 'hall,pub' } });   // varios formatos, sin repetir ni inventar
    expect(r.find((x) => x.venue === 'Raro')).toMatchObject({ discard: null, discardWhy: null });
    // Promotoras y DJs (§24): qué es, dónde trabaja (días y frecuencia válidos) y sus preguntas.
    expect(r.find((x) => x.venue === 'Raro')).toMatchObject({ entity: 'promoter', worksAt: [{ place: 'Sala X', days: ['fri', 'sat'], freq: 'regular', role: null }, { place: 'Sala Y', days: [], freq: null, role: 'guest' }],
      qualification: { pstyle: 'international,techno', pdyn: 'yes' } });
    expect(r.find((x) => x.venue === 'Raro')!.qualification).not.toHaveProperty('dfollow');
    expect(r[0]).toMatchObject({ entity: null, worksAt: [] });
    expect(r[0]).toMatchObject({ discard: null });
    expect(r[0]).toMatchObject({ venue: 'Gecko', interaction: 'Visita: solo observar', keyFacts: ['Se llena los sábados', 'a', 'b'], facts: ['Dos pantallas pequeñas', 'DJ accesible'], fit: 'Todos los servicios', fields: { aforo: '500' },
      channel: 'visit', day: '2026-10-10', nextStep: 'Mirar redes', nextDays: 2, qualification: { screens: 'yes', coverage: 'true' } });
    expect(r[0].qualification).not.toHaveProperty('decider');
    expect(r[3]).toMatchObject({ venue: 'X', channel: 'visit', outcome: 'note', day: null, nextDays: null });
  });
  test('nombres parecidos: dictado con errores, uno dentro del otro, palabras en común', () => {
    expect(nameScore('Ghecko', 'Gecko')).toBeGreaterThanOrEqual(0.8);
    expect(nameScore('Radio City', 'Radio City Valencia')).toBeGreaterThanOrEqual(0.85);
    expect(nameScore('Bear Club', 'The Bear Irish Pub')).toBeGreaterThanOrEqual(0.6);
    expect(nameScore('Café Bolsería', 'CAFE BOLSERIA')).toBe(1);
    expect(nameScore('Slavia', 'Radio City')).toBeLessThan(0.6);
  });
  test('las empresas más parecidas primero', () => {
    const accs = [{ id: '1', name: 'Gecko Valencia' }, { id: '2', name: 'Geco Bar' }, { id: '3', name: 'Slavia' }];
    const m = matchAccounts('Ghecko', accs);
    expect(m.map((a) => a.id)).toEqual(['1', '2']);
    expect(m[0].score).toBeGreaterThanOrEqual(0.8);
  });
  test('IA de pruebas: una línea por sitio', async () => {
    const r = await fixtureNotes().split('GHECKO - dos pantallas pequeñas\nNEGRITO: sin pantalla, mirar redes\nidea general sin sitio', { today: '2026-10-11', seller: 'x' });
    expect(r.map((x) => [x.venue, x.qualification.screens, x.nextStep, x.nextDays])).toEqual([['GHECKO', 'yes', null, null], ['NEGRITO', undefined, 'Mirar sus redes', 2]]);
    expect(r[0]).toMatchObject({ interaction: 'Visita: solo observar, sin hablar con nadie', keyFacts: ['dos pantallas pequeñas'], facts: [] });
  });
  test('la petición a Claude: modelo pequeño (Haiku), sin forzar la herramienta, herramienta no estricta (gramática demasiado grande)', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"x"}}', { status: 400 }); }) as unknown as typeof fetch;
    await expect(claudeNotes('k', fetchImpl).split('Gecko: lleno', { today: '2026-10-11', seller: 'Enjoy' })).rejects.toBeTruthy();
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    expect((body.tools as Array<{ name: string; strict: boolean }>)[0]).toMatchObject({ name: 'save_notes', strict: false });
  });
});

describe('apuntar: personas (§38)', () => {
  test('con nombre, sin repetir; contacto válido o null', () => {
    const r = sanitizePeople([
      { name: 'Marco Daniele Curró', role: 'Gerente operativo', instagram: 'https://www.instagram.com/marco_sabbia/', email: 'no-es-email', phone: '', linkedin: 'https://evil.example', note: 'Relaciones públicas' },
      { name: 'marco daniele curro', role: 'Otro' },
      { name: '', role: 'Sin nombre' },
      { name: 'Davide Marelli', role: 'Gerente general', linkedin: 'https://www.linkedin.com/in/davide', instagram: '@davide.m' },
    ]);
    expect(r).toEqual([
      { name: 'Marco Daniele Curró', role: 'Gerente operativo', phone: null, email: null, instagram: 'https://www.instagram.com/marco_sabbia/', linkedin: null, note: 'Relaciones públicas' },
      { name: 'Davide Marelli', role: 'Gerente general', phone: null, email: null, instagram: '@davide.m', linkedin: 'https://www.linkedin.com/in/davide', note: null },
    ]);
  });
  test('el Instagram de una persona va en la persona (la herramienta lo pide y la limpieza lo guarda)', async () => {
    const [it] = await fixtureNotes().split('Sabbia: hablé con Marco Curro, el gerente (@marco_sabbia), quiere verlo', { today: '2026-10-12', seller: 'Enjoy' });
    expect(it.people).toEqual([{ name: 'Marco Curro', role: 'gerente', phone: null, email: null, instagram: '@marco_sabbia', linkedin: null, note: null }]);
  });
});

describe('apuntar sin cualificación en el espacio (§45)', () => {
  const kinds = [{ key: 'company', label: 'Centro de buceo', plural: 'Centros', icon: 'waves', profile: 'venue' as const }];
  test('con la cualificación, la herramienta y el sistema de siempre', () => {
    expect(notesTool({})).toBe(NOTES_TOOL);
    expect(notesTool({ pack: 'nightlife' })).toBe(NOTES_TOOL);
    expect(notesSystem({ today: '2026-10-11', seller: 'Enjoy' })).toBe(NOTES_SYSTEM({ today: '2026-10-11', seller: 'Enjoy' }));
  });
  test('sin ella: ni cualificación ni copy de la noche; los tipos del espacio', () => {
    const tool = notesTool({ pack: null, kinds });
    const item = tool.input_schema.properties.items.items as { required: readonly string[]; properties: Record<string, unknown> };
    expect(item.required).not.toContain('qualification');
    expect(item.properties).not.toHaveProperty('qualification');
    expect(item.properties).not.toHaveProperty('works_at');   // sin organizadores ni profesionales
    expect(notesSystem({ today: '2026-10-11', seller: 'Oquea', pack: null, kinds, clients: ['Centros de buceo (5-30 instructores)'] })).toContain('Vendemos a: Centros de buceo (5-30 instructores)');
    const text = JSON.stringify(tool) + notesSystem({ today: '2026-10-11', seller: 'Oquea', pack: null, kinds });
    expect(text).toContain('centro de buceo');
    for (const w of [/\bDJ\b/i, /promotora/i, /pantalla/i, /discoteca/i, /fiesta/i, /aforo/i, /Enjoy/, /\blocal\b/i]) expect(text).not.toMatch(w);
    const withPro = notesTool({ pack: null, kinds: [...kinds, { key: 'instructor', label: 'Instructor', plural: 'Instructores', icon: 'users', profile: 'dj' as const }] });
    expect((withPro.input_schema.properties.items.items as { properties: Record<string, unknown> }).properties).toHaveProperty('works_at');
  });
  test('sin ella, lo que llegue de cualificación no se guarda', async () => {
    const [it] = await fixtureNotes().split('Azul: dos pantallas, mirar redes', { today: '2026-10-11', seller: 'x', pack: null });
    expect(it.qualification).toEqual({});
    expect(sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', qualification: { screens: 'yes' } }] }, { qual: false })[0].qualification).toEqual({});
  });
  test('la petición a Claude, sin cualificación', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"x"}}', { status: 400 }); }) as unknown as typeof fetch;
    await expect(claudeNotes('k', fetchImpl).split('Azul: bien', { today: '2026-10-11', seller: 'Oquea', pack: null, kinds })).rejects.toBeTruthy();
    expect(JSON.stringify(body.tools)).not.toContain('qualification');
    expect(String(body.system)).toContain('empresa');
  });
});

describe('apuntar: limpieza de lo que devuelve la IA (casos límite)', () => {
  test('entrada que no es lo esperado: lista vacía, sin lanzar', () => {
    for (const raw of [null, undefined, 'texto', 42, [], {}, { items: 'no' }, { items: [null, 7, 'x', []] }]) expect(sanitizeNotes(raw)).toEqual([]);
  });

  test('topes: 40 sitios, 3 puntos clave, 12 personas, 12 sitios donde trabaja; textos recortados', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ venue: `Sitio ${i}`, interaction: 'x' }));
    expect(sanitizeNotes({ items: many })).toHaveLength(40);
    const [it] = sanitizeNotes({ items: [{
      venue: 'V'.repeat(500), interaction: 'i'.repeat(5000), key_facts: ['a', 'b', 'c', 'd'], facts: ['f'.repeat(700)],
      people: Array.from({ length: 20 }, (_, i) => ({ name: `Persona ${i}` })),
      works_at: Array.from({ length: 20 }, (_, i) => ({ place: `Sala ${i}` })), next_step: 'n'.repeat(400), discard: 'avoid', discard_why: 'w'.repeat(400),
    }] });
    expect([it.venue.length, it.interaction!.length, it.keyFacts.length, it.facts[0].length, it.people.length, it.worksAt.length, it.nextStep!.length, it.discardWhy!.length])
      .toEqual([160, 4000, 3, 600, 12, 12, 300, 300]);
  });

  test('claves de campo raras, próximos días fuera de rango y días que no son fecha: fuera', () => {
    const [it] = sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', next_days: -1, day: '2026-13-01',
      fields: [{ key: '__proto__', value: 'x' }, { key: 'aforo', value: '' }, { key: 'Aforo', value: '3' }, { key: 'ok-1', value: ' 3 ' }, { key: 'x'.repeat(70), value: '1' }] }] });
    expect(it.fields).toEqual({ 'ok-1': '3' });
    expect(Object.getPrototypeOf(it.fields)).toBe(Object.prototype);
    expect([it.nextDays, it.day]).toEqual([null, null]);
    expect(sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', next_days: '3' }] })[0].nextDays).toBe(3);
    expect(sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', next_days: 2.5 }] })[0].nextDays).toBeNull();
    expect(sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', next_days: 366 }] })[0].nextDays).toBeNull();
  });

  // BUG (src/lib/crm/notes.ts:287, sanitizeNotes): el día se valida con Date.parse, que en V8 acepta fechas que no existen
  // («2026-02-30» → 2 de marzo). Si la IA se equivoca de fecha, la interacción se guarda en otro día sin avisar (el
  // servicio hace new Date(`${day}T12:00:00`)). Arreglo: comprobar que new Date(day).toISOString().slice(0, 10) === day.
  // Quitar `.fails` cuando esté arreglado.
  test('un día que no existe en el calendario no se guarda', () => {
    expect(sanitizeNotes({ items: [{ venue: 'A', interaction: 'x', day: '2026-02-30' }] })[0].day).toBeNull();
  });

  test('canales del sitio: solo https (o @usuario en Instagram), teléfono y email con forma de serlo', () => {
    expect(sanitizeContact({ website: 'https://sala.es', instagram: '@sala.luna', facebook: 'http://facebook.com/sala', tiktok: 'javascript:alert(1)',
      music: 'https://soundcloud.com/x"onload="y', phone: '+34 600 11 22 33', email: ' Hola@Sala.ES ' }))
      .toEqual({ website: 'https://sala.es', instagram: '@sala.luna', phone: '+34 600 11 22 33', email: 'hola@sala.es' });
    expect(sanitizeContact({ instagram: 'https://www.instagram.com/sala/', phone: 'llámame', email: 'no@valido' })).toEqual({ instagram: 'https://www.instagram.com/sala/' });
    expect(sanitizeContact(null)).toEqual({});
    expect(sanitizeContact({ website: `https://${'a'.repeat(400)}.es` })).toEqual({});
  });

  test('personas: LinkedIn solo de linkedin.com por https; Instagram de instagram.com o @usuario', () => {
    const r = sanitizePeople([
      { name: 'Ana', linkedin: 'http://linkedin.com/in/ana', instagram: 'https://evil.example/ana' },
      { name: 'Luis', linkedin: 'https://linkedin.com.evil.example/in/luis', instagram: 'javascript:alert(1)' },
      { name: 'Eva', linkedin: 'https://es.linkedin.com/in/eva', instagram: 'eva_ig' },
    ]);
    expect(r.map((p) => [p.name, p.linkedin, p.instagram])).toEqual([['Ana', null, null], ['Luis', null, null], ['Eva', 'https://es.linkedin.com/in/eva', 'eva_ig']]);
    expect(sanitizePeople('no')).toEqual([]);
  });
});
