import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminContext } from '../admin/auth';
import { demoLeadsDb, resetDemoLeads } from './db-demo';
import { resendDomainDetail, resendDomains, resendVerifyDomain } from './resend-key';
import { createLeadsService } from './service';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const admin = (tenantId: string, role = 'admin') => ({ mode: 'demo', session: { tenantId, role, userId: 'u1', email: 'admin@acme.test' } }) as unknown as AdminContext;
const fakeFetch = (routes: Record<string, { status?: number; body: unknown }>, calls: string[] = []) =>
  (async (u: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${u}`);
    const r = routes[u];
    return new Response(JSON.stringify(r?.body ?? {}), { status: r ? r.status ?? 200 : 404 });
  }) as unknown as typeof fetch;

describe('Resend: dominios y registros DNS', () => {
  it('la lista trae el id para pedir el detalle', async () => {
    const f = fakeFetch({ 'https://api.resend.com/domains': { body: { data: [{ id: 'd1', name: 'mail.acme.com', status: 'pending' }] } } });
    expect(await resendDomains('re_x', f)).toEqual([{ id: 'd1', name: 'mail.acme.com', status: 'pending' }]);
  });

  it('el detalle devuelve solo SPF y DKIM, con su estado', async () => {
    const f = fakeFetch({ 'https://api.resend.com/domains/d1': { body: {
      id: 'd1', name: 'mail.acme.com', status: 'pending', records: [
        { record: 'SPF', type: 'MX', name: 'send.mail', value: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10, ttl: 'Auto', status: 'pending' },
        { record: 'SPF', type: 'TXT', name: 'send.mail', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'verified' },
        { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.mail', value: 'p=MIG…', ttl: 'Auto', status: 'verified' },
        { record: 'Receiving', type: 'MX', name: 'mail', value: 'inbound-smtp.eu-west-1.amazonaws.com', priority: 10, ttl: 'Auto', status: 'not_started' },
      ],
    } } });
    const d = await resendDomainDetail('re_x', 'd1', f);
    expect(d?.records.map((r) => `${r.record}/${r.type}/${r.status}`)).toEqual(['SPF/MX/pending', 'SPF/TXT/verified', 'DKIM/TXT/verified']);
    expect(d?.records[0]).toMatchObject({ name: 'send.mail', priority: 10 });
  });

  it('no llama con un id raro; «comprobar» hace POST a verify', async () => {
    const calls: string[] = [];
    const f = fakeFetch({ 'https://api.resend.com/domains/d1/verify': { body: { object: 'domain', id: 'd1' } } }, calls);
    expect(await resendDomainDetail('re_x', '../keys', f)).toBeNull();
    expect(await resendVerifyDomain('re_x', 'd1', f)).toBe(true);
    expect(calls).toEqual(['POST https://api.resend.com/domains/d1/verify']);
  });
});

describe('guardar el remitente y los avisos', () => {
  beforeEach(() => resetDemoLeads());

  it('guarda solo lo suyo, en minúsculas y sin repetidos', async () => {
    const db = demoLeadsDb();
    const svc = createLeadsService(db, admin(ENJOY));
    const before = await db.settings(ENJOY);
    await svc.saveSender({ fromEmail: 'Hola@Mail.Enjoytheclub.es', fromName: ' Cristian · Enjoy ', replyTo: 'hola@enjoytheclub.es', notifyEmails: ['A@enjoy.es', 'a@enjoy.es', ' ', 'b@enjoy.es'] }, 'enjoy');
    const after = await db.settings(ENJOY);
    expect(after).toMatchObject({ fromEmail: 'hola@mail.enjoytheclub.es', fromName: 'Cristian · Enjoy', replyTo: 'hola@enjoytheclub.es', notifyEmails: ['a@enjoy.es', 'b@enjoy.es'] });
    expect(after?.allowedOrigins).toEqual(before?.allowedOrigins);
    expect(after?.templates ?? {}).toEqual(before?.templates ?? {});
  });

  it('dice qué email está mal y limita los avisos a 5', async () => {
    const svc = createLeadsService(demoLeadsDb(), admin(ENJOY));
    await expect(svc.saveSender({ fromEmail: null, fromName: null, replyTo: 'no-es-email', notifyEmails: [] }, 'enjoy')).rejects.toThrow('«no-es-email» no es un email');
    await expect(svc.saveSender({ fromEmail: null, fromName: null, replyTo: null, notifyEmails: ['1@a.es', '2@a.es', '3@a.es', '4@a.es', '5@a.es', '6@a.es'] }, 'enjoy')).rejects.toThrow('Como mucho 5');
  });

  it('un espacio sin ajustes los crea con su marca', async () => {
    const db = demoLeadsDb();
    const t = '00000000-0000-4000-8000-0000000000aa';
    await createLeadsService(db, admin(t)).saveSender({ fromEmail: null, fromName: null, replyTo: 'hola@acme.com', notifyEmails: ['yo@acme.com'] }, 'acme');
    expect(await db.settings(t)).toMatchObject({ brand: 'acme', enabled: false, replyTo: 'hola@acme.com', notifyEmails: ['yo@acme.com'] });
  });

  it('solo un admin', async () => {
    const svc = createLeadsService(demoLeadsDb(), admin(ENJOY, 'sales'));
    await expect(svc.saveSender({ fromEmail: null, fromName: null, replyTo: null, notifyEmails: [] }, 'enjoy')).rejects.toThrow();
  });
});

describe('la firma pegada', () => {
  beforeEach(() => resetDemoLeads());

  it('pegarla no borra los campos a mano; si no queda nada que se vea, avisa y no guarda', async () => {
    const svc = createLeadsService(demoLeadsDb(), admin(ENJOY));
    await svc.saveSignature({ name: 'Ana Ruiz', phone: '+34 600 000 000' });
    await svc.saveSignature({ html: '<p><b>Ana Ruiz</b> · Ventas</p>' });
    let sig = (await svc.settings())?.emailSignature;
    expect(sig).toMatchObject({ name: 'Ana Ruiz', phone: '+34 600 000 000' });
    expect(sig?.html).toContain('Ana Ruiz');
    await expect(svc.saveSignature({ html: '<script>x</script><style>p{}</style>' })).rejects.toThrow(/firma pegada/);
    sig = (await svc.settings())?.emailSignature;
    expect(sig?.html).toContain('Ana Ruiz');
  });
});
