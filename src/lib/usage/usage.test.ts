import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { demoUsage, meterClaude, meterUnits, setUsageSink, withUsageScope } from './meter';
import { claudeCost } from './prices';

describe('lo que cuesta', () => {
  test('Claude, con su caché y sus búsquedas', () => {
    // Haiku: 0,10 $ / 0,50 $ por millón.
    expect(claudeCost('claude-haiku-5-5', { input_tokens: 100_000, output_tokens: 100_000 })).toBeCloseTo(0.06, 6);
    // Por encima de 100.000 tokens de prompt, el precio largo (0,50 $ / 2,50 $).
    expect(claudeCost('claude-haiku-5-5', { input_tokens: 150_000, output_tokens: 0 })).toBeCloseTo(0.075, 6);
    // Sonnet con caché y 3 búsquedas web (10 $ cada 1.000).
    expect(claudeCost('claude-sonnet-5-5', { input_tokens: 10_000, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 20_000, output_tokens: 2_000, server_tool_use: { web_search_requests: 3 } }))
      .toBeCloseTo((10_000 * 2 + 100_000 * 0.10 + 20_000 * 2.5 + 2_000 * 10) / 1e6 + 0.03, 6);
    // Un modelo que no conocemos cuenta como Opus (mejor pasarse).
    expect(claudeCost('claude-nuevo', { input_tokens: 1_000_000 })).toBeCloseTo(4, 6);
  });
});

describe('apuntarlo con su espacio', () => {
  beforeEach(() => { demoUsage().length = 0; setUsageSink(null); });
  afterEach(() => setUsageSink(null));

  test('dentro del ámbito de la petición, de ese espacio y esa persona', async () => {
    await withUsageScope({ tenantId: 't1', userId: 'u1' }, async () => {
      await meterClaude('crm.notes', 'claude-haiku-5-5', { input_tokens: 1000, output_tokens: 100 });
      await Promise.resolve();
      await meterUnits('assistant.audio', 'openai', 90, { model: 'whisper-1' });
    });
    await meterUnits('leads.email', 'email', 1, { tenantId: 't2' });
    expect(demoUsage().map((e) => [e.tenantId, e.userId, e.feature, e.inputTokens, e.units])).toEqual([
      ['t1', 'u1', 'crm.notes', 1000, 0], ['t1', 'u1', 'assistant.audio', 0, 90], ['t2', null, 'leads.email', 0, 1],
    ]);
    expect(demoUsage()[1].costUsd).toBeCloseTo(0.009, 6); // minuto y medio de Whisper
    expect(demoUsage()[2].costUsd).toBeCloseTo(0.0004, 6);
  });

  test('si no se puede apuntar, lo que se estaba haciendo sigue', async () => {
    setUsageSink({ async record() { throw new Error('caída'); } });
    await expect(meterClaude('crm.notes', 'claude-haiku-5-5', { input_tokens: 1 })).resolves.toBeUndefined();
    setUsageSink({ record: () => new Promise(() => {}) });
    const t0 = Date.now();
    await meterUnits('leads.email', 'email', 1);
    expect(Date.now() - t0).toBeLessThan(2600);
  });
});

