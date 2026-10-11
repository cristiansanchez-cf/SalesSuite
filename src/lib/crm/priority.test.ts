import { describe, expect, test } from 'vitest';
import { businessDaysBetween, compareLeads, coolingDays, normalizeWeights, priorityOf, setQual } from './priority';

describe('prioridad de leads', () => {
  test('lead completo: suma ponderada y de dónde sale cada punto', () => {
    const p = priorityOf({ nights: '4+', decider: 'onsite', screens: 'yes', dynamics: 'partly', scale: 'single' }, 'ocio-nocturno');
    expect(p).toMatchObject({ out: false, score: 85, max: 85, qualified: true, kind: 'venue' });
    expect(p.parts.map((x) => [x.key, x.points])).toEqual([['recurrence', 30], ['decider', 25], ['screens', 20], ['dynamics', 7.5], ['scale', 2]]);
  });

  test('tramos cerrados con Cristian: 1 noche 10 %, «decide pero no pisa» 35 %, un local suelto 20 %', () => {
    const p = priorityOf({ nights: '1', decider: 'offsite', scale: 'single' }, 'ocio-nocturno');
    expect(p.parts.find((x) => x.key === 'recurrence')!.points).toBe(3);
    expect(p.parts.find((x) => x.key === 'decider')!.points).toBe(8.8);
    expect(p.parts.find((x) => x.key === 'scale')!.points).toBe(2);
  });

  test('la recurrencia se mide según el tipo: noches, eventos al año o sala que programa', () => {
    expect(priorityOf({ events: '12+' }, 'promotoras').parts[0].points).toBe(30);
    expect(priorityOf({ events: '1-2' }, 'festivales').parts[0].points).toBe(6);
    expect(priorityOf({ recurring: 'single' }, 'conciertos').parts[0].points).toBe(6);
    // Sin sector (FBD): desconocida hasta que se diga qué es; con un clic en «Local» ya se mide por noches.
    expect(priorityOf({ nights: '3' }, null).unknown).toContain('recurrence');
    expect(priorityOf({ kind: 'venue', nights: '3' }, null).parts[0].points).toBe(22.5);
  });

  test('lo que no se sabe no es 0: suma lo que se sabe y enseña el máximo', () => {
    const p = priorityOf({ decider: 'onsite', screens: 'yes' }, 'ocio-nocturno');
    expect(p).toMatchObject({ score: 45, max: 100, qualified: false, unknown: ['recurrence', 'dynamics', 'scale'] });
  });

  test('eliminatorios: fuera del ranking aunque puntúe alto, con el motivo', () => {
    // Sin pantalla ni intención ya no saca del ranking: solo no suma los puntos de pantalla (le puede encajar otro paquete).
    // (abre 4 noches: le encaja la Fidelización, que en preventa cuenta la mitad: 30 + 25 + 10).
    expect(priorityOf({ nights: '4+', decider: 'onsite', screens: 'no' }, 'ocio-nocturno')).toMatchObject({ out: false, kills: [], score: 65 });
    expect(priorityOf({ nights: '4+', debt: true }, 'ocio-nocturno')).toMatchObject({ out: true, kills: ['debt'], score: 0 });
    expect(priorityOf({ coverage: true, validate: true, debt: true }, null).kills).toEqual(['coverage', 'validate', 'debt']);
  });

  test('el formato decide cómo se mide la recurrencia (y sustituye al antiguo «Qué es»)', () => {
    expect(priorityOf({ format: 'restaurant', nights: '2' }, null)).toMatchObject({ kind: 'venue' });
    expect(priorityOf({ format: 'promoter', events: '12+' }, 'ocio-nocturno').parts[0]).toMatchObject({ key: 'recurrence', points: 30 });
    expect(priorityOf({ kind: 'concert' }, null).kind).toBe('concert');   // lo antiguo se sigue leyendo
    // Varios formatos (sala de conciertos que luego sigue con DJ): si alguno es un local, se mide como local.
    expect(priorityOf({ format: ['concerts', 'pub'] }, null).kind).toBe('venue');
    expect(priorityOf({ format: ['promoter', 'concerts'] }, null).kind).toBe('promoter');
    const q: Record<string, unknown> = { format: 'hall' };
    setQual(q, 'format', 'pub', true); expect(q.format).toEqual(['hall', 'pub']);
    setQual(q, 'format', 'hall', true); expect(q.format).toEqual(['pub']);
    setQual(q, 'format', 'pub', true); expect(q).not.toHaveProperty('format');
    setQual(q, 'dj', 'resident', true); setQual(q, 'dj', 'guests', true); expect(q.dj).toBe('guests');
  });

  test('encaje por paquete: sin pantalla le pueden encajar peticiones, fotos o fidelización; puntúa el mejor', () => {
    const rest = priorityOf({ format: 'restaurant', party: 'some', dj: 'guests', screens: 'no' }, null);
    expect(rest.fit).toEqual({ screen: 'no', requests: 'yes', photos: null, loyalty: null });
    expect(rest.parts.find((x) => x.key === 'screens')!.points).toBe(20);                       // peticiones: encaja entero
    expect(priorityOf({ screens: 'no', dj: 'none', party: 'none', dynamics: 'no' }, 'ocio-nocturno').parts.find((x) => x.key === 'screens')!.points).toBe(0);
    expect(priorityOf({ screens: 'wants' }, 'ocio-nocturno')).toMatchObject({ score: 10, max: 100 });   // 10 sabidos; puede subir si otro paquete encaja
    expect(priorityOf({ nights: '3' }, 'ocio-nocturno').fit.loyalty).toBe('yes');
    expect(priorityOf({}, 'ocio-nocturno').unknown).toContain('screens');                         // sin saber nada: no se sabe
  });

  test('ranking por puntuación actual, no por máximo; los de fuera al final', () => {
    const known = priorityOf({ nights: '4+', decider: 'onsite' }, 'ocio-nocturno');     // 55 · hasta 100
    const empty = priorityOf({}, 'ocio-nocturno');                                         // 0 · hasta 100
    const out = priorityOf({ nights: '4+', debt: true }, 'ocio-nocturno');
    expect([empty, out, known].sort(compareLeads)).toEqual([known, empty, out]);
  });

  test('pesos configurables', () => {
    const w = normalizeWeights({ recurrence: 40, decider: 25, screens: 15, dynamics: 10, scale: 10 });
    expect(priorityOf({ nights: '4+', screens: 'no', dj: 'none', party: 'none', dynamics: 'no' }, 'ocio-nocturno', w).score).toBe(48);   // 40 + la mitad de 15 (fidelización)
    expect(normalizeWeights({ recurrence: -3 } as never).recurrence).toBe(30);
  });

  test('«se enfría»: contestó y llevamos 3 días laborables sin hacer nada (el finde no cuenta)', () => {
    // Contesta el viernes; el lunes no está en rojo (1 día laborable), el miércoles sí (3).
    expect(businessDaysBetween(new Date('2026-10-09T18:00'), new Date('2026-10-12T09:00'))).toBe(1);
    const acts = [{ outcome: 'interested', happenedAt: '2026-10-09T18:00:00' }];
    expect(coolingDays(acts, new Date('2026-10-12T09:00'))).toBeNull();
    expect(coolingDays(acts, new Date('2026-10-14T09:00'))).toBe(3);
    // Si después hicimos algo, ya no se enfría; las notas no cuentan como hacer algo.
    expect(coolingDays([...acts, { outcome: 'no_reply', happenedAt: '2026-10-10T10:00:00' }], new Date('2026-10-20T09:00'))).toBeNull();
    expect(coolingDays([...acts, { outcome: 'note', happenedAt: '2026-10-10T10:00:00' }], new Date('2026-10-14T09:00'))).toBe(3);
  });
});
