import { describe, expect, it } from 'vitest';
import { checkPhone, subscribeApp, suggestedName, templateGuide } from './whatsapp-guide';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('WhatsApp a los leads: lo que se crea en Meta', () => {
  it('cada plantilla sale de lo que se manda, con su nombre, idioma y ejemplos', () => {
    const g = templateGuide('wa1', 'es', { signer: 'Cristian', brand: 'Enjoy the Club' });
    expect(g).toMatchObject({ name: 'lead_hola_es', language: 'es_ES', category: 'Utility' });
    expect(g.body).toContain('{{1}}');
    expect(g.body).toContain('{{2}}');
    expect(g.body).toContain('{{3}}');
    expect(g.body).toContain('Cristian');
    expect(g.examples).toEqual(['Laura', 'Sala Ejemplo en Valencia', expect.any(String)]);
    expect(templateGuide('wa2', 'en', { signer: 'Ana', brand: 'Acme', booking: 'https://cal.com/acme' }).examples[2]).toBe('https://cal.com/acme');
    const r = templateGuide('reminder', 'fr', { signer: 'Ana', brand: 'Acme' });
    expect(r).toMatchObject({ name: 'equipo_recordatorio_fr', language: 'fr', buttons: ['Oui, prépare-les', 'Plus tard'] });
    expect(suggestedName('wa2', 'es')).toBe('lead_recordatorio_es');
  });

  it('con textos propios, la plantilla es la suya', () => {
    const custom = { es: { wa1: 'Buenas {{1}}, soy Ana. Sobre {{2}}: {{3}}' } };
    expect(templateGuide('wa1', 'es', { signer: 'Ana', brand: 'Acme', custom }).body).toBe('Buenas {{1}}, soy Ana. Sobre {{2}}: {{3}}');
  });

  it('comprobar el número: llega, no llega o falla la red', async () => {
    const ok = (async () => json({ display_phone_number: '+34 694 90 41 49', verified_name: 'Enjoy The Club', quality_rating: 'GREEN' })) as unknown as typeof fetch;
    expect(await checkPhone('1493985227120621', 'tok', ok)).toEqual({ ok: true, number: '+34 694 90 41 49', name: 'Enjoy The Club', quality: 'GREEN' });
    const denied = (async () => json({ error: { code: 100 } }, 400)) as unknown as typeof fetch;
    expect(await checkPhone('1', 'tok', denied)).toEqual({ ok: false, error: 'no_access' });
    expect(await checkPhone('1', undefined, ok)).toEqual({ ok: false, error: 'no_token' });
    const down = (async () => { throw new Error('x'); }) as unknown as typeof fetch;
    expect(await checkPhone('1', 'tok', down)).toEqual({ ok: false, error: 'network' });
  });

  it('conectar la app a la cuenta de WhatsApp', async () => {
    const calls: string[] = [];
    const f = (async (u: string, init?: RequestInit) => { calls.push(`${init?.method} ${u}`); return json({ success: true }); }) as unknown as typeof fetch;
    expect(await subscribeApp('1093861700287687', 'tok', f)).toBe(true);
    expect(calls).toEqual(['POST https://graph.facebook.com/v25.0/1093861700287687/subscribed_apps']);
    expect(await subscribeApp('abc', 'tok', f)).toBe(false);
  });
});

describe('guardar WhatsApp a los leads', async () => {
  const { demoLeadsDb, resetDemoLeads } = await import('./db-demo');
  const { createLeadsService } = await import('./service');
  const ENJOY = '00000000-0000-4000-8000-000000000e01';
  const svc = () => createLeadsService(demoLeadsDb(), { mode: 'demo', session: { tenantId: ENJOY, role: 'admin', userId: 'u1', email: 'a@enjoy.test' } } as never);

  it('guarda número y plantillas sin tocar lo demás; vacío quita la plantilla', async () => {
    resetDemoLeads();
    const db = demoLeadsDb();
    const before = await db.settings(ENJOY);
    await svc().saveWhatsapp({ phoneId: ' 1493985227120621 ', templates: { wa1: { es: 'Lead_Hola_ES', en: '' }, wa2: { es: 'lead_recordatorio_es' } } }, 'enjoy');
    const s = await db.settings(ENJOY);
    expect(s?.whatsappPhoneId).toBe('1493985227120621');
    expect(s?.whatsappTemplates.wa1).toEqual({ ...(before?.whatsappTemplates.wa1 ?? {}), es: 'lead_hola_es' });
    expect(s?.whatsappTemplates.wa1?.en).toBeUndefined();
    expect(s?.replyTo).toBe(before?.replyTo);
  });

  it('no deja activarlo sin número o sin plantilla, ni horarios al revés, ni fechas raras', async () => {
    resetDemoLeads();
    await svc().saveWhatsapp({ phoneId: null, templates: { wa1: { es: '', en: '', fr: '' } } }, 'enjoy');
    await expect(svc().saveWhatsapp({ enabled: true }, 'enjoy')).rejects.toThrow('falta el número');
    await expect(svc().saveWhatsapp({ fromHour: 20, toHour: 9 }, 'enjoy')).rejects.toThrow('horario');
    await expect(svc().saveWhatsapp({ holidays: ['2026-13-45x'] }, 'enjoy')).rejects.toThrow('no es una fecha');
    await expect(svc().saveWhatsapp({ phoneId: 'abc' }, 'enjoy')).rejects.toThrow('solo cifras');
    await expect(svc().saveWhatsapp({ templates: { wa1: { es: 'con espacios' } } }, 'enjoy')).rejects.toThrow('no vale');
  });

  it('activar, el WhatsApp 2, horario y festivos', async () => {
    resetDemoLeads();
    const db = demoLeadsDb();
    await svc().saveWhatsapp({ phoneId: '123456', templates: { wa1: { es: 'lead_hola_es' } }, enabled: true, wa2: false, fromHour: 9, toHour: 21, holidays: ['2026-12-25', '2026-12-08', '2026-12-25'] }, 'enjoy');
    expect(await db.settings(ENJOY)).toMatchObject({ whatsappEnabled: true, whatsappWa2: false, sendFromHour: 9, sendToHour: 21, holidays: ['2026-12-08', '2026-12-25'] });
  });
});
