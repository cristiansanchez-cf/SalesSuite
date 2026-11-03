import { beforeEach, describe, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import type { NoteItem } from '../crm/notes';
import { parseWebhook, type Inbound } from '../leads/whatsapp';
import { demoAssistantDb, resetDemoAssistant } from './db-demo';
import { handle, STATE_TTL_MS, type AssistantOps, type Candidate, type State } from './flow';
import { processAssistant, teamMember } from './process';
import { fixtureTranscriber } from './transcribe';

const NOW = new Date('2026-11-03T10:00:00Z');
const item = (venue: string, over: Partial<NoteItem> = {}): NoteItem => ({
  venue, interaction: 'Hablé con Marta, quieren la pantalla', keyFacts: ['Quiere pantalla'], facts: [], fit: null, fields: {}, channel: 'visit', outcome: 'interested',
  day: null, qualification: {}, nextStep: 'Llamarla', nextDays: 3, discard: null, discardWhy: null, entity: null, worksAt: [], people: [], contact: {}, ...over,
});
const cand = (id: string, name: string, score: number): Candidate => ({ id, name, zone: 'Valencia', score, discarded: false });
function fakeOps(over: Partial<AssistantOps> = {}) {
  const applied: unknown[][] = [];
  const ops: AssistantOps = {
    split: async () => [{ ...item('Club Sol'), candidates: [cand('a1', 'Club Sol', 1)] }],
    search: async (q) => (/salamandra/i.test(q) ? [cand('s1', 'Grupo Salamandra', 0.8), cand('s2', 'Salamandra Club', 0.78)] : []),
    apply: async (rows) => { applied.push(rows); return rows.map((r) => ({ accountId: (r as { accountId: string | null }).accountId ?? 'new', name: (r as { create?: string }).create ?? 'Club Sol', ok: true })); },
    ...over,
  };
  return { ops, applied };
}
const run = (ops: AssistantOps, msg: Parameters<typeof handle>[1], st: State = { step: 'idle' }, now = NOW) => handle({ ops, now, locale: 'es' }, msg, st);

describe('la conversación', () => {
  test('empresa clara → resumen con Guardar / Cambiar → guardado', async () => {
    const { ops, applied } = fakeOps();
    const a = await run(ops, { kind: 'text', text: 'He estado en Club Sol con Marta' });
    expect(a.state.step).toBe('confirm');
    expect(a.replies[0].text).toContain('*Club Sol*');
    expect(a.replies[0].text).toContain('Visita · interesado');
    expect(a.replies[0].text).toContain('Próximo paso: Llamarla (en 3 días)');
    expect(a.replies[0].buttons?.map((b) => b.id)).toEqual(['save', 'change']);
    expect(applied).toHaveLength(0); // nada sin confirmar
    const b = await run(ops, { kind: 'button', id: 'save' }, a.state);
    expect(b.state.step).toBe('idle');
    expect(b.replies[0].text).toBe('✅ Guardado en Club Sol.');
    expect(applied[0][0]).toMatchObject({ accountId: 'a1', create: null, interaction: 'Hablé con Marta, quieren la pantalla', discard: null, nextDays: 3 });
  });
  test('si duda, pregunta cuál; con el número elige y «0» crea', async () => {
    const { ops, applied } = fakeOps({ split: async () => [{ ...item('Salamandra'), candidates: [cand('s1', 'Grupo Salamandra', 0.8), cand('s2', 'Salamandra Club', 0.78)] }] });
    const a = await run(ops, { kind: 'text', text: 'Estuve con los de Salamandra' });
    expect(a.state.step).toBe('pick');
    expect(a.replies[0].text).toMatch(/¿Cuál es «Salamandra»\?\n1\) Grupo Salamandra · Valencia\n2\) Salamandra Club · Valencia\n0\) Crear «Salamandra»/);
    const b = await run(ops, { kind: 'text', text: '2' }, a.state);
    expect(b.state.step).toBe('confirm');
    expect(b.replies[0].text).toContain('*Salamandra Club*');
    await run(ops, { kind: 'text', text: 'sí' }, b.state);
    expect(applied[0][0]).toMatchObject({ accountId: 's2' });
    const c = await run(ops, { kind: 'text', text: '0' }, a.state);
    expect(c.replies[0].text).toContain('*Salamandra* (nueva)');
  });
  test('«Cambiar» no guarda; «cancelar» vuelve a empezar; lo viejo caduca', async () => {
    const { ops, applied } = fakeOps();
    const a = await run(ops, { kind: 'text', text: 'Club Sol: bien' });
    expect((await run(ops, { kind: 'button', id: 'change' }, a.state)).replies[0].text).toContain('no guardo nada');
    expect((await run(ops, { kind: 'text', text: 'cancelar' }, a.state)).state.step).toBe('idle');
    const late = await run(ops, { kind: 'button', id: 'save' }, a.state, new Date(NOW.getTime() + STATE_TTL_MS + 1000));
    expect(late.replies[0].text).toContain('ya no está pendiente');
    expect(applied).toHaveLength(0);
  });
  test('reenviados: se juntan, pregunta de quién son y van como «WhatsApp · contestó»', async () => {
    const { ops, applied } = fakeOps({ search: async (q) => (/sol/i.test(q) ? [cand('a1', 'Club Sol', 1)] : []) });
    const a = await run(ops, { kind: 'text', text: '¿Me pasas el precio?', forwarded: true });
    expect(a.replies[0].text).toContain('¿De qué empresa es esta conversación?');
    const b = await run(ops, { kind: 'text', text: 'Somos 300 personas', forwarded: true }, a.state);
    expect(b.replies).toHaveLength(0);
    const c = await run(ops, { kind: 'text', text: 'Club Sol' }, b.state);
    expect(c.replies[0].text).toContain('WhatsApp · contestó');
    await run(ops, { kind: 'button', id: 'save' }, c.state);
    expect(applied[0][0]).toMatchObject({ accountId: 'a1', channel: 'whatsapp', outcome: 'replied', interaction: '¿Me pasas el precio?\nSomos 300 personas' });
  });
  test('reenviados a una empresa que no existe → «0» la crea', async () => {
    const { ops, applied } = fakeOps();
    const a = await run(ops, { kind: 'text', text: 'Hola', forwarded: true });
    const b = await run(ops, { kind: 'text', text: 'Bar Nuevo' }, a.state);
    expect(b.replies[0].text).toContain('No encuentro «Bar Nuevo»');
    const c = await run(ops, { kind: 'text', text: '0' }, b.state);
    await run(ops, { kind: 'text', text: 'ok' }, c.state);
    expect(applied[0][0]).toMatchObject({ accountId: null, create: 'Bar Nuevo' });
  });
  test('audio: dice lo que ha entendido; sin transcripción pide texto', async () => {
    const { ops } = fakeOps();
    const a = await run(ops, { kind: 'audio', text: 'He estado en Club Sol' });
    expect(a.replies[0].text).toBe('🎙️ He entendido: «He estado en Club Sol»');
    expect(a.replies[1].buttons).toBeTruthy();
    expect((await run(ops, { kind: 'audio', text: null })).replies[0].text).toContain('escríbemelo');
  });
  test('si la IA falla o no saca nada, lo dice', async () => {
    expect((await run(fakeOps({ split: async () => { throw new Error('x'); } }).ops, { kind: 'text', text: 'algo largo' })).replies[0].text).toContain('no puedo leerlo');
    expect((await run(fakeOps({ split: async () => [] }).ops, { kind: 'text', text: 'algo largo' })).replies[0].text).toContain('No he sacado nada');
    expect((await run(fakeOps().ops, { kind: 'text', text: 'hola' })).replies[0].text).toContain('Soy el asistente');
  });
});

