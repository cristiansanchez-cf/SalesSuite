import { describe, expect, it } from 'vitest';
import { senderOffDomain, leadSetupSteps, readiness, requiredProgress } from './setup-steps';
import type { LeadSettings } from './types';

const base: LeadSettings = {
  tenantId: 't', enabled: false, brand: 'acme', allowedOrigins: [], fromEmail: null, fromName: null, replyTo: null, signerName: null,
  notifyEmails: [], bookingUrl: null, videoUrl: null, whatsappPhoneId: null, whatsappEnabled: false, whatsappTemplates: {}, timezone: 'Europe/Madrid',
  sendFromHour: 8, sendToHour: 22, holidays: [],
};
const run = (s: Partial<LeadSettings>, o: Partial<{ received: boolean; demo: boolean; platformMail: boolean; platformWa: boolean; domains: { name: string; status: string }[] | null }> = {}) =>
  Object.fromEntries(leadSetupSteps({ settings: { ...base, ...s }, domains: o.domains ?? null, received: o.received ?? false, demo: o.demo ?? false, platformMail: o.platformMail ?? false, platformWa: o.platformWa ?? false }).map((x) => [x.key, x]));

describe('pasos de los leads entrantes', () => {
  it('un espacio nuevo: todo sin empezar salvo privacidad, que ya lleva valores', () => {
    const s = run({});
    expect(s.connect.status).toBe('todo');
    expect(s.email.status).toBe('todo');
    expect(s.messages.status).toBe('todo');
    expect(s.whatsapp.status).toBe('todo');
    expect(s.extras.status).toBe('todo');
    expect(s.privacy.status).toBe('done');
    expect(s.connect.missing).toEqual(['lead']);
    expect(s.email.missing).toEqual(['resend', 'sender', 'notify']);
  });

  it('conectar: a medias con webs puestas, hecho cuando llega un lead', () => {
    expect(run({ allowedOrigins: ['https://a.com'] }).connect.status).toBe('partial');
    expect(run({ allowedOrigins: ['https://a.com'] }, { received: true }).connect.status).toBe('done');
  });

  it('email con la cuenta de la plataforma: hecho con quién contesta y a quién avisar', () => {
    const s = run({ replyTo: 'hola@a.com', notifyEmails: ['yo@a.com'] }, { platformMail: true });
    expect(s.email.status).toBe('done');
    expect(s.email.missing).toEqual([]);
  });

  it('email con su propia cuenta: hace falta el dominio verificado del remitente', () => {
    const own = { resendKeyHint: 're_…ab', fromEmail: 'hola@a.com', replyTo: 'hola@a.com', notifyEmails: ['yo@a.com'] };
    expect(run(own, { domains: [{ name: 'a.com', status: 'pending' }] }).email).toMatchObject({ status: 'partial', missing: ['resend'] });
    expect(run(own, { domains: [{ name: 'a.com', status: 'verified' }] }).email.status).toBe('done');
    expect(readiness({ ...base, ...own }, [{ name: 'a.com', status: 'verified' }], { demo: false, platformMail: false }).ready).toBe(true);
  });

  it('email con una clave que solo envía (no se ven los dominios): vale con el remitente', () => {
    const own = { resendKeyHint: 're_…ab', fromEmail: 'hola@a.com', replyTo: 'hola@a.com', notifyEmails: ['yo@a.com'] };
    expect(run(own, { domains: null }).email).toMatchObject({ status: 'done', missing: [] });
    expect(run({ ...own, fromEmail: null }, { domains: null }).email.missing).toEqual(['resend', 'sender']);
  });

  it('remitente: tiene que ser de un dominio de su cuenta (o de un subdominio)', () => {
    const doms = [{ name: 'pending.com', status: 'pending' }, { name: 'correo.cofundo.io', status: 'verified' }];
    expect(senderOffDomain('hello@cofundo.io', doms)).toBe('correo.cofundo.io');
    expect(senderOffDomain('hello@correo.cofundo.io', doms)).toBeNull();
    expect(senderOffDomain('hello@x.pending.com', doms)).toBeNull();
    expect(senderOffDomain('hello@gmail.com', null)).toBeNull();
  });

  it('email con el remitente fuera del dominio verificado: lo dice', () => {
    const own = { resendKeyHint: 're_…ab', fromEmail: 'hola@gmail.com', replyTo: 'hola@a.com', notifyEmails: ['yo@a.com'] };
    expect(run(own, { domains: [{ name: 'a.com', status: 'verified' }] }).email).toMatchObject({ status: 'partial', missing: ['fromDomain'] });
  });

  it('mensajes: a medias con solo la firma; hecho con textos y firma', () => {
    expect(run({ emailSignature: { name: 'Ana' } }).messages).toMatchObject({ status: 'partial', missing: ['texts'] });
    expect(run({ emailSignature: { name: 'Ana' }, templates: { es: { subject: 'Hola' } } as LeadSettings['templates'] }).messages.status).toBe('done');
  });

  it('WhatsApp: dice qué falta y solo está hecho con token, número y envío activado', () => {
    const p = run({ whatsappPhoneId: '123' });
    expect(p.whatsapp.status).toBe('partial');
    expect(p.whatsapp.missing).toEqual(['waToken', 'waTemplates', 'waOn']);
    expect(run({ whatsappPhoneId: '123', whatsappEnabled: true }, { platformWa: true }).whatsapp).toMatchObject({ status: 'done', missing: [] });
  });

  it('extras: hecho con un vídeo general o uno por tipo', () => {
    expect(run({ videoUrl: 'https://v.com' }).extras.status).toBe('done');
    expect(run({ media: { venue: { es: { booking: 'https://cal.com/x' } } } as LeadSettings['media'] }).extras.status).toBe('done');
  });

  it('progreso: cuenta solo los obligatorios (conectar y email)', () => {
    const steps = leadSetupSteps({ settings: { ...base, replyTo: 'a@a.com', notifyEmails: ['a@a.com'] }, domains: null, received: false, demo: false, platformMail: true, platformWa: false });
    expect(requiredProgress(steps)).toEqual({ done: 1, total: 2 });
  });
});
