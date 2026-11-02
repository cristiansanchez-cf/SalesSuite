import { describe, expect, test } from 'vitest';
import { addressOf, forwarded, freshText, htmlToText, noteOf, readEmail, tokenFrom } from './parse';
import { signSvix, verifySvix } from './svix';

const ME = { own: ['cristian.sanchez@enjoytheclub.es'], internal: ['enjoytheclub.es'], inbox: 'in.cofundo.io' };
const TOKEN = 'abcdefghij0123456789wxyz';
const AT = '2026-11-03T10:00:00.000Z';

describe('direcciones', () => {
  test('addressOf y el token de la dirección de apuntar', () => {
    expect(addressOf('Laura Gómez <Laura@SalaX.es>')).toBe('laura@salax.es');
    expect(addressOf('laura@salax.es')).toBe('laura@salax.es');
    expect(addressOf('Sin email')).toBeNull();
    expect(tokenFrom(['Laura <laura@salax.es>', `apuntar-${TOKEN}@in.cofundo.io`], 'in.cofundo.io')).toBe(TOKEN);
    expect(tokenFrom([`apuntar-${TOKEN}@otro.io`], 'in.cofundo.io')).toBeNull();
    expect(tokenFrom(['apuntar-corto@in.cofundo.io'], 'in.cofundo.io')).toBeNull();
  });
});

describe('leer el correo', () => {
  test('Outlook: RV de un correo del cliente → entrante, el cliente al otro lado, sin la firma citada', () => {
    const text = 'Te paso esto, Laura de Sala X.\n\n________________________________\nDe: Laura Gómez <laura@salax.es>\nEnviado: lunes, 3 de noviembre de 2026 9:40\nPara: Cristian Sánchez <cristian.sanchez@enjoytheclub.es>\nAsunto: Pantalla para el sábado\n\nHola Cristian, ¿lo podemos probar este sábado? Abrimos a las 23:00.\n\nEl lun, 3 nov 2026 a las 9:00, Cristian escribió:\n> Hola Laura';
    const r = readEmail({ from: 'Cristian <cristian.sanchez@enjoytheclub.es>', to: [`apuntar-${TOKEN}@in.cofundo.io`], cc: [], subject: 'RV: Pantalla para el sábado', text, date: AT }, ME);
    expect(r).toMatchObject({ direction: 'in', counterparts: ['laura@salax.es'], subject: 'Pantalla para el sábado', forwarded: true });
    expect(r.body).toBe('Hola Cristian, ¿lo podemos probar este sábado? Abrimos a las 23:00.');
    expect(noteOf(r)).toBe('«Pantalla para el sábado»\n\nHola Cristian, ¿lo podemos probar este sábado? Abrimos a las 23:00.');
  });

  test('Gmail: Fwd de un correo que mandó la persona → saliente, al destinatario', () => {
    const text = '---------- Forwarded message ---------\nFrom: Cristian Sánchez <cristian.sanchez@enjoytheclub.es>\nDate: Mon, 3 Nov 2026 at 09:30\nSubject: Propuesta Enjoy\nTo: <marta@grupo-salamandra.com>, Pepe <pepe@enjoytheclub.es>\n\nHola Marta, te paso la propuesta.\n';
    const r = readEmail({ from: 'cristian.sanchez@enjoytheclub.es', to: [`apuntar-${TOKEN}@in.cofundo.io`], cc: [], subject: 'Fwd: Propuesta Enjoy', text, date: AT }, ME);
    expect(r).toMatchObject({ direction: 'out', counterparts: ['marta@grupo-salamandra.com'], subject: 'Propuesta Enjoy', forwarded: true, body: 'Hola Marta, te paso la propuesta.' });
  });

  test('en copia oculta: saliente al destinatario (sin compañeros ni la dirección de apuntar)', () => {
    const r = readEmail({ from: 'Cristian <cristian.sanchez@enjoytheclub.es>', to: ['marta@grupo-salamandra.com'], cc: ['pepe@enjoytheclub.es', `apuntar-${TOKEN}@in.cofundo.io`],
      subject: 'Re: Propuesta', text: 'Perfecto, el jueves a las 12.\n\nOn Mon, 3 Nov 2026, Marta wrote:\n> ¿Quedamos?', date: AT }, ME);
    expect(r).toMatchObject({ direction: 'out', counterparts: ['marta@grupo-salamandra.com'], subject: 'Propuesta', forwarded: false, body: 'Perfecto, el jueves a las 12.' });
  });

  test('redirigido por una regla (llega con el remitente original) → entrante', () => {
    const r = readEmail({ from: 'Marta <marta@grupo-salamandra.com>', to: ['cristian.sanchez@enjoytheclub.es'], cc: [], subject: 'Dudas', text: '¿Cuánto cuesta?', date: AT }, ME);
    expect(r).toMatchObject({ direction: 'in', counterparts: ['marta@grupo-salamandra.com'], body: '¿Cuánto cuesta?' });
  });

  test('un dominio gratuito (gmail) nunca cuenta como «de la empresa»', () => {
    const r = readEmail({ from: 'yo@gmail.com', to: ['cliente@gmail.com'], cc: [], subject: 'Hola', text: 'x', date: AT }, { own: ['yo@gmail.com'], internal: ['gmail.com'], inbox: null });
    expect(r.counterparts).toEqual(['cliente@gmail.com']);
  });

  test('forwarded: sin cabecera del original no inventa remitente', () => {
    expect(forwarded('Fwd: algo', 'texto sin cabeceras')).toBeNull();
    expect(forwarded('Hola', 'nada que ver')).toBeNull();
  });

  test('freshText y htmlToText', () => {
    expect(freshText('Nuevo\n\n-----Original Message-----\nFrom: x')).toBe('Nuevo');
    expect(htmlToText('<p>Hola&nbsp;<b>Laura</b></p><div>Adiós</div>')).toBe('Hola Laura\nAdiós');
  });
});

