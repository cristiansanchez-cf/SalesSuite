import { beforeEach, describe, expect, test } from 'vitest';
import { demoLearning, demoLearningStore, resetDemoLearning, type LogEntry } from './store';
import { conversations, fixtureReview, learningTick, metricsOf, reviewDue, runReview, sanitizeReport, transcript } from './review';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const T = '00000000-0000-4000-8000-000000000e01';
const at = (min: number) => new Date(Date.parse('2026-11-25T17:00:00Z') + min * 60_000).toISOString();
const e = (over: Partial<LogEntry>): LogEntry => ({ id: crypto.randomUUID(), at: at(0), tenantId: T, userId: U1, dir: 'in', kind: 'text', text: '', step: 'idle', meta: {}, userName: 'Cristian', tenantName: 'Enjoy', ...over });

describe('las conversaciones', () => {
  test('se agrupan por persona y se cortan tras una hora sin mensajes', () => {
    const logs = [
      e({ at: at(0), text: 'He estado en Bresh', meta: { after: 'confirm' } }), e({ at: at(1), dir: 'out', text: 'Esto es lo que guardo…' }),
      e({ at: at(2), kind: 'button', text: 'change', step: 'confirm', meta: { after: 'amend' } }),
      e({ at: at(3), userId: U2, userName: 'Marta', text: '¿qué tengo para hoy?', meta: { after: 'idle' } }),
      e({ at: at(5), kind: 'audio', text: '', meta: { transcribed: false, after: 'idle' } }),
      e({ at: at(200), text: 'guardar', step: 'confirm', meta: { after: 'saved' } }),
      e({ at: at(201), dir: 'mcp', kind: 'lo_de_hoy', text: '{}', meta: { result: '[]' } }),
      e({ at: at(202), dir: 'error', kind: 'send', text: 'WhatsApp 400' }),
    ];
    const c = conversations(logs);
    expect(c.map((x) => [x.who, x.entries.length])).toEqual([['Cristian', 4], ['Marta', 1], ['Cristian', 2], ['Cristian', 1]]);
    const m = metricsOf(logs, c);
    expect(m).toMatchObject({ people: 2, conversations: 4, messagesIn: 5, audios: 1, audiosNotHeard: 1, saved: 1, changes: 1, agenda: 1, mcpCalls: 1, errors: 1 });
    const t = transcript(c);
    expect(t).toContain('### Conversación 1 · Cristian (Enjoy)');
    expect(t).toContain('PERSONA (audio, audio no entendido; estado idle→idle)');
    expect(t).toContain('MCP lo_de_hoy({}) → []');
    // Si no cabe, se quedan las más nuevas.
    expect(transcript(c, 120)).not.toContain('Conversación 1 ');
  });

  test('el informe de la IA se limpia (tipos y tamaños)', () => {
    const r = sanitizeReport({ summary: 'x', usage: ['a', ''], findings: [{ title: 'T', kind: 'raro', severity: 'high', times: '3', people: 2.4, what: 'w', cause: 'c', proposal: 'p', examples: [{ who: 'C1', quote: 'q' }, { who: 'C2' }] }, { title: '' }] });
    expect(r).toEqual({ summary: 'x', usage: ['a'], findings: [{ title: 'T', kind: 'ux', severity: 'high', times: 3, people: 2, what: 'w', cause: 'c', proposal: 'p', examples: [{ who: 'C1', quote: 'q' }] }] });
  });
});

describe('la revisión', () => {
  beforeEach(() => resetDemoLearning());
  test('cada 3 días, desde la anterior; sin conversaciones no guarda nada; borra lo de más de 90 días', async () => {
    const s = demoLearningStore();
    const now = new Date('2026-11-25T05:00:00Z');
    await s.add([{ tenantId: T, userId: U1, dir: 'in', kind: 'text', text: 'viejo', at: '2026-08-01T10:00:00Z' }]);
    expect(await runReview(s, fixtureReview(), now)).toBeNull();
    await s.add([{ tenantId: T, userId: U1, dir: 'in', kind: 'button', text: 'change', step: 'confirm', meta: { after: 'amend' }, at: '2026-11-24T10:00:00Z' }]);
    const id = await learningTick(s, fixtureReview(), now);
    expect(id).toBeTruthy();
    expect(demoLearning().logs.some((x) => x.text === 'viejo')).toBe(false);
    const [r] = await s.reviews(1);
    expect(r).toMatchObject({ conversations: 1, messages: 1, model: 'fixture', error: null });
    expect(r!.report?.findings[0]?.title).toBe('Correcciones del resumen');
    // Al día siguiente no toca; a los 3 días, sí (desde donde acabó la anterior).
    expect((await reviewDue(s, new Date('2026-11-26T05:00:00Z'))).due).toBe(false);
    const later = await reviewDue(s, new Date('2026-11-28T05:00:00Z'));
    expect(later).toEqual({ due: true, from: now.toISOString() });
  });
  test('si la IA falla, queda la revisión con el error (y las cifras)', async () => {
    const s = demoLearningStore();
    await s.add([{ tenantId: T, userId: U1, dir: 'in', kind: 'text', text: 'hola', at: '2026-11-24T10:00:00Z' }]);
    await runReview(s, { async review() { throw new Error('sin saldo'); } }, new Date('2026-11-25T05:00:00Z'));
    const [r] = await s.reviews(1);
    expect(r).toMatchObject({ error: 'sin saldo', report: null, messages: 1 });
  });
});

describe('el asistente guarda cada mensaje', () => {
  beforeEach(() => resetDemoLearning());
  test('lo que manda (con el paso) y lo que se le contesta, con los botones', async () => {
    const { resetDemoDb } = await import('../data/store');
    const { publicRepository } = await import('../data');
    const { contextAs } = await import('../admin/auth');
    const { demoAssistantDb, resetDemoAssistant } = await import('../assistant/db-demo');
    const { processAssistant } = await import('../assistant/process');
    resetDemoDb(); resetDemoAssistant(); process.env.AI_RESEARCH_FIXTURE = '1';
    const sent: string[] = [];
    const wa = { async sendText(_p: string, _t: string, text: string) { sent.push(text); return { id: null }; }, async sendButtons(_p: string, _t: string, text: string) { sent.push(text); return { id: null }; } };
    const actAs = async (_t: string, u: string) => contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, u);
    const d = { db: demoAssistantDb(), wa: wa as never, transcribe: null, now: new Date('2026-11-25T10:00:00Z'), actAs, learning: demoLearningStore() };
    await processAssistant(d, '123', { tenantId: T, userId: U1 } as never, { phoneId: '123', from: '+34699000111', text: 'He estado en Club Sol con Marta, quieren la pantalla', at: new Date(), id: 'w1', kind: 'text' });
    const logs = demoLearning().logs;
    expect(logs[0]).toMatchObject({ dir: 'in', kind: 'text', text: 'He estado en Club Sol con Marta, quieren la pantalla', step: 'idle' });
    expect(logs[0]!.meta.after).toBeTruthy();
    // Lo que se le contesta, tal cual se le manda.
    expect(logs.filter((x) => x.dir === 'out').map((x) => x.text)).toEqual(sent.length ? expect.arrayContaining([expect.any(String)]) : []);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.join('\n')).toContain(logs.find((x) => x.dir === 'out')!.text.slice(0, 40));
  });
});
