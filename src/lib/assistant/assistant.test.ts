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
import { HUB_PICK, chosenToday, processHub } from './hub';
import { hubConfig, parseTemplates } from './hub-config';

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
  test('«Cambiar» no guarda (pregunta qué cambia); «cancelar» vuelve a empezar; lo viejo caduca', async () => {
    const { ops, applied } = fakeOps();
    const a = await run(ops, { kind: 'text', text: 'Club Sol: bien' });
    const ch = await run(ops, { kind: 'button', id: 'change' }, a.state);
    expect(ch.replies[0].text).toContain('¿Qué cambio?');
    expect(ch.state.step).toBe('amend');
    expect((await run(ops, { kind: 'text', text: 'cancelar' }, a.state)).state.step).toBe('idle');
    const late = await run(ops, { kind: 'button', id: 'save' }, a.state, new Date(NOW.getTime() + STATE_TTL_MS + 1000));
    expect(late.replies[0].text).toContain('ya no está pendiente');
    expect(applied).toHaveLength(0);
  });
  test('«Cambiar» corrige sobre lo que contó: no se pierde nada ni vuelve a preguntar la empresa (caso La Parada)', async () => {
    const seen: string[] = [];
    const parada = (t: string) => [{ ...item('La Parada', { interaction: /17:00/.test(t) ? 'Quedamos hoy a las 17:00' : 'Le escribí', outcome: /17:00/.test(t) ? 'meeting' : 'no_reply' }), candidates: [cand('p1', 'Paradox.night', 0.6)] }];
    const { ops, applied } = fakeOps({
      split: async (t) => { seen.push(t); return parada(t); },
      search: async () => [cand('p1', 'Paradox.night', 0.6)],
      placeIn: async (t) => (/almer[ií]a/i.test(t) ? { v: 'es|Andalucía|Almería', label: 'Andalucía › Almería' } : null),
      places: async () => [],
    });
    const a = await run(ops, { kind: 'text', text: 'He hablado con Vicente, dueño de La Parada en Almería. Le escribí.' });
    expect(a.replies[0].text).toContain('¿Cuál es «La Parada»?');
    const b = await run(ops, { kind: 'text', text: '0' }, a.state);
    expect(b.replies[0].text).toContain('📍 Andalucía › Almería'); // la ciudad, de lo que contó
    const c = await run(ops, { kind: 'button', id: 'change' }, b.state);
    const d = await run(ops, { kind: 'text', text: 'me ha contestado: hablamos hoy a las 17:00' }, c.state);
    expect(seen[1]).toContain('He hablado con Vicente'); // lo de antes sigue
    expect(seen[1]).toContain('hablamos hoy a las 17:00'); // con la corrección
    expect(d.replies[0].text).toContain('cita conseguida');
    expect(d.replies[0].text).not.toContain('¿Cuál es'); // «crear» se mantiene
    await run(ops, { kind: 'button', id: 'save' }, d.state);
    expect(applied[0][0]).toMatchObject({ accountId: null, create: 'La Parada', place: 'es|Andalucía|Almería', outcome: 'meeting' });
  });
  test('empresa nueva sin ciudad: la pregunta; «no sé» la deja sin ciudad', async () => {
    const { ops, applied } = fakeOps({
      split: async () => [{ ...item('Bar Nuevo'), candidates: [] }],
      search: async () => [], placeIn: async () => null,
      places: async (q) => (/roquetas/i.test(q) ? [{ v: 'es|Andalucía|Almería|Roquetas de Mar', label: 'Andalucía › Almería › Roquetas de Mar' }] : []),
    });
    const a = await run(ops, { kind: 'text', text: 'Bar Nuevo: bien' });
    const b = await run(ops, { kind: 'text', text: '0' }, a.state);
    expect(b.replies[0].text).toContain('¿Dónde está *Bar Nuevo*?');
    const c = await run(ops, { kind: 'text', text: 'Roquetas' }, b.state);
    expect(c.replies[0].text).toContain('📍 Andalucía › Almería › Roquetas de Mar');
    await run(ops, { kind: 'text', text: 'sí' }, c.state);
    expect(applied[0][0]).toMatchObject({ create: 'Bar Nuevo', place: 'es|Andalucía|Almería|Roquetas de Mar' });
    const e = await run(ops, { kind: 'text', text: 'no sé' }, b.state);
    expect(e.replies[0].text).not.toContain('📍');
  });
  test('la conversación pegada (formato de WhatsApp) se guarda literal en la interacción', async () => {
    const { ops, applied } = fakeOps();
    const text = 'Club Sol, le escribí:\n\n[19/11/26, 10:21:09] Cristian Alberto Sanchez: Buenos días Vicente!!\nHa pasado bastante tiempo\n[19/11/26, 10:40:00] Vicente: perfecto, hablamos a las 17:00';
    const a = await run(ops, { kind: 'text', text });
    await run(ops, { kind: 'button', id: 'save' }, a.state);
    const it = (applied[0][0] as { interaction: string }).interaction;
    expect(it).toContain('Conversación:\n[19/11/26, 10:21:09] Cristian Alberto Sanchez: Buenos días Vicente!!\nHa pasado bastante tiempo\n[19/11/26, 10:40:00] Vicente: perfecto, hablamos a las 17:00');
  });
  test('pegada a medias (escribió antes y WhatsApp solo pegó un mensaje): pide pegar primero y lo junta', async () => {
    const seen: string[] = [];
    const { ops, applied } = fakeOps({ split: async (t) => { seen.push(t); return [{ ...item('Havana'), candidates: [cand('h1', 'Havana', 1)] }]; } });
    const a = await run(ops, { kind: 'text', text: 'He estado hablando con José María de Havana, mira lo que le he puesto: [23/9/26, 14:04:38] Cristian: Buenas José María!' });
    expect(a.state.step).toBe('context');
    expect(a.replies[0].text).toContain('Pega primero los mensajes');
    expect(seen).toEqual([]);   // no se apunta nada aún
    const chat = '[23/9/26, 14:04:38] Cristian: Buenas José María!\n[25/9/26, 11:49:41] Jose Maria Havana: Buenas señor!\n[25/9/26, 11:49:56] Jose Maria Havana: si me quieres mandar y contar un poco';
    const b = await run(ops, { kind: 'text', text: chat }, a.state);
    expect(seen[0]).toContain('He estado hablando con José María de Havana');
    expect(seen[0]).toContain('Jose Maria Havana: Buenas señor!');
    await run(ops, { kind: 'button', id: 'save' }, b.state);
    expect((applied[0][0] as { interaction: string }).interaction).toContain('Conversación:\n[23/9/26, 14:04:38] Cristian: Buenas José María!\n[25/9/26, 11:49:41]');
  });
  test('un audio largo que dice «te paso…» por el medio no se queda esperando; «apúntalo» apunta lo contado', async () => {
    const { ops } = fakeOps();
    const long = `He estado con José María de Havana. ${'Le he contado lo de las pantallas y las fotos. '.repeat(20)}Me dijo que te paso los mensajes luego, pero lo importante es que quiere una demo.`;
    expect((await run(ops, { kind: 'audio', text: long })).state.step).toBe('confirm');
    const a = await run(ops, { kind: 'text', text: 'He hablado con Havana, ahora te paso los mensajes' });
    expect(a.replies[0].text).toContain('escribe «apúntalo»');
    expect((await run(ops, { kind: 'text', text: 'apúntalo' }, a.state)).state.step).toBe('confirm');
  });
  test('con muy poco («he estado hablando con X») pregunta de qué y junta la respuesta', async () => {
    const seen: string[] = [];
    const { ops } = fakeOps({ split: async (t) => { seen.push(t); return [{ ...item('Havana'), candidates: [cand('h1', 'Havana', 1)] }]; } });
    const a = await run(ops, { kind: 'text', text: 'Oye, he estado hablando con José María de Havana' });
    expect(a.state.step).toBe('context');
    expect(a.replies[0].text).toContain('¿Y qué te ha dicho José María de Havana?');
    expect(seen).toEqual([]);
    const b = await run(ops, { kind: 'audio', text: 'Que le encaja lo de las pantallas y quiere una demo el jueves' }, a.state);
    expect(b.state.step).toBe('confirm');
    expect(seen[0]).toBe('Oye, he estado hablando con José María de Havana\n\nQue le encaja lo de las pantallas y quiere una demo el jueves');
    // Con algo de contenido, directo al resumen.
    expect((await run(ops, { kind: 'text', text: 'He estado hablando con Juan de Havana y quiere una demo' })).state.step).toBe('confirm');
    expect((await run(ops, { kind: 'text', text: 'He hablado con Juan: le interesa' })).state.step).toBe('confirm');
  });
  test('«he cerrado Deep Delay: 70/30…» → el resumen enseña el acuerdo y al guardar dice que ya es cliente', async () => {
    const { ops, applied } = fakeOps({
      split: async () => [{ ...item('Deep Delay', { agreement: '70/30 para ellos si conseguimos marcas' }), candidates: [cand('d1', 'Deep Delay', 1)] }],
      apply: async (rows) => { applied.push(rows); return [{ accountId: 'd1', name: 'Deep Delay', ok: true, agreement: 'active' as const }]; },
    });
    const a = await run(ops, { kind: 'text', text: 'He cerrado Deep Delay: 70/30 para ellos si conseguimos marcas' });
    expect(a.replies[0].text).toContain('🤝 Cierre con acuerdo: 70/30');
    const b = await run(ops, { kind: 'button', id: 'save' }, a.state);
    expect(applied[0][0]).toMatchObject({ agreement: '70/30 para ellos si conseguimos marcas' });
    expect(b.replies[0].text).toContain('Deep Delay ya es cliente');
  });
  test('el audio se repite entero (no a los 55 segundos)', async () => {
    const { ops } = fakeOps();
    const long = 'palabra '.repeat(400).trim();
    expect((await run(ops, { kind: 'audio', text: long })).replies[0].text).toContain(long);
  });
  test('«ahora te paso los mensajes»: espera y junta lo que llegue después (pegado, reenviado o captura)', async () => {
    const seen: string[] = [];
    const { ops, applied } = fakeOps({ split: async (t) => { seen.push(t); return [{ ...item('Havana'), candidates: [cand('h1', 'Havana', 1)] }]; } });
    const a = await run(ops, { kind: 'text', text: 'He estado hablando con José María de Havana, ahora te paso los mensajes' });
    expect(a.state.step).toBe('context');
    expect(a.replies[0].text).toContain('Pásame la conversación');
    // Reenviados: se juntan sin preguntar de qué empresa (ya lo dijo) y al «listo» se apunta todo junto.
    const b = await run(ops, { kind: 'text', text: 'Buenas señor!', forwarded: true }, a.state);
    expect(b.replies[0].text).toContain('escribe «listo»');
    const c = await run(ops, { kind: 'text', text: 'si me quieres mandar y contar un poco', forwarded: true }, b.state);
    expect(c.replies).toEqual([]);
    const d = await run(ops, { kind: 'text', text: 'listo' }, c.state);
    expect(d.state.step).toBe('confirm');
    expect(seen[0]).toBe('He estado hablando con José María de Havana, ahora te paso los mensajes');
    await run(ops, { kind: 'button', id: 'save' }, d.state);
    expect((applied[0][0] as { interaction: string }).interaction).toContain('Conversación:\nBuenas señor!\nsi me quieres mandar y contar un poco');
    // Captura: igual.
    const e = await run(ops, { kind: 'image', lines: ['Nosotros: hola', 'Ellos (Havana): buenas'], contact: 'Havana', caption: '', channel: 'whatsapp', ready: true }, a.state);
    expect(e.state).toMatchObject({ step: 'forward', intro: expect.stringContaining('José María') });
    // Pegado de una vez: directo.
    const f = await run(ops, { kind: 'text', text: '[25/9/26, 11:49:41] Jose Maria Havana: Buenas señor!\n[25/9/26, 11:49:42] Jose Maria Havana: encantado' }, a.state);
    expect(f.state.step).toBe('confirm');
    expect(seen.at(-1)).toContain('ahora te paso los mensajes\n\n[25/9/26');
  });
  test('la conversación que faltaba, después del resumen: se añade, no es una corrección', async () => {
    const seen: string[] = [];
    const { ops } = fakeOps({ split: async (t) => { seen.push(t); return [{ ...item('Club Sol'), candidates: [cand('a1', 'Club Sol', 1)] }]; } });
    const a = await run(ops, { kind: 'text', text: 'He estado en Club Sol con Marta' });
    await run(ops, { kind: 'text', text: '[1/10/26, 10:00] Yo: hola\n[1/10/26, 10:05] Marta: hola!' }, a.state);
    expect(seen[1]).not.toContain('Corrección');
    expect(seen[1]).toContain('Marta: hola!');
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
  test('captura de una conversación: la lee, busca la empresa por el nombre de arriba y guarda las frases tal cual', async () => {
    const { ops, applied } = fakeOps({ search: async (q) => (/sol/i.test(q) ? [cand('a1', 'Club Sol', 1)] : []) });
    const lines = ['Nosotros · 10:02: ¿Os paso la propuesta?', 'Cliente (Club Sol) · 10:15: Sí, pásamela'];
    const a = await run(ops, { kind: 'image', lines, contact: 'Club Sol', caption: '', channel: 'whatsapp', ready: true });
    expect(a.replies[0].text).toContain('📸 He leído 2 mensajes con Club Sol');
    expect(a.replies[1].text).toContain('WhatsApp · contestó');
    await run(ops, { kind: 'button', id: 'save' }, a.state);
    expect(applied[0][0]).toMatchObject({ accountId: 'a1', channel: 'whatsapp', outcome: 'replied', interaction: lines.join('\n') });
  });
  test('captura: el pie de foto manda sobre el nombre de arriba; varias capturas se juntan; Instagram como canal', async () => {
    const { ops, applied } = fakeOps({ search: async (q) => (/salamandra/i.test(q) ? [cand('s1', 'Grupo Salamandra', 1)] : []) });
    const a = await run(ops, { kind: 'image', lines: ['Cliente (Marta): Hola'], contact: 'Marta', caption: '', channel: 'instagram', ready: true });
    expect(a.replies.at(-1)!.text).toContain('No encuentro «Marta»');
    const b = await run(ops, { kind: 'image', lines: ['Nosotros: ¿Os viene el jueves?'], contact: 'Marta', caption: '', channel: 'instagram', ready: true }, a.state);
    expect(b.replies).toHaveLength(0);
    const c = await run(ops, { kind: 'text', text: 'Salamandra' }, b.state);
    await run(ops, { kind: 'text', text: 'sí' }, c.state);
    expect(applied[0][0]).toMatchObject({ accountId: 's1', channel: 'instagram', interaction: 'Cliente (Marta): Hola\nNosotros: ¿Os viene el jueves?' });
    const d = await run(ops, { kind: 'image', lines: ['Cliente: Vale'], contact: 'Marta', caption: 'Grupo Salamandra', channel: 'whatsapp', ready: true });
    expect(d.replies[1].text).toContain('Grupo Salamandra');
  });
  test('captura que no es una conversación, o sin lector: lo dice', async () => {
    const { ops } = fakeOps();
    expect((await run(ops, { kind: 'image', lines: null, contact: '', caption: '', channel: 'other', ready: true })).replies[0].text).toContain('No veo una conversación');
    expect((await run(ops, { kind: 'image', lines: null, contact: '', caption: '', channel: 'other', ready: false })).replies[0].text).toContain('Aún no puedo leer capturas');
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
      { from: '34699000111', id: 'm5', timestamp: '1762164000', type: 'image', image: { id: 'media-2', mime_type: 'image/jpeg', caption: 'Club Sol' } },
    ] } }] }] };
    const { inbound } = parseWebhook(body);
    expect(inbound.map((m) => [m.kind, m.forwarded, m.mediaId, m.buttonId])).toEqual([['text', true, null, null], ['audio', false, 'media-1', null], ['button', false, null, 'save'], ['image', false, 'media-2', null]]);
    expect(inbound[3].text).toBe('Club Sol');
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
  const typed: string[] = [];
  const wa = {
    async sendTemplate(...a: unknown[]) { templates.push(a); return { id: null }; },
    async sendText(_p: string, _to: string, text: string) { sent.push({ text }); return { id: null }; },
    async sendButtons(_p: string, _to: string, text: string, b: Array<{ id: string }>) { sent.push({ text, buttons: b.map((x) => x.id) }); return { id: null }; },
    async media() { return { bytes: new Uint8Array([1]), type: 'audio/ogg' }; },
    async typing(_p: string, id: string) { typed.push(id); },
  };
  const deps = () => ({
    db: demoAssistantDb(), wa, transcribe: fixtureTranscriber, now: new Date(),
    actAs: async (t: string, u: string) => { const tenant = await publicRepository().resolveTenantBySlug('enjoy'); return tenant && t === ENJOY ? contextAs(tenant, u) : null; },
  });
  const msg = (id: string, over: Partial<Inbound>): Inbound => ({ phoneId: '123', from: '+34699000111', text: '', at: new Date(), id, kind: 'text', ...over });
  beforeEach(() => {
    resetDemoDb(); resetDemoAssistant(); demoReminderLog().clear(); sent.length = 0; templates.length = 0; typed.length = 0;
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
    // Nada más llegar: «escribiendo…» y, como es un audio, «Escuchando tu audio…» antes de ponerse.
    expect(typed).toEqual(['w1', 'w1']);
    expect(sent[0].text).toContain('Escuchando tu audio');
    expect(sent[1].text).toContain('He entendido');
    // El audio de ejemplo no lleva «Sitio: …» (lo que separa la IA de pruebas): no saca nada y lo dice.
    expect(sent[2].text).toContain('No he sacado nada');
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

  test('una captura de la conversación → la lee → Guardar → la conversación literal queda en Club Sol', async () => {
    const member = { tenantId: ENJOY, userId: REP };
    const { fixtureScreenshotReader } = await import('./screenshot');
    await processAssistant({ ...deps(), screenshot: fixtureScreenshotReader }, '123', member, msg('i1', { kind: 'image', mediaId: 'media-2', text: 'Club Sol' }));
    expect(sent[0].text).toContain('Leyendo tu captura');
    expect(sent[1].text).toContain('📸 He leído 2 mensajes con Sala Marina');
    expect(sent[2].buttons).toEqual(['save', 'change']);
    await processAssistant(deps(), '123', member, msg('i2', { kind: 'button', buttonId: 'save', text: 'Guardar' }));
    expect(sent.at(-1)?.text).toBe('✅ Guardado en Club Sol.');
    const sol = demoDb().account.find((a) => a.tenant_id === ENJOY && a.name === 'Club Sol')!;
    const act = demoDb().crm_activity.find((a) => a.account_id === sol.id && /Nosotros · 10:02: Hola Marta/.test(a.note ?? '') && /Cliente \(Sala Marina\) · 10:15: Sí, pásamela/.test(a.note ?? ''));
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

describe('un número para todas las empresas (docs/ASSISTANT.md)', () => {
  const ENJOY = '00000000-0000-4000-8000-000000000e01';
  const ALT = '00000000-0000-4000-8000-000000000a01';
  const REP = '11111111-1111-4111-8111-111111111111';
  const HUB = '999000111';
  const sent: Array<{ text: string; buttons?: string[] }> = [];
  const templates: unknown[][] = [];
  const wa = {
    async sendTemplate(...a: unknown[]) { templates.push(a); return { id: null }; },
    async sendText(_p: string, _to: string, text: string) { sent.push({ text }); return { id: null }; },
    async sendButtons(_p: string, _to: string, text: string, b: Array<{ id: string }>) { sent.push({ text, buttons: b.map((x) => x.id) }); return { id: null }; },
    async media() { return { bytes: new Uint8Array([1]), type: 'audio/ogg' }; },
  };
  const actAs = async (t: string, u: string) => {
    const slug = demoDb().tenant.find((x) => x.id === t)?.slug;
    const tenant = slug ? await publicRepository().resolveTenantBySlug(slug) : null;
    return tenant ? contextAs(tenant, u) : null;
  };
  const deps = (now = new Date('2026-11-03T09:00:00Z')) => ({ db: demoAssistantDb(), wa, transcribe: fixtureTranscriber, now, actAs });
  const msg = (id: string, over: Partial<Inbound>): Inbound => ({ phoneId: HUB, from: '+34699000111', text: '', at: new Date(), id, kind: 'text', ...over });
  const members = () => demoAssistantDb().membersByPhone('34699000111');
  beforeEach(() => {
    resetDemoDb(); resetDemoAssistant(); demoReminderLog().clear(); sent.length = 0; templates.length = 0;
    process.env.AI_RESEARCH_FIXTURE = '1';
    const rep = demoDb().users.find((u) => u.id === REP)!;
    rep.phone = '699 00 01 11';
    rep.memberships.push({ tenant_id: ALT, role: 'rep' });
  });

  test('la configuración: el número y las plantillas del recordatorio', () => {
    process.env.ASSISTANT_WHATSAPP_PHONE_ID = HUB;
    expect(hubConfig()).toEqual({ phoneId: HUB, templates: { es: 'equipo_recordatorio_es', en: 'equipo_recordatorio_en', fr: 'equipo_recordatorio_fr' } });
    expect(parseTemplates('es=asistente_hoy_es, fr=asistente_fr, xx=nada, en=mal nombre').es).toBe('asistente_hoy_es');
    delete process.env.ASSISTANT_WHATSAPP_PHONE_ID;
    expect(hubConfig()).toBeNull();
  });

  test('en varias empresas: pregunta al empezar, guarda lo que mandó, y al elegir lo apunta en esa', async () => {
    const ms = await members();
    expect(new Set(ms.map((m) => m.tenantId))).toEqual(new Set([ENJOY, ALT]));
    // «Hola»: solo la pregunta, con un botón por empresa.
    expect(await processHub(deps(), HUB, ms, msg('h1', { text: 'Hola' }))).toBe('asked');
    expect(sent[0].text).toContain('¿Para qué empresa trabajas hoy?');
    expect(sent[0].buttons).toEqual(expect.arrayContaining([`${HUB_PICK}${ENJOY}`, `${HUB_PICK}${ALT}`]));
    // Cuenta algo sin haber elegido: se guarda y no se repite la pregunta enseguida.
    expect(await processHub(deps(), HUB, ms, msg('h2', { text: 'Club Sol: hablé con Marta, quieren pantalla los viernes' }))).toBe('asked');
    expect(sent).toHaveLength(1);
    // Elige Enjoy: le confirma y apunta lo pendiente en Enjoy (el resumen con Guardar / Cambiar).
    expect(await processHub(deps(), HUB, ms, msg('h3', { kind: 'button', buttonId: `${HUB_PICK}${ENJOY}`, text: 'Enjoy the Club' }))).toBe('picked');
    expect(sent[1].text).toContain('hoy con *Enjoy the Club*');
    expect(sent[2].text).toContain('*Club Sol*');
    expect(sent[2].buttons).toEqual(['save', 'change']);
    // Lo siguiente del día va directo a Enjoy; «Guardar» lo guarda allí.
    await processHub(deps(), HUB, ms, msg('h4', { kind: 'button', buttonId: 'save', text: 'Guardar' }));
    expect(sent.at(-1)?.text).toBe('✅ Guardado en Club Sol.');
    const sol = demoDb().account.find((a) => a.tenant_id === ENJOY && a.name === 'Club Sol')!;
    expect(demoDb().crm_activity.some((a) => a.account_id === sol.id && a.user_id === REP && /Marta/.test(a.note ?? ''))).toBe(true);
  });

  test('«empresa» vuelve a preguntar; con el número también se elige; al día siguiente pregunta otra vez', async () => {
    const ms = await members();
    await processHub(deps(), HUB, ms, msg('e1', { kind: 'button', buttonId: `${HUB_PICK}${ENJOY}`, text: 'Enjoy' }));
    expect(await processHub(deps(), HUB, ms, msg('e2', { text: 'empresa' }))).toBe('asked');
    expect(sent.at(-1)?.text).toContain('¿Para qué empresa trabajas hoy?');
    // Por orden alfabético: «Enjoy the Club» es la 1 y la del re-tema la 2.
    const names = await demoAssistantDb().tenantNames([ENJOY, ALT]);
    const order = [ENJOY, ALT].sort((a, b) => names[a].localeCompare(names[b], 'es'));
    expect(await processHub(deps(), HUB, ms, msg('e3', { text: '2' }))).toBe('picked');
    expect((await demoAssistantDb().session(REP))?.tenantId).toBe(order[1]);
    const s = await demoAssistantDb().session(REP);
    expect(chosenToday(s, [ENJOY, ALT], new Date('2026-11-03T20:00:00Z'), 'Europe/Madrid')).toBe(true);
    expect(chosenToday(s, [ENJOY, ALT], new Date('2026-11-04T08:00:00Z'), 'Europe/Madrid')).toBe(false);
    expect(await processHub(deps(new Date('2026-11-04T08:00:00Z')), HUB, ms, msg('e4', { text: 'Club Sol: llamé a Marta' }))).toBe('asked');
  });

  test('en una sola empresa no pregunta; un número desconocido no pasa', async () => {
    demoDb().users.find((u) => u.id === REP)!.memberships = [{ tenant_id: ENJOY, role: 'rep' }];
    expect(await processHub(deps(), HUB, await members(), msg('s1', { text: 'Club Sol: hablé con Marta' }))).toBe('handled');
    expect(sent[0].text).toContain('*Club Sol*');
    expect(await processHub(deps(), HUB, [], msg('s2', { text: 'hola' }))).toBe('not_member');
  });

  test('el recordatorio sale del número del asistente, uno al día por persona, y deja elegida esa empresa', async () => {
    demoDb().users.find((u) => u.id === REP)!.wa_reminders = true;
    const morning = new Date('2026-11-03T09:30:00Z');
    const hub = { phoneId: HUB, templates: { es: 'asistente_es', en: 'asistente_en', fr: 'asistente_fr' } };
    const rdeps = (now: Date) => ({ db: demoReminderDb(), assistant: demoAssistantDb(), wa, now, settings: async () => null, actAs, hub });
    const r = await runReminders(rdeps(morning));
    expect(r.sent).toBe(1);
    const [phoneId, , name] = templates[0] as [string, string, string];
    expect([phoneId, name]).toEqual([HUB, 'asistente_es']);
    expect((await runReminders(rdeps(new Date('2026-11-03T09:40:00Z')))).sent).toBe(0);
    const s = await demoAssistantDb().session(REP);
    expect(s?.tenantId).toBeTruthy();
    expect(chosenToday(s, [ENJOY, ALT], morning, 'Europe/Madrid')).toBe(true);
  });

  test('el webhook entiende la elección de una lista', () => {
    const { inbound } = parseWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: HUB }, messages: [{ from: '34699000111', id: 'l1', timestamp: '1', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: `${HUB_PICK}${ALT}`, title: 'Otra' } } }] } }] }] });
    expect(inbound[0]).toMatchObject({ kind: 'button', buttonId: `${HUB_PICK}${ALT}`, text: 'Otra' });
  });
});

describe('lector de capturas', () => {
  test('limpia lo que devuelve Claude y lo escribe con quién lo dijo', async () => {
    const { cleanShot, shotText } = await import('./screenshot');
    const s = cleanShot({ isChat: true, contact: 'Club Sol', channel: 'whatsapp', lines: [{ from: 'us', text: ' Hola ', time: '10:02' }, { from: 'x', text: 'Qué tal', time: '' }, { from: 'us', text: '', time: '' }] })!;
    expect(s.lines).toHaveLength(2);
    expect(shotText(s, { us: 'Nosotros', them: 'Cliente' })).toEqual(['Nosotros · 10:02: Hola', 'Cliente (Club Sol): Qué tal']);
    expect(cleanShot({ isChat: true, lines: [] })!.isChat).toBe(false);
    expect(cleanShot({ isChat: true, channel: 'fax', lines: [{ from: 'us', text: 'a' }] })!.channel).toBe('other');
  });
});
