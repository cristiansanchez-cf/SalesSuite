import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';
import { AdminError } from '../admin/service';
import { claudeResearch, fixtureResearch, sanitizeResearch, SAVE_TOOL, sourceUrl, userPrompt, type ResearchApi } from './research';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const REP = '11111111-1111-4111-8111-111111111111';
const svc = (api: ResearchApi | null) => createCrmService(demoCrmDb(REP), demoAccountsDb(REP), demoAdminDb(), { userId: REP, email: 'rep@enjoy.test', displayName: null, tenantId: ENJOY, role: 'rep' } as never, { places: null, routes: null, research: api });
const ctx = { known: {}, contact: {}, people: [] as string[], now: new Date('2026-10-09T10:00:00Z') };
const SRC = 'https://salax.test/agenda';

describe('qué se acepta de la IA', () => {
  test('solo con fuente (URL) y prueba; valores dentro de lo permitido', () => {
    const r = sanitizeResearch({
      summary: 'Sala de conciertos.', look: ['Mira sus stories'],
      qualification: [
        { key: 'nights', value: '4+', evidence: 'Abre de jueves a domingo', source: SRC },
        { key: 'nights', value: '2', evidence: 'repetida', source: SRC },
        { key: 'screens', value: 'muchas', evidence: 'fuera de lo permitido', source: SRC },
        { key: 'decider', value: 'onsite', evidence: 'la IA no puede saberlo', source: SRC },
        { key: 'validate', value: 'true', evidence: 'solo si lo dicen ellos', source: SRC },
        { key: 'scale', value: 'single', evidence: 'Un solo local', source: 'sin-url' },
        { key: 'dynamics', value: 'yes', evidence: '', source: SRC },
      ],
      contact: [
        { key: 'email', value: 'Hola@SalaX.test', evidence: 'Pie de la web', source: SRC },
        { key: 'phone', value: 'llámanos', evidence: 'no es un teléfono', source: SRC },
        { key: 'instagram', value: '@sala_x', evidence: 'Enlace en la web', source: SRC },
      ],
      people: [{ name: 'Ana Ruiz', role: 'Programadora', instagram: null, linkedin: 'https://www.linkedin.com/in/ana', evidence: 'Entrevista', source: SRC }],
      sources: [{ title: 'Agenda', url: SRC }, { title: 'rota', url: 'javascript:alert(1)' }],
    }, ctx);
    expect(r.suggestions.map((s) => (s.kind === 'person' ? s.name : `${s.key}=${s.value}`)))
      .toEqual(['nights=4+', 'email=hola@salax.test', 'instagram=https://www.instagram.com/sala_x/', 'Ana Ruiz']);
    expect(r.suggestions.every((s) => s.status === 'open' && s.source === SRC)).toBe(true);
    expect(r.sources).toEqual([{ title: 'Agenda', url: SRC }]);
    expect(r.summary).toBe('Sala de conciertos.');
    expect(r.at).toBe('2026-10-09T10:00:00.000Z');
  });

  test('no propone lo que ya está en la ficha', () => {
    const r = sanitizeResearch({
      qualification: [{ key: 'nights', value: '3', evidence: 'x', source: SRC }],
      contact: [{ key: 'email', value: 'a@b.test', evidence: 'x', source: SRC }],
      people: [{ name: 'marta ruiz', role: null, instagram: null, linkedin: null, evidence: 'x', source: SRC }],
    }, { ...ctx, known: { nights: '4+' }, contact: { email: 'ya@hay.test' }, people: ['Marta Ruiz'] });
    expect(r.suggestions).toEqual([]);
  });

  test('basura → vacío, sin romper', () => {
    expect(sanitizeResearch(null, ctx)).toMatchObject({ summary: '', look: [], suggestions: [], sources: [] });
    expect(sanitizeResearch({ qualification: 'x', people: [null] }, ctx).suggestions).toEqual([]);
  });

  test('fuentes: solo http(s) con dominio', () => {
    expect(sourceUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(sourceUrl('ftp://a.test')).toBeNull();
    expect(sourceUrl('http://localhost')).toBeNull();
    expect(sourceUrl(3)).toBeNull();
  });

  test('la herramienta es estricta y el prompt lleva lo que sabemos', () => {
    expect(SAVE_TOOL.strict).toBe(true);
    expect(SAVE_TOOL.input_schema.additionalProperties).toBe(false);
    const p = userPrompt({ name: 'Sala X', city: 'Valencia', address: null, website: null, instagram: null, seller: 'Enjoy', known: { nights: '4+' },
      sector: { name: 'Ocio nocturno', icp: 'Salas con DJ', personas: ['Dueño'] } });
    expect(p).toContain('Sala X'); expect(p).toContain('Valencia'); expect(p).toContain('Salas con DJ'); expect(p).toContain('"nights":"4+"');
  });
});

describe('investigar desde la ficha', () => {
  beforeEach(() => { resetDemoDb(); });
  const marina = () => demoDb().account.find((a) => a.name === 'Sala Marina')!;

  test('sin clave: 503 con el motivo', async () => {
    await expect(svc(null).aiRun(marina().id, { sector: null, seller: 'Enjoy' })).rejects.toMatchObject({ status: 503 });
  });

  test('propone, aceptar lo guarda en la ficha (sin pisar) y descartar no', async () => {
    const s = svc(fixtureResearch());
    const id = marina().id;
    const r = await s.aiRun(id, { sector: null, seller: 'Enjoy' });
    // decider (no se puede saber desde fuera), scale (sin prueba) y la web sin fuente se descartan solos.
    expect(r.suggestions.map((x) => (x.kind === 'person' ? 'person' : x.key))).toEqual(['nights', 'screens', 'email', 'person']);
    expect(marina().owner_id ?? null).toBeNull();  // investigar no reserva
    const by = (k: string) => r.suggestions.find((x) => (x.kind === 'person' ? 'person' : x.key) === k)!.id;
    await s.aiDecide(id, by('nights'), true);
    await s.aiDecide(id, by('email'), true);
    await s.aiDecide(id, by('person'), true);
    await s.aiDecide(id, by('screens'), false);
    const a = marina();
    expect(a.qualification).toMatchObject({ nights: '3' });
    expect((a.qualification as Record<string, unknown>).screens).toBeUndefined();
    expect(a.email).toBe('hola@ejemplo.test');
    const people = await s.company(id);
    expect(JSON.stringify(people)).toContain('Laura Gil');
    const saved = await s.aiResearch(id);
    expect(saved?.suggestions.map((x) => x.status)).toEqual(['accepted', 'dismissed', 'accepted', 'accepted']);
    await expect(s.aiDecide(id, by('nights'), true)).rejects.toBeInstanceOf(AdminError);  // ya decidida
  });

  test('no se investiga dos veces seguidas', async () => {
    const s = svc(fixtureResearch());
    await s.aiRun(marina().id, { sector: null, seller: 'Enjoy' });
    await expect(s.aiRun(marina().id, { sector: null, seller: 'Enjoy' })).rejects.toMatchObject({ status: 409 });
  });

  test('si la IA falla: 503 y no se guarda nada', async () => {
    const s = svc({ async research() { throw new Error('timeout'); } });
    await expect(s.aiRun(marina().id, { sector: null, seller: 'Enjoy' })).rejects.toMatchObject({ status: 503 });
    expect(await s.aiResearch(marina().id)).toBeNull();
  });
});

describe('la llamada a Claude', () => {
  const msg = (content: unknown[], stop: string) => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } });
  test('modelo, herramientas web, respaldo y pausa; devuelve lo de save_research', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const headers: string[] = [];
    const replies = [
      msg([{ type: 'text', text: 'Buscando…' }], 'pause_turn'),
      msg([{ type: 'tool_use', id: 't1', name: 'save_research', input: { summary: 'ok', look: [], qualification: [], contact: [], people: [], sources: [] } }], 'tool_use'),
    ];
    const fake = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      headers.push(new Headers(init.headers).get('anthropic-beta') ?? '');
      return new Response(JSON.stringify(replies.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const out = await claudeResearch('k', fake).research({ name: 'Sala X', city: 'Valencia', address: null, website: null, instagram: null, sector: null, seller: 'Enjoy', known: {} });
    expect(out).toMatchObject({ summary: 'ok' });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low' } });
    expect((bodies[0].tools as Array<{ name: string }>).map((t) => t.name)).toEqual(['web_search', 'web_fetch', 'save_research']);
    expect(headers[0]).toContain('server-side-fallback-2026-07-01');
    // Tras la pausa, el turno del asistente vuelve tal cual.
    expect((bodies[1].messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['user', 'assistant']);
  });
  test('si se niega: null', async () => {
    const fake = (async () => new Response(JSON.stringify(msg([], 'refusal')), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await claudeResearch('k', fake).research({ name: 'X', city: null, address: null, website: null, instagram: null, sector: null, seller: 'E', known: {} })).toBeNull();
  });
});