describe('cada llamada de pago se apunta', () => {
  beforeEach(() => { demoUsage().length = 0; setUsageSink(null); });
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  test('Claude (con el modelo que respondió), Whisper y una plantilla de WhatsApp', async () => {
    const { claudeDrafter } = await import('../assistant/draft');
    const { whisper } = await import('../assistant/transcribe');
    const { cloudWhatsApp } = await import('../leads/whatsapp');
    const claude = (async () => reply({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: 'Hola Marta' }], usage: { input_tokens: 800, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })) as unknown as typeof fetch;
    const openai = (async () => reply({ text: 'hola', duration: 30 })) as unknown as typeof fetch;
    const meta = (async () => reply({ messages: [{ id: 'wamid.1' }] })) as unknown as typeof fetch;
    await withUsageScope({ tenantId: 't1', userId: 'u1' }, async () => {
      await claudeDrafter('sk-test', claude)({ accountId: 'a', name: 'Club Sol', bucket: 'today', cooling: null, contactName: 'Marta', step: null, channel: null, last: null, facts: [] }, { seller: '', signer: 'Ana', locale: 'es' });
      await whisper('sk-test', openai)({ bytes: new Uint8Array([1]), type: 'audio/ogg' });
      await cloudWhatsApp('token', meta).sendTemplate('123', '+34699000111', 'equipo_recordatorio_es', 'es', ['Ana', '1', 'Club Sol']);
    });
    expect(demoUsage().map((e) => [e.tenantId, e.feature, e.provider, e.model, e.inputTokens, e.units])).toEqual([
      ['t1', 'assistant.draft', 'anthropic', 'claude-haiku-5-5', 800, 0],
      ['t1', 'assistant.audio', 'openai', 'whisper-1', 0, 30],
      ['t1', 'whatsapp.template', 'meta', 'utility', 0, 1],
    ]);
    expect(demoUsage()[0].costUsd).toBeCloseTo((800 * 0.10 + 60 * 0.50) / 1e6, 9);
    expect(demoUsage()[2].costUsd).toBeCloseTo(0.02, 6);
  });
});

describe('el informe del mes', async () => {
  const { costReport, parseFixedCosts, usd } = await import('./report');
  const row = (tenantId: string, day: string, feature: string, cost: number, userId: string | null = 'u1') => ({
    tenantId, day, feature, provider: (feature.startsWith('whatsapp') ? 'meta' : 'anthropic') as 'meta' | 'anthropic', model: null, userId, userName: userId ? 'Ana' : null,
    events: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, units: 0, costUsd: cost,
  });
  const tenants = [{ id: 'a', slug: 'enjoy', name: 'Enjoy', members: 3, domain: null }, { id: 'b', slug: 'oquea', name: 'Oquea', members: 1, domain: null }];

  test('por empresa, por función y por persona, con la previsión y los fijos', () => {
    const r = costReport({
      month: '2026-11', now: new Date('2026-11-10T12:00:00Z'), tenants, fixed: parseFixedCosts('Vercel=20, Supabase=20, mal, x=-1'),
      rows: [row('a', '2026-11-02', 'crm.notes', 1), row('a', '2026-11-03', 'whatsapp.template', 0.5), row('b', '2026-11-05', 'crm.research', 4), row('b', '2026-11-05', 'crm.research', 1, null),
        row('b', '2026-10-31', 'crm.research', 99), row('zzz', '2026-11-05', 'crm.notes', 2)],
      storage: [{ tenantId: 'a', objects: 3, bytes: 2 * 1024 ** 3 }],
    });
    expect(r.fixed).toEqual([{ name: 'Vercel', usd: 20 }, { name: 'Supabase', usd: 20 }]);
    expect(r.tenants.map((t) => [t.slug, t.variable])).toEqual([['oquea', 5], ['enjoy', 1.5]]);
    const [oquea, enjoy] = r.tenants;
    expect(enjoy.byGroup).toMatchObject({ ai: 1, whatsapp: 0.5 });
    expect(oquea.byUser.map((u) => [u.name, u.cost])).toEqual([['Ana', 4], [null, 1]]);
    expect(oquea.byFeature[0]).toMatchObject({ feature: 'crm.research', events: 2, cost: 5, perEvent: 2.5 });
    expect(oquea.daily[4]).toBe(5);
    // 40 $ de fijos por personas: 30 a Enjoy (3) y 10 a Oquea (1).
    expect([enjoy.fixedShare, oquea.fixedShare]).toEqual([30, 10]);
    expect(enjoy.storageUsd).toBeCloseTo(0.042, 6);
    // Día 10 de 30: el gasto variable por 3.
    expect(oquea.projected).toBeCloseTo(5 * 3 + 10, 6);
    expect(r.unassigned).toBe(2);
    expect(r.totals.variable).toBe(6.5);
  });

  test('dólares con los decimales que hacen falta', () => {
    expect(usd(0.0004, 'en-GB')).toBe('US$0.0004');
    expect(usd(12.5, 'en-GB')).toBe('US$12.50');
  });
});
