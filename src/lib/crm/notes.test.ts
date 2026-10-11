import { describe, expect, test } from 'vitest';
import { fixtureNotes, matchAccounts, nameScore, sanitizeNotes } from './notes';

describe('apuntar con IA (§20)', () => {
  test('solo lo que vale: sitio con nombre y nota, canal y resultado conocidos, cualificación permitida', () => {
    const r = sanitizeNotes({ items: [
      { venue: '  Gecko ', note: 'Dos pantallas pequeñas', channel: 'visit', outcome: 'note', day: '2026-10-10', next_step: 'Mirar redes', next_days: 2,
        qualification: { screens: 'yes', decider: 'jefe', coverage: 'true', kind: null } },
      { venue: '', note: 'sin sitio' },
      { venue: 'X', note: 'y', channel: 'paloma', outcome: 'quizá', day: 'el sábado', next_days: 9999, qualification: {} },
    ] });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ venue: 'Gecko', channel: 'visit', day: '2026-10-10', nextStep: 'Mirar redes', nextDays: 2, qualification: { screens: 'yes', coverage: 'true' } });
    expect(r[0].qualification).not.toHaveProperty('decider');
    expect(r[1]).toMatchObject({ channel: 'visit', outcome: 'note', day: null, nextDays: null });
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
  });
});