describe('webhook de Meta: lo que necesita el asistente', () => {
  test('texto reenviado, audio y botón', () => {
    const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, messages: [
      { from: '34699000111', id: 'm1', timestamp: '1762164000', type: 'text', text: { body: 'Hola' }, context: { forwarded: true } },
      { from: '34699000111', id: 'm2', timestamp: '1762164000', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg' } },
      { from: '34699000111', id: 'm3', timestamp: '1762164000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'save', title: 'Guardar' } } },
    ] } }] }] };
    const { inbound } = parseWebhook(body);
    expect(inbound.map((m) => [m.kind, m.forwarded, m.mediaId, m.buttonId])).toEqual([['text', true, null, null], ['audio', false, 'media-1', null], ['button', false, null, 'save']]);
  });
});

describe('de punta a punta (demo)', () => {
  const ENJOY = '00000000-0000-4000-8000-000000000e01';
  const REP = '11111111-1111-4111-8111-111111111111';
  const sent: Array<{ text: string; buttons?: string[] }> = [];
  const wa = {
    async sendTemplate() { return { id: null }; },
    async sendText(_p: string, _to: string, text: string) { sent.push({ text }); return { id: null }; },
    async sendButtons(_p: string, _to: string, text: string, b: Array<{ id: string }>) { sent.push({ text, buttons: b.map((x) => x.id) }); return { id: null }; },
    async media() { return { bytes: new Uint8Array([1]), type: 'audio/ogg' }; },
  };
  const deps = () => ({
    db: demoAssistantDb(), wa, transcribe: fixtureTranscriber, now: new Date(),
    actAs: async (t: string, u: string) => { const tenant = await publicRepository().resolveTenantBySlug('enjoy'); return tenant && t === ENJOY ? contextAs(tenant, u) : null; },
  });
  const msg = (id: string, over: Partial<Inbound>): Inbound => ({ phoneId: '123', from: '+34699000111', text: '', at: new Date(), id, kind: 'text', ...over });
  beforeEach(() => {
    resetDemoDb(); resetDemoAssistant(); sent.length = 0;
    process.env.AI_RESEARCH_FIXTURE = '1';
    demoDb().users.find((u) => u.id === REP)!.phone = '699 00 01 11';
  });

  test('le reconoce por su teléfono (aunque esté sin prefijo) y no a otro', async () => {
    expect(await teamMember(demoAssistantDb(), ENJOY, '+34699000111')).toEqual({ tenantId: ENJOY, userId: REP });
    expect(await teamMember(demoAssistantDb(), ENJOY, '+34600000000')).toBeNull();
    expect(await teamMember(demoAssistantDb(), '00000000-0000-4000-8000-000000000a01', '+34699000111')).toBeNull();
  });

  test('un audio → lo entiende → Guardar → la interacción queda en Club Sol a su nombre', async () => {
    const member = { tenantId: ENJOY, userId: REP };
    expect(await processAssistant(deps(), '123', member, msg('w1', { kind: 'audio', mediaId: 'media-1' }))).toBe('handled');
    expect(sent[0].text).toContain('He entendido');
    // El audio de ejemplo no lleva «Sitio: …» (lo que separa la IA de pruebas): no saca nada y lo dice.
    expect(sent[1].text).toContain('No he sacado nada');
    sent.length = 0;
    await processAssistant(deps(), '123', member, msg('w2', { text: 'Club Sol: hablé con Marta, quieren pantalla los viernes' }));
    expect(sent[0].buttons).toEqual(['save', 'change']);
    expect(sent[0].text).toContain('*Club Sol*');
    // Meta reintenta el mismo mensaje: no se repite.
    expect(await processAssistant(deps(), '123', member, msg('w2', { text: 'Club Sol: hablé con Marta' }))).toBe('duplicate');
    await processAssistant(deps(), '123', member, msg('w3', { kind: 'button', buttonId: 'save', text: 'Guardar' }));
    expect(sent.at(-1)?.text).toBe('✅ Guardado en Club Sol.');
    const sol = demoDb().account.find((a) => a.tenant_id === ENJOY && a.name === 'Club Sol')!;
    const act = demoDb().crm_activity.find((a) => a.account_id === sol.id && a.user_id === REP && /Marta/.test(a.note ?? ''));
    expect(act).toBeTruthy();
  });
});
