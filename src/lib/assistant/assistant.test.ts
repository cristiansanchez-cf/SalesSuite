import { beforeEach, describe, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import type { NoteItem } from '../crm/notes';
import { parseWebhook, type Inbound } from '../leads/whatsapp';
import { demoAssistantDb, resetDemoAssistant } from './db-demo';
import { handle, REMINDER_TTL_MS, STATE_TTL_MS, type AssistantOps, type Candidate, type ReminderItem, type State } from './flow';
import { processAssistant, teamMember } from './process';
import { fixtureTranscriber } from './transcribe';
import { demoReminderDb, demoReminderLog } from './reminders-db';
import { namesLine, runReminders } from './reminders';

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

describe('el recordatorio de la mañana', () => {
  const A = '00000000-0000-4000-8000-0000000ac001';
  const B = '00000000-0000-4000-8000-0000000ac002';
  const ri = (accountId: string, name: string, over: Partial<ReminderItem> = {}): ReminderItem => ({
    accountId, name, bucket: 'cooling', cooling: 3, contactName: 'Marta', step: 'Proponer cita', channel: 'whatsapp', last: { outcome: 'interested', note: 'Le gustó', at: '2026-10-29T10:00:00Z' }, facts: [], ...over,
  });
  const waiting = (items = [ri(A, 'Club Sol'), ri(B, 'Sala Marina', { bucket: 'overdue', contactName: null })], at = NOW): State => ({ step: 'reminder', at: at.toISOString(), items });

  test('«sí» (o el botón de la plantilla) → una propuesta por empresa con «Hecho» y «Mañana»', async () => {
    const drafted: string[] = [];
    const { ops } = fakeOps({ draft: async (it) => { drafted.push(it.name); return `Hola ${it.contactName ?? ''}, ¿cómo lo veis?`; } });
    for (const msg of [{ kind: 'text' as const, text: 'Sí' }, { kind: 'button' as const, id: 'Sí, prepáralos' }]) {
      const r = await run(ops, msg, waiting());
      expect(r.state).toEqual({ step: 'idle' });
      expect(r.replies).toHaveLength(2);
      expect(r.replies[0].text).toContain('*Club Sol* · Marta');
      expect(r.replies[0].text).toContain('Contestó hace 3 días');
      expect(r.replies[0].text).toContain('Hola Marta, ¿cómo lo veis?');
      expect(r.replies[1].text).toContain('vencido');
      expect(r.replies[0].buttons?.map((b) => b.id)).toEqual([`done:${A}`, `later:${A}`]);
    }
    expect(drafted).toEqual(['Club Sol', 'Sala Marina', 'Club Sol', 'Sala Marina']);
  });

  test('sin IA, la empresa sale igual (sin propuesta de mensaje)', async () => {
    const { ops } = fakeOps({ draft: async () => { throw new Error('caída'); } });
    const r = await run(ops, { kind: 'text', text: 'vale' }, waiting([ri(A, 'Club Sol')]));
    expect(r.replies[0].text).toContain('Ahora no puedo proponerte el mensaje');
    expect(r.replies[0].buttons).toHaveLength(2);
  });

  test('«más tarde» → nada; un mensaje largo se apunta como siempre', async () => {
    let split = 0;
    const { ops } = fakeOps({ draft: async () => 'x', split: async () => { split++; return []; } });
    const later = await run(ops, { kind: 'text', text: 'Más tarde' }, waiting());
    expect(later.replies[0].text).toContain('«Hoy»');
    expect(later.state).toEqual({ step: 'idle' });
    await run(ops, { kind: 'text', text: 'Sí, hoy he hablado con Club Sol y quieren la pantalla' }, waiting());
    expect(split).toBe(1);
  });

  test('espera la respuesta todo el día, no más', async () => {
    let drafts = 0;
    const { ops } = fakeOps({ draft: async () => { drafts++; return 'x'; } });
    const early = new Date(NOW.getTime() - 5 * 3_600_000);
    expect((await run(ops, { kind: 'text', text: 'sí' }, waiting(undefined, early))).replies).toHaveLength(2);
    expect(REMINDER_TTL_MS).toBeGreaterThan(STATE_TTL_MS);
    const old = new Date(NOW.getTime() - REMINDER_TTL_MS - 60_000);
    await run(ops, { kind: 'text', text: 'sí' }, waiting(undefined, old));
    expect(drafts).toBe(2);
  });

  test('«Hecho» y «Mañana» valen aunque haya pasado el rato; si falla, lo dice', async () => {
    const calls: string[] = [];
    const { ops } = fakeOps({
      done: async (id) => { calls.push(`done ${id}`); return { name: 'Club Sol', nextAt: null }; },
      later: async (id) => { calls.push(`later ${id}`); return { name: 'Club Sol' }; },
    });
    expect((await run(ops, { kind: 'button', id: `done:${A}` })).replies[0].text).toBe('✅ Apuntado: le has escrito a Club Sol.');
    expect((await run(ops, { kind: 'button', id: `later:${A}` })).replies[0].text).toBe('Vale, Club Sol pasa a mañana.');
    expect(calls).toEqual([`done ${A}`, `later ${A}`]);
    const { ops: bad } = fakeOps({ done: async () => { throw new Error('x'); } });
    expect((await run(bad, { kind: 'button', id: `done:${A}` })).replies[0].text).toContain('No he podido');
  });

  test('la lista de nombres del mensaje', () => {
    expect(namesLine(['Club Sol'], 'es')).toBe('Club Sol');
    expect(namesLine(['Club Sol', 'Sala Marina'], 'es')).toBe('Club Sol y Sala Marina');
    expect(namesLine(['A', 'B', 'C', 'D', 'E'], 'es')).toBe('A, B, C y 2 más');
    expect(namesLine(['A', 'B', 'C', 'D'], 'en')).toBe('A, B, C and 1 more');
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
  test('el botón de una plantilla (el «Sí, prepáralos» del recordatorio)', () => {
    const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, messages: [
      { from: '34699000111', id: 'm4', timestamp: '1762164000', type: 'button', button: { payload: 'Sí, prepáralos', text: 'Sí, prepáralos' } },
    ] } }] }] };
    expect(parseWebhook(body).inbound.map((m) => [m.kind, m.buttonId])).toEqual([['button', 'Sí, prepáralos']]);
  });
});

