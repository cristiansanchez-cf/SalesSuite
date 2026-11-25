/**
 * Una nota con varias cosas que hacer, mensajes largos sin cortar, audios reenviados de clientes y el recordatorio de la
 * mañana como agenda (criterio de Cristian, 25-nov-2026).
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import { orderSteps, sanitizeNotes, type NoteItem } from '../crm/notes';
import { handle, type AssistantOps, type State } from './flow';
import { chunks, plan, BUTTON_BODY_MAX } from './process';
import { agendaLine, remindOne } from './reminders';
import { demoAssistantDb, resetDemoAssistant } from './db-demo';
import { demoReminderDb, demoReminderLog } from './reminders-db';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const REP = '11111111-1111-4111-8111-111111111111';
const SOL = '00000000-0000-4000-8000-0000000ac001';
const NOW = new Date('2026-11-25T10:00:00Z');
const item = (over: Partial<NoteItem> = {}): NoteItem => ({
  venue: 'La Parada', interaction: 'Hablé con Vicente', keyFacts: [], facts: [], fit: null, fields: {}, channel: 'visit', outcome: 'interested',
  day: null, qualification: {}, nextStep: null, nextDays: null, discard: null, discardWhy: null, entity: null, worksAt: [], people: [], contact: {}, ...over,
});
const rep = async () => {
  const tenant = await publicRepository().resolveTenantBySlug('enjoy');
  return (await contextAs(tenant!, REP))!;
};

describe('varias cosas que hacer en una nota', () => {
  test('la más cercana es el próximo paso; las demás, después y en orden (aunque la IA las dé al revés)', () => {
    const it = item({ nextStep: 'En enero: ofrecer la suscripción de fotos y mensajes', nextDays: 37 });
    orderSteps(it, [{ step: 'Llamar a Vicente para la fidelización', days: 9 }, { step: 'mal', days: 999 }, { step: '', days: 3 }]);
    expect(it.nextStep).toBe('Llamar a Vicente para la fidelización');
    expect(it.nextDays).toBe(9);
    expect(it.laterSteps).toEqual([{ step: 'En enero: ofrecer la suscripción de fotos y mensajes', days: 37 }]);
    // Desde la respuesta de la IA, igual.
    const [x] = sanitizeNotes({ items: [{ venue: 'La Parada', interaction: 'Hablé con Vicente', channel: 'visit', outcome: 'interested', next_step: 'Llamarle', next_days: 9, later_steps: [{ step: 'Ofrecer la suscripción', days: 37 }] }] });
    expect(x!.nextStep).toBe('Llamarle');
    expect(x!.laterSteps).toEqual([{ step: 'Ofrecer la suscripción', days: 37 }]);
  });

  test('al guardar: el próximo paso y lo de después en la ficha; cuando le toca, pasa a próximo paso', async () => {
    const admin = await rep();
    const [r] = await admin.crm.notesApply([{ accountId: SOL, interaction: 'Hablé con Marta', channel: 'visit', outcome: 'interested', nextStep: 'Llamar para fidelizar', nextDays: 9,
      laterSteps: [{ step: 'Ofrecer la suscripción de fotos', days: 37 }] }]);
    expect(r!.ok).toBe(true);
    let a = (await admin.accounts.get(SOL)).account;
    expect(a.nextStep).toBe('Llamar para fidelizar');
    const plan1 = a.facts.find((f) => f.kind === 'plan')!;
    expect(plan1.text).toBe('Ofrecer la suscripción de fotos');
    expect(plan1.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Hecho el próximo paso (se quita): lo de después sube, y ya no está en la cola.
    await admin.crm.setNextStep(SOL, null);
    a = (await admin.accounts.get(SOL)).account;
    expect(a.nextStep).toBe('Ofrecer la suscripción de fotos');
    expect(a.nextStepAt?.slice(0, 10)).toBe(plan1.due);
    expect(a.facts.some((f) => f.kind === 'plan')).toBe(false);
  });

  test('«Hoy»: lo de después que ya toca y va antes que el próximo paso, sube (y el otro vuelve a la cola)', async () => {
    const admin = await rep();
    const sol = demoDb().account.find((x) => x.id === SOL)!;
    sol.next_step = 'Mandar la propuesta'; sol.next_step_at = '2026-12-20T10:00:00.000Z';
    sol.facts = [{ id: 'p1', text: 'Llamar a Marta', kind: 'plan', at: '2026-11-01T10:00:00Z', by: REP, due: '2020-01-01' }];
    const t = await admin.crm.today();
    expect(t.items.find((i) => i.id === SOL)?.nextStep).toBe('Llamar a Marta');
    const a = (await admin.accounts.get(SOL)).account;
    expect(a.facts.filter((f) => f.kind === 'plan').map((f) => [f.text, f.due])).toEqual([['Mandar la propuesta', '2026-12-20']]);
  });
  beforeEach(() => { resetDemoDb(); process.env.AI_RESEARCH_FIXTURE = '1'; });
});

describe('mensajes largos: enteros, no cortados', () => {
  test('un resumen largo con botones: el texto en mensajes normales y los botones al final', () => {
    const long = ['Esto es lo que guardo:', ...Array.from({ length: 12 }, (_, i) => `*Punto ${i}* ${'detalle '.repeat(40)}`), 'Próximo paso: llamar'].join('\n\n');
    const out = plan({ text: long, buttons: [{ id: 'save', title: 'Guardar' }] }, '¿Qué hago con esto?');
    expect(out.at(-1)!.buttons?.[0]?.id).toBe('save');
    expect(out.at(-1)!.text).toBe('Próximo paso: llamar');
    expect(out.every((m) => m.text.length <= 3800)).toBe(true);
    expect(out.slice(0, -1).every((m) => !m.buttons)).toBe(true);
    // Nada se pierde.
    expect(out.map((m) => m.text).join('\n\n').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' '));
    // Uno corto, tal cual.
    expect(plan({ text: 'Hola', buttons: [{ id: 'x', title: 'X' }] }, '?')).toEqual([{ text: 'Hola', buttons: [{ id: 'x', title: 'X' }] }]);
    expect(BUTTON_BODY_MAX).toBeLessThanOrEqual(1024);
    expect(chunks('a'.repeat(9000)).every((c) => c.length <= 3800)).toBe(true);
  });
});

describe('el asistente', () => {
  const ops = (got: string[] = []): AssistantOps => ({
    split: async (t) => { got.push(t); return [{ ...item({ nextStep: 'Llamar', nextDays: 9, laterSteps: [{ step: 'Ofrecer la suscripción', days: 37 }], facts: ['Tienen 3 pantallas', 'Abren de jueves a sábado'] }), candidates: [{ id: 'a1', name: 'La Parada', zone: 'Almería', score: 1, discarded: false }] }]; },
    search: async () => [],
    apply: async (rows) => rows.map(() => ({ accountId: 'a1', name: 'La Parada', ok: true })),
  });
  const run = (o: AssistantOps, msg: Parameters<typeof handle>[1], st: State = { step: 'idle' }) => handle({ ops: o, now: NOW, locale: 'es' }, msg, st);

  test('el resumen enseña todo lo que sabemos y lo de después', async () => {
    const r = await run(ops(), { kind: 'text', text: 'He estado en La Parada con Vicente, le llamo en semana y media y en enero le ofrezco la suscripción' });
    const t = r.replies[0]!.text;
    expect(t).toContain('• Tienen 3 pantallas');
    expect(t).toContain('Próximo paso: Llamar (en 9 días)');
    expect(t).toMatch(/Después: Ofrecer la suscripción \(1 de enero\)/);
  });

  test('un audio largo después del resumen («lo que saco de aquí es…») se suma a lo que contó', async () => {
    const got: string[] = [];
    const o = ops(got);
    const a = await run(o, { kind: 'text', text: 'He estado en La Parada con Vicente, le interesa' });
    const more = `Lo que saco de aquí es que ${'vamos a hacer varias cosas, '.repeat(15)}y en enero le ofrezco la suscripción`;
    const b = await run(o, { kind: 'audio', text: more }, a.state);
    expect(b.state.step).toBe('confirm');
    expect(got.at(-1)).toContain('He estado en La Parada con Vicente');
    expect(got.at(-1)).toContain('Lo que saco de aquí');
  });

  test('«hablé con el de la Bresh y me dijo esto:» + su audio reenviado: son sus palabras, junto con lo que contó', async () => {
    const got: string[] = [];
    const o = ops(got);
    const a = await run(o, { kind: 'text', text: 'Hablé con el de la Bresh y me dijo esto:' });
    expect(a.state.step).toBe('context');
    const b = await run(o, { kind: 'audio', text: 'Nos interesa, pero hasta marzo no podemos', forwarded: true }, a.state);
    expect(b.state.step).toBe('forward');
    expect(b.replies.some((x) => /Recibido/.test(x.text))).toBe(true);
    const c = await run(o, { kind: 'text', text: 'listo' }, b.state);
    expect(c.state.step).toBe('confirm');
    expect(got.at(-1)).toContain('Hablé con el de la Bresh');
    // El audio del cliente va literal, como sus palabras.
    const s = c.state as Extract<State, { step: 'confirm' }>;
    expect(s.pending[0]!.item.interaction).toContain('Audio del cliente (sus palabras): «Nos interesa, pero hasta marzo no podemos»');
  });

  test('caso Bresh: recién guardado otra cosa, «te paso su audio a continuación» espera el audio', async () => {
    const got: string[] = [];
    const o = ops(got);
    const saved: State = { step: 'saved', at: NOW.toISOString(), saved: [{ id: 'x', name: 'Club Sol' }] };
    const a = await run(o, { kind: 'audio', text: 'Estuve hablando con Brother, que es... ¿cómo se llama? Se llama Alejandro. Alejandro de Breach. Y básicamente me escribió un audio que te puedo pasar ahora a continuación. Y ahora te digo mis apreciaciones sobre eso.' }, saved);
    expect(a.state.step).toBe('context');
    expect(got).toHaveLength(0);
    const b = await run(o, { kind: 'audio', text: 'Ahora mismo no te puedo atender, el año que viene hablamos', forwarded: true }, a.state);
    expect(b.state.step).toBe('forward');
    // Sus apreciaciones: se junta todo (lo que contó, el audio literal y lo que saca de ello).
    const c = await run(o, { kind: 'audio', text: 'Lo que saco es que hay que hablarles en 2027 y por correo' }, b.state);
    expect(c.state.step).toBe('confirm');
    expect(got.at(-1)).toContain('Alejandro de Breach');
    expect(got.at(-1)).toContain('hablarles en 2027');
    expect((c.state as Extract<State, { step: 'confirm' }>).pending[0]!.item.interaction).toContain('Audio del cliente (sus palabras)');
  });

  test('tras «Cambiar», el audio reenviado se suma a lo que contó (no pregunta de qué empresa es)', async () => {
    const got: string[] = [];
    const o = ops(got);
    const a = await run(o, { kind: 'text', text: 'He hablado con Alejandro de Bresh, le interesa más adelante' });
    const b = await run(o, { kind: 'button', id: 'change' }, a.state);
    expect(b.state.step).toBe('amend');
    const c = await run(o, { kind: 'audio', text: 'El año que viene hablamos', forwarded: true }, b.state);
    expect(c.state.step).toBe('confirm');
    expect(got.at(-1)).toContain('He hablado con Alejandro de Bresh');
    expect(got.at(-1)).toContain('El año que viene hablamos');
  });

  test('al preguntar de qué empresa es, si cuenta más que el nombre, se apunta con eso', async () => {
    const got: string[] = [];
    const o = ops(got);
    const a = await run(o, { kind: 'audio', text: 'El año que viene hablamos', forwarded: true });
    const b = await run(o, { kind: 'text', text: 'Bresh es un audio de Alejandro que me mandó, tendremos que hablarles en 2027 y por correo' }, a.state);
    expect(b.state.step).toBe('confirm');
    expect(got.at(-1)).toContain('tendremos que hablarles en 2027');
    expect(got.at(-1)).toContain('El año que viene hablamos');
  });

  test('audio reenviado sin nada delante: pregunta de qué empresa es', async () => {
    const r = await run(ops(), { kind: 'audio', text: 'Hola, ¿cuándo venís a montar la pantalla?', forwarded: true });
    expect(r.state.step).toBe('forward');
    expect(r.replies.at(-1)!.text).toMatch(/De qué empresa/);
  });
});

describe('el recordatorio de la mañana, como agenda', () => {
  const m = { tenantId: ENJOY, userId: REP, phone: '699 00 01 11', name: 'Comercial Enjoy', locale: 'es', timezone: 'Europe/Madrid' };
  beforeEach(() => { resetDemoDb(); resetDemoAssistant(); demoReminderLog().clear(); process.env.AI_RESEARCH_FIXTURE = '1'; });
  const actAs = async (t: string, u: string) => { const tenant = await publicRepository().resolveTenantBySlug('enjoy'); return tenant && t === ENJOY ? contextAs(tenant, u) : null; };
  const hub = { phoneId: '999', templates: { es: 'equipo_recordatorio_es', en: 'equipo_recordatorio_en', fr: 'equipo_recordatorio_fr' }, agenda: { es: 'equipo_agenda_es', en: 'equipo_agenda_en', fr: 'equipo_agenda_fr' } };

  test('la línea: hoy, mañana y esta semana, sin saltos de línea', () => {
    const l = agendaLine([
      { name: 'Club Sol', bucket: 'today', cooling: null, step: 'Llamar a Marta', at: null, contact: null },
      { name: 'Ghecko', bucket: 'overdue', cooling: null, step: null, at: null, contact: null },
      { name: 'La Parada', bucket: 'tomorrow', cooling: null, step: 'Visita\ncon Vicente', at: null, contact: null },
      { name: 'Sala Marina', bucket: 'week', cooling: null, step: null, at: '2026-11-28T10:00:00Z', contact: null },
    ], 'es');
    expect(l).toBe('hoy: Club Sol (Llamar a Marta), Ghecko (atrasado) · mañana: La Parada (Visita con Vicente) · esta semana: Sala Marina (sáb)');
    expect(l).not.toMatch(/[\n\t]| {5}/);
  });

  test('con la plantilla de la agenda: sale aunque hoy no haya nada; si Meta no la tiene, la de antes', async () => {
    const sent: unknown[][] = [];
    const ok = { async sendTemplate(...a: unknown[]) { sent.push(a); return { id: null }; } };
    const base = { db: demoReminderDb(), assistant: demoAssistantDb(), now: NOW, settings: async () => null, actAs, hub };
    const out = await remindOne({ ...base, wa: ok as never }, m, '2026-11-25');
    expect(out.status).toBe('sent');
    expect(sent[0]![2]).toBe('equipo_agenda_es');
    expect(String((sent[0]![4] as string[])[1])).toMatch(/^(hoy|mañana|esta semana): /);
    // Aún sin aprobar: la de antes (y no se queda sin recordatorio).
    demoReminderLog().clear();
    const tried: string[] = [];
    const noAgenda = { async sendTemplate(_p: string, _to: string, name: string, ...rest: unknown[]) {
      tried.push(name);
      if (name === 'equipo_agenda_es') throw new Error('WhatsApp 404: Template name does not exist in the translation (132001)');
      sent.push([_p, _to, name, ...rest]); return { id: null };
    } };
    const out2 = await remindOne({ ...base, wa: noAgenda as never }, m, '2026-11-26');
    expect(tried[0]).toBe('equipo_agenda_es');
    if (out2.status === 'sent') expect(tried[1]).toBe('equipo_recordatorio_es');
  });
});
