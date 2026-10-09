import { describe, expect, test } from 'vitest';
import { channelsFor, dueBucket, suggestNext, unanswered, type Activity, type Actor } from './followup';

const now = new Date('2026-10-09T09:00:00');
let n = 0;
const act = (p: Partial<Activity>): Activity => ({ id: `a${++n}`, accountId: 'acc', contactId: 'marta', userId: 'u', channel: 'instagram', outcome: 'no_reply', note: null, happenedAt: `2026-10-0${n % 9 + 1}T10:00:00`, ...p });
const marta: Actor = { id: 'marta', name: 'Marta', instagram: '@marta', phone: '+34 600' };
const jorge: Actor = { id: 'jorge', name: 'Jorge', email: 'jorge@club.test' };

describe('seguimiento: la regla de los 3 intentos', () => {
  test('vías de cada persona, con las de la empresa de respaldo', () => {
    expect(channelsFor(marta)).toEqual(['instagram', 'whatsapp', 'phone']);
    expect(channelsFor({}, { linkedin: 'x', email: 'y' })).toEqual(['linkedin', 'email']);
  });

  test('primer contacto: hoy, por la primera red de la primera persona', () => {
    const s = suggestNext({ activities: [], actors: [marta, jorge], company: {}, now });
    expect(s).toMatchObject({ contactId: 'marta', channel: 'instagram', reason: 'first', attempt: 1 });
    expect(dueBucket(s.at, now)).toBe('today');
  });

  test('sin respuesta: otra vía con la misma persona en 2 días; a la 3.ª sin respuesta, la siguiente persona', () => {
    n = 0;
    const one = [act({ channel: 'instagram' })];
    expect(suggestNext({ activities: one, actors: [marta, jorge], company: {}, now })).toMatchObject({ contactId: 'marta', channel: 'whatsapp', reason: 'retry', attempt: 2 });
    const three = [...one, act({ channel: 'whatsapp' }), act({ channel: 'phone' })];
    expect(unanswered(three, 'marta')).toHaveLength(3);
    const s = suggestNext({ activities: three, actors: [marta, jorge], company: {}, now });
    expect(s).toMatchObject({ contactId: 'jorge', channel: 'email', reason: 'next_actor', attempt: 1 });
    expect(dueBucket(s.at, now)).toBe('later');
  });

  test('nadie contesta: visita en persona', () => {
    n = 0;
    const acts = [act({}), act({ channel: 'whatsapp' }), act({ channel: 'phone' }), act({ contactId: 'jorge', channel: 'email' }), act({ contactId: 'jorge', channel: 'email' }), act({ contactId: 'jorge', channel: 'email' })];
    expect(suggestNext({ activities: acts, actors: [marta, jorge], company: {}, now })).toMatchObject({ channel: 'visit', reason: 'visit' });
  });

  test('una respuesta reinicia la cuenta; con interés o cita manda el comercial; «no interesado» cierra', () => {
    n = 0;
    const acts = [act({}), act({ channel: 'whatsapp' }), act({ outcome: 'replied', channel: 'whatsapp' }), act({ channel: 'whatsapp' })];
    expect(unanswered(acts, 'marta')).toHaveLength(1);
    expect(suggestNext({ activities: [act({ outcome: 'interested', channel: 'whatsapp' })], actors: [marta], company: {}, now })).toMatchObject({ reason: 'follow_up', channel: 'whatsapp' });
    expect(suggestNext({ activities: [act({ outcome: 'meeting' })], actors: [marta], company: {}, now })).toMatchObject({ reason: 'meeting', channel: 'meeting' });
    expect(suggestNext({ activities: [act({ outcome: 'not_interested' })], actors: [marta], company: {}, now })).toMatchObject({ reason: 'closed', at: null });
  });

  test('las notas de investigación no cuentan como intentos; sin personas, se busca a la empresa', () => {
    const s = suggestNext({ activities: [act({ outcome: 'note', contactId: null })], actors: [], company: { instagram: '@club' }, now });
    expect(s).toMatchObject({ contactId: null, channel: 'instagram', reason: 'first' });
  });

  test('sin nada por donde escribir y sin intentos: primer contacto en persona (no «nadie contesta»)', () => {
    expect(suggestNext({ activities: [], actors: [], company: {}, now })).toMatchObject({ channel: 'visit', reason: 'first' });
  });

  test('«Hoy»: vencido, hoy, mañana', () => {
    expect(dueBucket('2026-10-08T18:00:00', now)).toBe('overdue');
    expect(dueBucket('2026-10-09T20:00:00', now)).toBe('today');
    expect(dueBucket('2026-10-10T10:00:00', now)).toBe('tomorrow');
    expect(dueBucket(null, now)).toBeNull();
  });
});
