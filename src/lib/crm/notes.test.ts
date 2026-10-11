import { describe, expect, test } from 'vitest';
import { claudeNotes, fixtureNotes, matchAccounts, nameScore, sanitizeNotes } from './notes';

describe('apuntar con IA (§20)', () => {
  test('solo lo que vale: sitio, interacción y lo que sabemos por separado, campos y cualificación permitidos', () => {
    const r = sanitizeNotes({ items: [
      { venue: '  Gecko ', interaction: 'Visita: solo observar', key_facts: ['Se llena los sábados', 'a', 'b', 'c'], facts: ['Dos pantallas pequeñas', '  ', 'DJ accesible'], fit: 'Todos los servicios', fields: [{ key: 'aforo', value: '500' }, { key: 'MAL KEY', value: 'x' }],
        channel: 'visit', outcome: 'note', day: '2026-10-10', next_step: 'Mirar redes', next_days: 2, qualification: { screens: 'yes', decider: 'jefe', coverage: 'true', kind: null } },
      { venue: 'Vacío', interaction: null, facts: [], fit: null, fields: [] },
      { venue: 'Malo', interaction: 'Nos echó el dueño', facts: [], discard: 'avoid', discard_why: ' el dueño nos echó ' },
      { venue: 'Raro', interaction: 'Visita', facts: [], discard: 'borrar_todo', discard_why: 'x' },
      { venue: 'X', interaction: null, facts: ['y'], channel: 'paloma', outcome: 'quizá', day: 'el sábado', next_days: 9999, qualification: {} },
    ] });
    expect(r).toHaveLength(4);
    // Proponer descartar (§23): solo con un motivo conocido; se pregunta antes de hacerlo.
    expect(r.find((x) => x.venue === 'Malo')).toMatchObject({ discard: 'avoid', discardWhy: 'el dueño nos echó' });
    expect(r.find((x) => x.venue === 'Raro')).toMatchObject({ discard: null, discardWhy: null });
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
  test('la petición a Claude: modelo pequeño (Haiku), sin forzar la herramienta, herramienta estricta', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"x"}}', { status: 400 }); }) as unknown as typeof fetch;
    await expect(claudeNotes('k', fetchImpl).split('Gecko: lleno', { today: '2026-10-11', seller: 'Enjoy' })).rejects.toBeTruthy();
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
    expect((body.tools as Array<{ name: string; strict: boolean }>)[0]).toMatchObject({ name: 'save_notes', strict: true });
  });
});
