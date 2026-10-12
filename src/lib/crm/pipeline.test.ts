import { describe, expect, test } from 'vitest';
import { alertsOf, stageOf, stageSince, type ActivitySummary, type PipelineInput } from './pipeline';

const sum = (p: Partial<ActivitySummary> = {}): ActivitySummary => ({ accountId: 'a', real: 0, firstAt: null, lastAt: null, firstReplyAt: null, lastOutcome: null, ...p });
const x = (p: Partial<PipelineInput> = {}): PipelineInput => ({ wonAt: null, discardedAt: null, researched: false, summary: null, closingAt: null, ...p });
const now = new Date('2026-10-12T12:00:00Z');

describe('tablero: la columna la decide el historial (§34)', () => {
  test('de sin empezar a cerrada, por lo que ha pasado', () => {
    expect(stageOf(x())).toBe('new');
    expect(stageOf(x({ researched: true }))).toBe('researched');
    expect(stageOf(x({ researched: true, summary: sum({ real: 3, firstAt: '2026-10-01', lastOutcome: 'no_reply' }) }))).toBe('contacted');
    expect(stageOf(x({ summary: sum({ real: 4, firstAt: '2026-10-01', firstReplyAt: '2026-10-03', lastOutcome: 'no_reply' }) }))).toBe('negotiating');
    expect(stageOf(x({ summary: sum({ real: 4, firstReplyAt: '2026-10-03' }), closingAt: '2026-10-08' }))).toBe('closing');
    expect(stageOf(x({ wonAt: '2026-10-10', closingAt: '2026-10-08' }))).toBe('won');
  });

  test('perdida: descartada o lo último fue «no interesado»; ganada manda sobre todo', () => {
    expect(stageOf(x({ discardedAt: '2026-10-09', closingAt: '2026-10-01' }))).toBe('lost');
    expect(stageOf(x({ summary: sum({ real: 2, firstReplyAt: '2026-10-02', lastOutcome: 'not_interested' }) }))).toBe('lost');
    expect(stageOf(x({ wonAt: '2026-10-10', discardedAt: '2026-10-11' }))).toBe('won');
    // Una nota no saca de «sin empezar»: no es contactar.
    expect(stageOf(x({ summary: sum({ real: 0, lastAt: '2026-10-05' }) }))).toBe('new');
  });

  test('desde cuándo: lo que la llevó a esa columna', () => {
    const i = x({ summary: sum({ real: 2, firstAt: '2026-09-01', firstReplyAt: '2026-09-10' }) });
    expect(stageSince('negotiating', i)).toBe('2026-09-10');
    expect(stageSince('contacted', i)).toBe('2026-09-01');
    expect(stageSince('new', i)).toBeNull();
  });

  test('atascadas: pasado el plazo desde el primer contacto (solo abiertas) y muchas interacciones en negociación', () => {
    const old = x({ summary: sum({ real: 9, firstAt: '2026-07-01T00:00:00Z', firstReplyAt: '2026-07-05' }) });
    expect(alertsOf('negotiating', old, 60, now)).toEqual({ overdue: 103, manyTouches: 9 });
    expect(alertsOf('negotiating', old, 180, now).overdue).toBeNull();   // grande: más plazo
    expect(alertsOf('won', old, 60, now)).toEqual({ overdue: null, manyTouches: null });
    expect(alertsOf('contacted', x({ summary: sum({ real: 1, firstAt: '2026-10-01' }) }), 60, now)).toEqual({ overdue: null, manyTouches: null });
  });
});
