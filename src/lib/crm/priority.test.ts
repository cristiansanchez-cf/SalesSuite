import { describe, expect, test } from 'vitest';
import { businessDaysBetween, compareLeads, coolingDays, normalizeWeights, priorityOf } from './priority';

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
    expect(priorityOf({ nights: '4+', decider: 'onsite', screens: 'no' }, 'ocio-nocturno')).toMatchObject({ out: true, kills: ['screens'], score: 0 });
    expect(priorityOf({ coverage: true, validate: true, debt: true }, null).kills).toEqual(['coverage', 'validate', 'debt']);
  });

  test('ranking por puntuación actual, no por máximo; los de fuera al final', () => {
    const known = priorityOf({ nights: '4+', decider: 'onsite' }, 'ocio-nocturno');     // 55 · hasta 100
    const empty = priorityOf({}, 'ocio-nocturno');                                         // 0 · hasta 100
    const out = priorityOf({ nights: '4+', debt: true }, 'ocio-nocturno');
    expect([empty, out, known].sort(compareLeads)).toEqual([known, empty, out]);
  });

  test('pesos configurables', () => {
    const w = normalizeWeights({ recurrence: 40, decider: 25, screens: 15, dynamics: 10, scale: 10 });
    expect(priorityOf({ nights: '4+' }, 'ocio-nocturno', w).score).toBe(40);
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
