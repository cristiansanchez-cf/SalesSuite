import { describe, expect, test } from 'vitest';
import { buildIcs, hasTime, type CalItem } from './ics';

const L = { calName: 'Ventas', meeting: 'Reunión', with: (w: string) => `con ${w}`, open: 'Abrir', channels: { meeting: 'Reunión', whatsapp: 'WhatsApp' } };
const it = (o: Partial<CalItem>): CalItem => ({ kind: 'account', id: 'a1', tenant: 'Enjoy', name: 'Howl Crew', step: 'Hablar en enero', at: '2027-01-12T10:00:00.000Z', channel: null, contact: null, url: 'https://x/admin/accounts/a1', ...o });
const now = new Date('2026-11-19T12:00:00Z');

describe('calendario (.ics)', () => {
  test('sin hora → todo el día; con hora → a esa hora', () => {
    expect(hasTime(it({}), 'Europe/Madrid')).toBe(false);                                   // el día del CRM (10:00 por defecto)
    expect(hasTime(it({ at: '2027-01-12T16:30:00.000Z' }), 'Europe/Madrid')).toBe(true);
    expect(hasTime(it({ kind: 'dossier', at: '2027-01-12T16:30:00.000Z' }), 'Europe/Madrid')).toBe(true);
    expect(hasTime(it({ kind: 'dossier', at: '2027-01-11T23:00:00.000Z' }), 'Europe/Madrid')).toBe(false); // 00:00 en Madrid
    const ics = buildIcs([it({}), it({ id: 'a2', name: 'Havana', step: 'Demo', at: '2026-11-20T16:00:00.000Z', channel: 'meeting', contact: 'José María' })], { timeZone: 'Europe/Madrid', now, labels: L });
    expect(ics).toContain('DTSTART;VALUE=DATE:20270112\r\nDTEND;VALUE=DATE:20270113');
    expect(ics).toContain('SUMMARY:Howl Crew · Hablar en enero');
    expect(ics).toContain('SUMMARY:Reunión: Havana · Demo\r\nDTSTART:20261120T160000Z\r\nDTEND:20261120T170000Z');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  });
  test('texto escapado y líneas largas partidas', () => {
    const ics = buildIcs([it({ step: 'Llamar; mandar precio, y ver\nla demo '.repeat(4) })], { timeZone: 'Europe/Madrid', now, labels: L });
    expect(ics).toContain('Llamar\; mandar precio\\, y ver\\nla demo');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});