describe('de punta a punta (demo)', () => {
  const ENJOY = '00000000-0000-4000-8000-000000000e01';
  const REP = '11111111-1111-4111-8111-111111111111';
  const sent: Array<{ text: string; buttons?: string[] }> = [];
  const templates: unknown[][] = [];
  const wa = {
    async sendTemplate(...a: unknown[]) { templates.push(a); return { id: null }; },
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
    resetDemoDb(); resetDemoAssistant(); demoReminderLog().clear(); sent.length = 0; templates.length = 0;
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

  test('recordatorio: por la mañana, una vez al día, y con su «sí» las propuestas; «Hecho» lo apunta en el CRM', async () => {
    demoDb().users.find((u) => u.id === REP)!.wa_reminders = true;
    const morning = new Date('2026-11-03T09:30:00Z'); // 10:30 en Madrid
    const settings = { whatsappPhoneId: '123', whatsappTemplates: { reminder: { es: 'equipo_recordatorio_es' } } };
    const rdeps = (now: Date, s: unknown = settings) => ({ db: demoReminderDb(), assistant: demoAssistantDb(), wa, now, settings: async () => s as never, actAs: deps().actAs });
    // Sin plantilla aprobada no escribe (ni lo da por hecho); de madrugada, tampoco.
    expect((await runReminders(rdeps(morning, { whatsappPhoneId: '123' }))).skipped).toBeGreaterThan(0);
    expect((await runReminders(rdeps(new Date('2026-11-03T05:00:00Z')))).sent).toBe(0);
    expect(templates).toHaveLength(0);
    const r = await runReminders(rdeps(morning));
    expect(r.sent).toBe(1);
    const [phoneId, to, name, locale, params] = templates[0] as [string, string, string, string, string[]];
    expect([phoneId, to, name, locale]).toEqual(['123', '+34699000111', 'equipo_recordatorio_es', 'es']);
    expect(params[2]).toContain('Club Sol');
    // El cron pasa cada 10 minutos: no se repite.
    expect((await runReminders(rdeps(new Date('2026-11-03T09:40:00Z')))).sent).toBe(0);
    expect(templates).toHaveLength(1);

    const member = { tenantId: ENJOY, userId: REP };
    await processAssistant({ ...deps(), now: morning }, '123', member, msg('r1', { kind: 'button', buttonId: 'Sí, prepáralos', text: 'Sí, prepáralos' }));
    const sol = demoDb().account.find((a) => a.tenant_id === ENJOY && a.name === 'Club Sol')!;
    const card = sent.find((x) => x.text.includes('*Club Sol*'))!;
    expect(card.text).toContain('Propuesta de mensaje');
    expect(card.buttons).toEqual([`done:${sol.id}`, `later:${sol.id}`]);
    const before = demoDb().crm_activity.filter((a) => a.account_id === sol.id).length;
    await processAssistant({ ...deps(), now: morning }, '123', member, msg('r2', { kind: 'button', buttonId: `done:${sol.id}`, text: 'Hecho' }));
    expect(sent.at(-1)?.text).toContain('✅ Apuntado: le has escrito a Club Sol');
    const acts = demoDb().crm_activity.filter((a) => a.account_id === sol.id);
    expect(acts.length).toBe(before + 1);
    expect(acts.some((a) => a.channel === 'whatsapp' && a.user_id === REP && /recordatorio/.test(a.note ?? ''))).toBe(true);
  });
});