describe('firma de Resend (Svix)', () => {
  const secret = `whsec_${Buffer.from('secreto-de-prueba').toString('base64')}`;
  const now = 1_762_164_000_000;
  const ts = String(now / 1000);
  test('válida, cambiada o vieja', () => {
    const body = '{"type":"email.received"}';
    const sig = `v1,${signSvix(secret, 'msg_1', ts, body)}`;
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: sig }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,otra ${sig}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: sig }, `${body} `, now)).toBe(false);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: sig }, body, now + 10 * 60_000)).toBe(false);
    expect(verifySvix('', { id: 'msg_1', timestamp: ts, signature: sig }, body, now)).toBe(false);
  });
});

// ---------------------------------------------------------------- de punta a punta (memoria)
import { beforeEach } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';
import { demoInboxServerDb, demoInboxStore, demoInboxUserDb, resetDemoInbox } from './db-demo';
import { processReceived, type FullEmail, type ProcessDeps } from './process';
import { createInboxService } from './service';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ADMIN = '22222222-2222-4222-8222-222222222222';
describe('correos al CRM (memoria)', () => {
  const mails = new Map<string, FullEmail>();
  const deps = (): ProcessDeps => ({
    db: demoInboxServerDb(), fetchEmail: async (id) => mails.get(id) ?? null, leads: null, inboxDomain: 'in.test', now: new Date(AT),
    actAs: async (t, u) => { const tenant = await publicRepository().resolveTenantBySlug('enjoy'); return tenant && t === ENJOY ? contextAs(tenant, u) : null; },
  });
  const ev = (id: string, to: string[], subject = 'Hola') => ({ email_id: id, created_at: AT, from: 'admin@enjoy.test', to, message_id: `<${id}@x>`, subject });
  let token = '';
  let accountId = '';
  beforeEach(async () => {
    resetDemoDb(); resetDemoInbox(); mails.clear();
    token = await demoInboxUserDb(ADMIN).myToken(ENJOY);
    const acc = demoDb().account.find((a) => a.tenant_id === ENJOY)!;
    acc.email = 'info@salax-demo.es';
    accountId = acc.id;
  });

  test('reenviado de un cliente conocido → interacción por email «contestó» en su empresa', async () => {
    mails.set('e1', { from: 'admin@enjoy.test', to: [`apuntar-${token}@in.test`], cc: [], subject: 'RV: Precio', date: AT, messageId: '<e1@x>',
      text: '________________________________\nDe: Laura <info@salax-demo.es>\nEnviado: lunes\nAsunto: Precio\n\n¿Cuánto cuesta al mes?' });
    const r = await processReceived(deps(), ev('e1', [`apuntar-${token}@in.test`], 'RV: Precio'));
    expect(r).toMatchObject({ status: 'logged', accountId });
    const act = demoDb().crm_activity.find((a) => a.account_id === accountId && a.channel === 'email');
    expect(act).toMatchObject({ outcome: 'replied', user_id: ADMIN });
    expect(act?.note).toContain('¿Cuánto cuesta al mes?');
    // Resend reintenta: no se apunta dos veces.
    expect((await processReceived(deps(), ev('e1', [`apuntar-${token}@in.test`]))).status).toBe('duplicate');
  });

  test('sin empresa → queda en su lista; al elegir la empresa se apunta', async () => {
    mails.set('e2', { from: 'admin@enjoy.test', to: ['nadie@desconocido-demo.es'], cc: [`apuntar-${token}@in.test`], subject: 'Propuesta', date: AT, messageId: '<e2@x>', text: 'Te paso la propuesta.' });
    expect((await processReceived(deps(), ev('e2', ['nadie@desconocido-demo.es'], 'Propuesta'))).status).toBe('unknown_address');
    const r = await processReceived(deps(), { ...ev('e2', ['nadie@desconocido-demo.es'], 'Propuesta'), cc: [`apuntar-${token}@in.test`] });
    expect(r.status).toBe('unmatched');
    const item = demoInboxStore().emails[0]!;
    expect(item).toMatchObject({ direction: 'out', counterpart: 'nadie@desconocido-demo.es', status: 'unmatched' });
    const tenant = (await publicRepository().resolveTenantBySlug('enjoy'))!;
    const svc = createInboxService(demoInboxUserDb(ADMIN), (await contextAs(tenant, ADMIN))!, 'in.test');
    expect(await svc.address()).toBe(`apuntar-${token}@in.test`);
    await svc.assign(item.id, accountId);
    expect(demoInboxStore().emails[0]).toMatchObject({ status: 'logged', accountId });
    expect(demoDb().crm_activity.some((a) => a.account_id === accountId && a.channel === 'email' && a.outcome === 'no_reply')).toBe(true);
    await expect(svc.assign(item.id, accountId)).rejects.toThrow();
  });

  test('correo entre compañeros: no se apunta; dirección de otro: nada', async () => {
    mails.set('e3', { from: 'admin@enjoy.test', to: ['rep@enjoy.test'], cc: [`apuntar-${token}@in.test`], subject: 'Interno', date: AT, messageId: '<e3@x>', text: 'Mañana vamos.' });
    const r = await processReceived(deps(), { ...ev('e3', ['rep@enjoy.test'], 'Interno'), cc: [`apuntar-${token}@in.test`] });
    expect(r.status).toBe('ignored');
    expect((await processReceived(deps(), ev('e4', ['apuntar-zzzzzzzzzzzzzzzzzzzzzzzz@in.test']))).status).toBe('unknown_address');
  });
});
