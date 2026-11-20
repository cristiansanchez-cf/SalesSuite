import { describe, expect, it } from 'vitest';
import { isOpen, trialEnd, trialEndFrom, trialFromWords, trialReminderDay, trialStatus, type Trial } from './trial';

const t = (o: Partial<Trial> = {}): Trial => ({ id: 't', accountId: 'a', startsOn: '2026-11-20', endsOn: '2027-01-20', note: null, createdBy: null, createdAt: '2026-11-20T10:00:00Z', endedAt: null, outcome: null, ...o });

describe('en prueba', () => {
  it('duraciones de siempre, con meses de verdad', () => {
    expect(trialEnd('2026-11-20', '10d')).toBe('2026-11-30');
    expect(trialEnd('2026-11-20', '15d')).toBe('2026-12-05');
    expect(trialEnd('2026-11-20', '2m')).toBe('2027-01-20');
    expect(trialEnd('2027-01-31', '1m')).toBe('2027-02-28');
    expect(trialEndFrom('2026-11-20', { months: 3 })).toBe('2027-02-20');
  });
  it('cómo va: en marcha, últimos días y pasada', () => {
    expect(trialStatus(t(), '2026-12-20')).toMatchObject({ tone: 'running', daysLeft: 31, length: 61, elapsed: 30 });
    expect(trialStatus(t(), '2027-01-18').tone).toBe('soon');
    expect(trialStatus(t(), '2027-01-20')).toMatchObject({ tone: 'soon', daysLeft: 0 });
    expect(trialStatus(t(), '2027-01-23')).toMatchObject({ tone: 'over', daysLeft: -3, elapsed: 61 });
  });
  it('en marcha hasta que se acaba o se convierte', () => {
    expect(isOpen(t(), null)).toBe(true);
    expect(isOpen(t({ endedAt: '2027-01-20T10:00:00Z', outcome: 'stays' }), null)).toBe(false);
    // Pagó después de empezarla: convertida.
    expect(isOpen(t(), '2026-12-01T10:00:00Z')).toBe(false);
    // Ya era cliente y la prueba es por un trato (Tnsi): sigue en prueba.
    expect(isOpen(t(), '2026-10-01T10:00:00Z')).toBe(true);
    expect(isOpen(null, null)).toBe(false);
  });
  it('aviso unos días antes', () => {
    expect(trialReminderDay(t())).toBe('2027-01-17');
    expect(trialReminderDay(t({ endsOn: '2026-11-21' }))).toBe('2026-11-20');
  });
  it('lo que dice con palabras', () => {
    expect(trialFromWords('se van a pasar en prueba 2 meses por un trato')).toBe('2m');
    expect(trialFromWords('quince días de prueba')).toBe('15d');
    expect(trialFromWords('un mes de prueba')).toBe('1m');
    expect(trialFromWords('3 semanas')).toEqual({ days: 21 });
    expect(trialFromWords('tres meses')).toEqual({ months: 3 });
    expect(trialFromWords('mañana le llamo')).toBeNull();
  });
});
