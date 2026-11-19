import { describe, expect, test } from 'vitest';
import { cleanTime, localTime, zonedToUtc } from './when';

describe('hora del próximo paso', () => {
  test('en su zona, con horario de invierno y de verano', () => {
    expect(zonedToUtc('2026-11-25', '12:00', 'Europe/Madrid').toISOString()).toBe('2026-11-25T11:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '12:00', 'Europe/Madrid').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedToUtc('2026-11-25', '19:30', 'Asia/Seoul').toISOString()).toBe('2026-11-25T10:30:00.000Z');
    expect(zonedToUtc('2026-11-25', '12:00', 'No/Existe').toISOString()).toBe('2026-11-25T11:00:00.000Z');
  });
  test('lo que escribe la IA o la persona', () => {
    expect(cleanTime('12')).toBe('12:00');
    expect(cleanTime('9:05')).toBe('09:05');
    expect(cleanTime('19.30')).toBe('19:30');
    expect(cleanTime('25:00')).toBeNull();
    expect(cleanTime(null)).toBeNull();
  });
  test('la hora que se enseña: sin hora si es el día sin más', () => {
    expect(localTime('2026-11-25T10:00:00.000Z')).toBeNull();
    expect(localTime('2026-11-25T11:00:00.000Z')).toBe('12:00');
  });
});

describe('el próximo paso con hora, de punta a punta', () => {
  test('la IA dice «12:00» → se guarda a las 12 de Madrid → el calendario lo pone a esa hora', async () => {
    const { nextStepSchema } = await import('./service');
    const { sanitizeNotes } = await import('./notes');
    const { hasTime } = await import('../calendar/ics');
    const [it] = sanitizeNotes({ items: [{ venue: 'La Parada', interaction: 'x', key_facts: [], facts: [], fit: '', fields: [], channel: 'visit', outcome: 'meeting', day: null, next_step: 'Cita', next_days: 6, next_time: '12', qualification: {}, discard: '', discard_why: '' }] } as never, {} as never);
    expect(it!.nextTime).toBe('12:00');
    const v = nextStepSchema.parse({ at: '2026-11-25', time: it!.nextTime, tz: 'Europe/Madrid' });
    expect(v.at).toBe('2026-11-25T11:00:00.000Z');
    expect(hasTime({ kind: 'account', id: 'x', tenant: '', name: '', step: null, at: v.at!, channel: null, contact: null, url: '' }, 'Europe/Madrid')).toBe(true);
    // Sin hora: el día, que el calendario pone «todo el día».
    expect(nextStepSchema.parse({ at: '2026-11-25' }).at).toBe('2026-11-25T10:00:00.000Z');
    expect(nextStepSchema.parse({ at: '2026-11-25', time: '' }).at).toBe('2026-11-25T10:00:00.000Z');
  });
});
