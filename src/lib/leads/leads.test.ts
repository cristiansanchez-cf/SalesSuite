import { beforeEach, describe, expect, test } from 'vitest';
import { parseLead } from './contract';
import { originAllowed, corsHeaders } from './cors';
import { demoLeadsDb, demoLeadsStore, resetDemoLeads } from './db-demo';
import { handleInbound } from './inbound';
import { intake, unsubscribeToken, type IntakeDeps } from './intake';
import { processDue } from './job';
import { accountDomain, emailKind, spamReasons, toE164 } from './normalize';
import { businessMinutes, firstSendAt, local, nextBusinessAt, type Hours } from './schedule';
import { scoreLead } from './score';
import { autoreplyEmail, summary, waParams, waPreview } from './templates';
import { demoWhatsApp, demoWhatsAppOutbox, isStopWord, parseWebhook, validSignature } from './whatsapp';
import { createHmac } from 'node:crypto';
import type { Email, Mailer } from '../notify/mailer';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const H: Hours = { timezone: 'Europe/Madrid', sendFromHour: 8, sendToHour: 22, holidays: ['2026-12-08'] };

const v2 = (over: Record<string, unknown> = {}) => ({
  schema: 'enjoy.lead.v2', idempotency_key: `k-${Math.random()}`, brand: 'enjoy', type: 'venue',
  contact: { name: 'Laura Gómez', email: 'laura@salax.es', phone: '600 123 123' },
  fields: { venue_name: 'Sala X', city: 'Valencia', how_heard: 'instagram' },
  message: 'Abrimos de jueves a sábado, 600 de aforo.',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: 'https://enjoytheclub.es/es/politica-de-privacidad/', submitted_at: '2026-11-03T10:00:00Z' },
  context: {
    locale: 'es', form_version: '2026-11-01', page_url: 'https://enjoytheclub.es/es/soluciones/locales/', page_path: '/es/soluciones/locales/',
    cta: { id: 'hero-primary', label: 'Hablemos de tu local', location: 'hero' }, cookie_consent: { analytics: true, ads: true },
    attribution: { current: { utm_source: 'google', gclid: 'abc', landing_page: '/es/' }, first: { utm_source: 'instagram', at: '2026-10-28T21:10:00Z' }, last: { utm_source: 'google', gclid: 'abc' } },
    time_to_submit_ms: 38211, submitted_at: '2026-11-03T10:00:00Z', user_agent: 'x', browser_language: 'es-ES', viewport: '390x844',
  },
  ...over,
});

describe('contrato', () => {
  test('v2 válido → LeadInput', () => {
    const r = parseLead(v2());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead).toMatchObject({ type: 'venue', email: 'laura@salax.es', consent: { whatsappNotice: true, ads: true, marketing: false }, cta: { id: 'hero-primary' } });
    expect(r.lead.attribution.first).toEqual({ utm_source: 'instagram', at: '2026-10-28T21:10:00Z' });
  });
  test('v1 se acepta (sin aviso de WhatsApp) y exige privacy', () => {
    const v1 = { schema: 'enjoy.lead.v1', idempotency_key: 'test-1', brand: 'enjoy', type: 'general', contact: { name: 'Prueba', email: 'Prueba@Example.com' }, fields: { event_type: 'other' },
      consent: { privacy: true, policy_url: 'x', accepted_at: '2026-11-01T00:00:00Z' }, context: { locale: 'es', page_path: '/es/', cta: 'test', time_to_submit_ms: 10000 } };
    const r = parseLead(v1);
    expect(r.ok && r.lead.email).toBe('prueba@example.com');
    expect(r.ok && r.lead.consent.whatsappNotice).toBe(false);
    expect(parseLead({ ...v1, consent: { privacy: false } }).ok).toBe(false);
  });
  test('errores legibles: esquema, email, obligatorios y valores cerrados', () => {
    expect(parseLead({ schema: 'x' })).toEqual({ ok: false, status: 400, errors: { schema: 'unknown_schema' } });
    const bad = parseLead(v2({ contact: { name: 'L', email: 'no-es-email' } }));
    expect(!bad.ok && bad.errors['contact.email']).toBe('invalid');
    const general = parseLead(v2({ type: 'general', fields: {} }));
    expect(!general.ok && general.errors['fields.event_type']).toBe('required');
    const fest = parseLead(v2({ type: 'festival', fields: { attendees: 'muchos' } }));
    expect(!fest.ok && fest.errors['fields.attendees']).toBe('invalid');
  });
});

describe('normalización y antispam', () => {
  test('tipos de email y dominio de cuenta', () => {
    expect(emailKind('laura@salax.es')).toBe('business');
    expect(emailKind('laura@gmail.com')).toBe('free_webmail');
    expect(emailKind('x@yopmail.com')).toBe('disposable');
    expect(emailKind('info@salax.es')).toBe('role');
    expect(accountDomain('laura@gmail.com')).toBeNull();
    expect(accountDomain('info@salax.es')).toBe('salax.es');
  });
  test('teléfono a E.164: España por defecto, el país que diga la web o el del idioma', () => {
    expect(toE164('600 123 123')).toBe('+34600123123');
    expect(toE164('06 12 34 56 78', { locale: 'fr' })).toBe('+33612345678');
    expect(toE164('0033 6 12 34 56 78')).toBe('+33612345678');
    expect(toE164('12345')).toBeNull();
    expect(toE164(null)).toBeNull();
  });
  test('motivos de cuarentena', () => {
    expect(spamReasons({ email: 'a@b.es', name: 'A', message: null, timeToSubmitMs: 30000, recentByEmail: 0 })).toEqual([]);
    expect(spamReasons({ email: 'a@yopmail.com', name: 'a@yopmail.com', message: 'http://a.ru http://b.ru http://c.ru', timeToSubmitMs: 900, recentByEmail: 3 }))
      .toEqual(['too_fast', 'disposable_email', 'many_links', 'odd_name', 'too_many_by_email']);
  });
});

describe('CORS', () => {
  const list = ['https://enjoytheclub.es', 'https://corporativeweb-b0ce4--*.web.app'];
  test('exactos, previews del sitio y localhost; nada más', () => {
    expect(originAllowed('https://enjoytheclub.es', list)).toBe(true);
    expect(originAllowed('https://corporativeweb-b0ce4--pr12-abc123.web.app', list)).toBe(true);
    expect(originAllowed('https://cualquiera.web.app', list)).toBe(false);
    expect(originAllowed('https://enjoytheclub.es.evil.com', list)).toBe(false);
    expect(originAllowed('http://localhost:4321', list)).toBe(true);
    expect(originAllowed(null, list)).toBe(false);
    expect(corsHeaders('https://enjoytheclub.es', true)).toMatchObject({ 'Access-Control-Allow-Origin': 'https://enjoytheclub.es', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
    expect(corsHeaders('https://x.es', false)).toEqual({ Vary: 'Origin' });
  });
});

describe('horarios', () => {
  test('dentro de 8-22: a los 1-3 minutos', () => {
    const now = new Date('2026-11-03T10:00:00Z'); // 11:00 en Madrid
    const r = firstSendAt(now, H, 0.5);
    expect(r.eta).toBe('minutes');
    expect((r.at.getTime() - now.getTime()) / 1000).toBe(120);
  });
  test('de noche: a las 9:00 siguientes (hoy de madrugada, mañana si es tarde)', () => {
    const late = firstSendAt(new Date('2026-11-03T22:30:00Z'), H, 0); // 23:30 Madrid
    expect(late.eta).toBe('next_business_day');
    expect(local(late.at, H.timezone)).toMatchObject({ ymd: '2026-11-04', h: 9, min: 0 });
    const early = firstSendAt(new Date('2026-11-04T05:00:00Z'), H, 0); // 6:00 Madrid
    expect(early.eta).toBe('today');
    expect(local(early.at, H.timezone)).toMatchObject({ ymd: '2026-11-04', h: 9 });
  });
  test('siguiente día laborable: salta fin de semana y festivos', () => {
    expect(local(nextBusinessAt(new Date('2026-11-06T10:00:00Z'), H, 10, 0), H.timezone)).toMatchObject({ ymd: '2026-11-09', h: 10 }); // viernes → lunes
    expect(local(nextBusinessAt(new Date('2026-12-07T10:00:00Z'), H, 10, 0), H.timezone).ymd).toBe('2026-12-09'); // 8-dic festivo
  });
  test('minutos laborables: viernes 21:00 → lunes 9:10 son 10', () => {
    expect(businessMinutes(new Date('2026-11-06T20:00:00Z'), new Date('2026-11-09T08:10:00Z'), H)).toBe(10);
    expect(businessMinutes(new Date('2026-11-03T10:00:00Z'), new Date('2026-11-03T10:07:00Z'), H)).toBe(7);
  });
});

describe('textos', () => {
  test('lo que pidió y la plantilla de WhatsApp, en su idioma', () => {
    expect(summary('venue', { venue_name: 'Sala X', city: 'Valencia' }, 'es')).toBe('Sala X en Valencia');
    expect(summary('wedding', { wedding_date: '2027-06-14' }, 'fr')).toBe('votre mariage du 14 juin 2027');
    const p = waParams('wa1', { name: 'Laura Gómez', type: 'venue', fields: { venue_name: 'Sala X' }, locale: 'es', bookingUrl: null, videoUrl: null });
    expect(p[0]).toBe('Laura');
    expect(waPreview('wa1', 'es', 'Cristian', 'Enjoy the Club', p)).toContain('Hola Laura, soy Cristian, de Enjoy the Club. He visto tu mensaje sobre Sala X');
    const e = autoreplyEmail({ name: 'Laura', type: 'venue', fields: { venue_name: 'Sala X' }, locale: 'en', signer: 'Cristian', brand: 'Enjoy', channel: 'whatsapp', eta: 'next_business_day', bookingUrl: 'https://cal.x/c', unsubscribeUrl: 'https://u' });
    expect(e.text).toContain("I'll message you on WhatsApp first thing tomorrow");
    expect(e.html).toContain('<a href="https://cal.x/c">');
  });
  test('puntuación: encaje e intención', () => {
    const s = scoreLead({ type: 'festival', fields: { attendees: '>10000', event_name: 'X' }, emailKind: 'business', message: 'Queremos ponerlo en la edición de 2027 con dos escenarios', ctaId: 'pricing-cta', pagePath: '/es/', submissions: 1, now: new Date() });
    expect(s.band).toBe('hot');
    expect(scoreLead({ type: 'waitlist', fields: {}, emailKind: 'free_webmail', message: null, ctaId: null, pagePath: null, submissions: 1, now: new Date() }).band).toBe('low');
  });
});

describe('entrada y cola (memoria)', () => {
  let sent: Email[];
  const mailer: Mailer = { async send(e) { sent.push(e); return { id: 'em_1' }; } };
  const deps = (over: Partial<IntakeDeps> = {}): IntakeDeps => ({
    db: demoLeadsDb(), tenant: { id: ENJOY, name: 'Enjoy the Club' }, settings: demoLeadsStore().settings[0], now: new Date('2026-11-03T10:00:00Z'),
    origin: 'https://enjoytheclub.es', ip: '1.2.3.4', secret: 's', baseUrl: 'https://enjoy.ventas.cofundo.io', whatsappReady: false, rand: () => 0.5, ...over,
  });
  beforeEach(() => { resetDemoLeads(); sent = []; demoWhatsAppOutbox().length = 0; });

  test('crea el lead, guarda la prueba legal y responde next=email; la cola manda respuesta y aviso', async () => {
    const r = await intake(deps(), v2());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ next: { channel: 'email', eta: 'minutes' } });
    const st = demoLeadsStore();
    expect(st.leads[0]).toMatchObject({ email: 'laura@salax.es', emailKind: 'business', domain: 'salax.es', phoneE164: '+34600123123', quarantined: false, consentAds: true,
      attributionFirst: { utm_source: 'instagram' }, attributionLast: { utm_source: 'google', gclid: 'abc' } });
    expect(st.subs[0].consent).toMatchObject({ legal_text_version: '2026-11-01', policy_url: expect.any(String), received_at: '2026-11-03T10:00:00.000Z' });
    const j = await processDue({ db: demoLeadsDb(), mailer, whatsapp: null, now: new Date('2026-11-03T10:00:05Z'), secret: 's' });
    expect(j).toMatchObject({ sent: 2, failed: 0 });
    const auto = sent.find((e) => e.tag === 'lead-autoreply')!;
    expect(auto).toMatchObject({ to: 'laura@salax.es', replyTo: 'cristian@enjoytheclub.es', from: 'Cristian · Enjoy the Club <cristian@mail.enjoytheclub.es>' });
    expect(auto.headers?.['List-Unsubscribe']).toContain(`t=${unsubscribeToken(st.leads[0].id, 's')}`);
    expect(sent.find((e) => e.tag === 'lead-notify')).toMatchObject({ to: 'cristian@enjoytheclub.es', replyTo: 'laura@salax.es' });
  });

  test('la misma clave dos veces → la misma respuesta (200, duplicate)', async () => {
    const body = v2({ idempotency_key: 'fijo-1' });
    const a = await intake(deps(), body);
    const b = await intake(deps(), body);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ id: (a.body as { id: string }).id, next: (a.body as { next: unknown }).next, duplicate: true });
    expect(demoLeadsStore().subs).toHaveLength(1);
  });

  test('repetir con otro envío suma actividad y no pisa la primera atribución', async () => {
    await intake(deps(), v2());
    await intake(deps({ now: new Date('2026-11-04T10:00:00Z') }), v2({ context: { ...v2().context, attribution: { current: { utm_source: 'tiktok' } } } }));
    const l = demoLeadsStore().leads[0];
    expect(demoLeadsStore().leads).toHaveLength(1);
    expect(l.submissions).toBe(2);
    expect(l.attributionFirst).toEqual({ utm_source: 'instagram', at: '2026-10-28T21:10:00Z' });
    expect(l.attributionLast).toEqual({ utm_source: 'tiktok' });
  });

  test('sospechoso → cuarentena: se guarda, no se contacta ni se avisa', async () => {
    const r = await intake(deps(), v2({ context: { ...v2().context, time_to_submit_ms: 800 } }));
    expect(r.status).toBe(201);
    expect(demoLeadsStore().leads[0]).toMatchObject({ quarantined: true, quarantineReasons: ['too_fast'] });
    expect(demoLeadsStore().msgs).toHaveLength(0);
  });

  test('desde localhost o con test:true: prueba, sin envíos', async () => {
    await intake(deps({ origin: 'http://localhost:4321' }), v2());
    await intake(deps(), v2({ test: true, contact: { name: 'T', email: 't@salax.es' } }));
    expect(demoLeadsStore().leads.every((l) => l.isTest)).toBe(true);
    expect(demoLeadsStore().msgs).toHaveLength(0);
  });

  test('marca que no es la del espacio → 400; espacio apagado → 503 (salvo pruebas)', async () => {
    expect((await intake(deps(), v2({ brand: 'oquea' }))).status).toBe(400);
    const off = { ...demoLeadsStore().settings[0], enabled: false };
    expect((await intake(deps({ settings: off }), v2())).status).toBe(503);
    expect((await intake(deps({ settings: off }), v2({ test: true }))).status).toBe(201);
  });

  test('límite por IP → 429', async () => {
    for (let i = 0; i < 8; i++) await intake(deps(), v2({ contact: { name: 'X', email: `x${i}@salax.es` } }));
    expect((await intake(deps(), v2({ contact: { name: 'Y', email: 'y@salax.es' } }))).status).toBe(429);
  });

  describe('con WhatsApp', () => {
    const waSettings = () => ({ ...demoLeadsStore().settings[0], whatsappEnabled: true, whatsappPhoneId: '123456789', whatsappTemplates: { wa1: { es: 'lead_hola_es' }, wa2: { es: 'lead_recordatorio_es' } } });
    test('programa wa1 (1-3 min) y wa2 (siguiente laborable); next=whatsapp; respuesta suya para la secuencia', async () => {
      const s = waSettings();
      demoLeadsStore().settings = [s];
      const r = await intake(deps({ settings: s, whatsappReady: true }), v2());
      expect(r.body).toMatchObject({ next: { channel: 'whatsapp', eta: 'minutes' } });
      const steps = demoLeadsStore().msgs.map((m) => m.step).sort();
      expect(steps).toEqual(['autoreply', 'notify', 'wa1', 'wa2']);
      // A los 3 minutos sale el primero.
      await processDue({ db: demoLeadsDb(), mailer, whatsapp: demoWhatsApp, now: new Date('2026-11-03T10:03:00Z'), secret: 's' });
      expect(demoWhatsAppOutbox()).toEqual([{ to: '+34600123123', template: 'lead_hola_es', locale: 'es', params: ['Laura', 'Sala X en Valencia', expect.stringContaining('¿Qué noches')] }]);
      expect(demoLeadsStore().leads[0].stage).toBe('contacted');
      // Contesta: se cancela el segundo, pasa a «respondió» y se avisa.
      const res = await handleInbound(demoLeadsDb(), [{ phoneId: '123456789', from: '+34600123123', text: 'Hola! Abrimos jueves', at: new Date('2026-11-03T10:10:00Z'), id: 'w1' }], new Date('2026-11-03T10:10:00Z'));
      expect(res.matched).toBe(1);
      const l = demoLeadsStore().leads[0];
      expect(l).toMatchObject({ stage: 'replied', sequenceStopReason: 'replied' });
      expect(demoLeadsStore().msgs.find((m) => m.step === 'wa2')!.status).toBe('cancelled');
      // Un nuevo envío con la conversación abierta no reinicia la secuencia.
      await intake(deps({ settings: s, whatsappReady: true, now: new Date('2026-11-03T12:00:00Z') }), v2());
      expect(demoLeadsStore().msgs.filter((m) => m.step === 'wa1')).toHaveLength(1);
    });
    test('«baja» por WhatsApp → no se le vuelve a escribir por ahí', async () => {
      const s = waSettings();
      demoLeadsStore().settings = [s];
      await intake(deps({ settings: s, whatsappReady: true }), v2());
      await handleInbound(demoLeadsDb(), [{ phoneId: '123456789', from: '+34600123123', text: 'BAJA', at: new Date(), id: 'w2' }], new Date());
      expect(await demoLeadsDb().suppressed(ENJOY, { phone: '+34600123123' })).toMatchObject({ whatsapp: true });
      expect(isStopWord('stop')).toBe(true);
      expect(isStopWord('Hola, ¿paramos el sábado?')).toBe(false);
    });
    test('sin aviso de WhatsApp en el formulario (v1) → solo email', async () => {
      const s = waSettings();
      const r = await intake(deps({ settings: s, whatsappReady: true }), v2({ consent: { ...v2().consent, whatsapp_contact: false } }));
      expect(r.body).toMatchObject({ next: { channel: 'email' } });
    });
  });

  test('webhook de Meta: firma y mensajes', () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, messages: [{ from: '34600123123', id: 'm1', timestamp: '1762164000', type: 'text', text: { body: 'Hola' } }] } }] }] });
    const sig = `sha256=${createHmac('sha256', 'app').update(raw).digest('hex')}`;
    expect(validSignature(raw, sig, 'app')).toBe(true);
    expect(validSignature(raw, sig, 'otro')).toBe(false);
    expect(parseWebhook(JSON.parse(raw)).inbound[0]).toMatchObject({ phoneId: '123', from: '+34600123123', text: 'Hola' });
  });
});

describe('Resend por empresa', () => {
  test('la clave se guarda cifrada y solo la abre el mismo secreto', async () => {
    const { seal, open, hintOf } = await import('./secret-box');
    const box = seal('re_abc123456789', 'sec');
    expect(box).not.toContain('re_abc');
    expect(open(box, 'sec')).toBe('re_abc123456789');
    expect(open(box, 'otro')).toBeNull();
    expect(open('basura', 'sec')).toBeNull();
    expect(hintOf('re_abc123456789')).toBe('re_…6789');
  });
  test('con clave propia envía su cuenta y su remitente; sin ella, la de la plataforma', async () => {
    resetDemoLeads();
    const { seal } = await import('./secret-box');
    const { mailerFactory } = await import('./server');
    const db = demoLeadsDb();
    const calls: { auth: string; from: string }[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      calls.push({ auth: String((init.headers as Record<string, string>).Authorization), from: JSON.parse(String(init.body)).from });
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as unknown as typeof fetch;
    const platform: Mailer = { async send() { calls.push({ auth: 'platform', from: '' }); } };
    await db.setResendKey(ENJOY, seal('re_enjoykey123', 'sec'), 're_…y123', null);
    const forTenant = mailerFactory(db, platform, 'sec', fake);
    await (await forTenant(ENJOY))!.send({ to: 'a@b.es', subject: 's', html: 'h', text: 't', tag: 'x' });
    expect(calls[0]).toEqual({ auth: 'Bearer re_enjoykey123', from: 'Cristian · Enjoy the Club <cristian@mail.enjoytheclub.es>' });
    await (await mailerFactory(db, platform, 'sec', fake)('otro-espacio'))!.send({ to: 'a@b.es', subject: 's', html: 'h', text: 't', tag: 'x' });
    expect(calls[1].auth).toBe('platform');
    expect(demoLeadsStore().settings[0].resendKeyHint).toBe('re_…y123');
  });
});

describe('clasificar antes de escribir', () => {
  const base = { fields: {}, message: null, name: 'X', email: 'x@empresa.es', emailKind: 'business' as const, cta: null, page: null };
  test('reglas: lo que encaja va solo; marcas, prensa, proveedores o «otro», a una persona', async () => {
    const { classifyRules } = await import('./classify');
    expect(classifyRules({ ...base, type: 'venue', fields: { venue_name: 'Sala X' }, message: 'Abrimos de jueves a sábado y vendemos muchas bebidas' })).toMatchObject({ category: 'venue', auto: true });
    expect(classifyRules({ ...base, type: 'venue', message: 'Somos una marca de cerveza y buscamos un acuerdo de patrocinio con vosotros' })).toMatchObject({ category: 'partner', auto: false });
    expect(classifyRules({ ...base, type: 'general', fields: { event_type: 'other' } })).toMatchObject({ auto: false });
    expect(classifyRules({ ...base, type: 'festival', message: 'Somos una promotora y organizamos fiestas' })).toMatchObject({ category: 'promoter', auto: true });
    expect(classifyRules({ ...base, type: 'venue', message: 'Somos una promotora, hacemos fiestas en varias salas' })).toMatchObject({ category: 'promoter', auto: false });
    expect(classifyRules({ ...base, type: 'wedding', message: 'Ofrecemos posicionamiento web para vuestra empresa' })).toMatchObject({ category: 'vendor', auto: false });
  });
  test('la IA puede quitar el automático (nunca darlo si no encaja)', async () => {
    const { decide } = await import('./classify');
    expect(decide('venue', { category: 'venue', confidence: 0.9, reason: 'ok' }).auto).toBe(true);
    expect(decide('venue', { category: 'venue', confidence: 0.6, reason: 'duda' }).auto).toBe(false);
    expect(decide('venue', { category: 'partner', confidence: 0.95, reason: 'dominio de una marca de bebidas' }).auto).toBe(false);
    expect(decide('festival', { category: 'promoter', confidence: 0.9, reason: 'promotora' }).auto).toBe(true);
    expect(decide(null, { category: 'venue', confidence: 0.99, reason: '' }).auto).toBe(false);
  });

  const deps2 = (over: Partial<IntakeDeps> = {}): IntakeDeps => ({
    db: demoLeadsDb(), tenant: { id: ENJOY, name: 'Enjoy the Club' }, settings: demoLeadsStore().settings[0], now: new Date('2026-11-03T10:00:00Z'),
    origin: 'https://enjoytheclub.es', ip: '9.9.9.9', secret: 's', baseUrl: 'https://enjoy.ventas.cofundo.io', whatsappReady: true, rand: () => 0.5, ...over,
  });
  const waOn = () => { const s = { ...demoLeadsStore().settings[0], whatsappEnabled: true, whatsappPhoneId: '123456789', whatsappTemplates: { wa1: { es: 't1' }, wa2: { es: 't2' } } }; demoLeadsStore().settings = [s]; return s; };

  test('la marca de bebidas que escribe desde «locales»: ni WhatsApp ni email que hable de su local', async () => {
    resetDemoLeads(); demoWhatsAppOutbox().length = 0;
    const s = waOn();
    const r = await intake(deps2({ settings: s }), v2({ contact: { name: 'Ana Brand', email: 'ana@cervezasx.com', phone: '600111222' }, fields: { venue_name: 'Cervezas X' },
      message: 'Somos una marca de cerveza y queremos un acuerdo de patrocinio con vuestros locales' }));
    expect(r.body).toMatchObject({ next: { channel: 'email' } });
    expect(demoLeadsStore().msgs.map((m) => m.step).sort()).toEqual(['autoreply', 'notify']);
    const sent: Email[] = [];
    await processDue({ db: demoLeadsDb(), mailer: { async send(e) { sent.push(e); } }, whatsapp: demoWhatsApp, now: new Date('2026-11-03T10:00:05Z'), secret: 's' });
    const auto = sent.find((e) => e.tag === 'lead-autoreply')!;
    expect(auto.subject).toBe('Gracias por escribir');
    expect(auto.text).not.toContain('Cervezas X');
    expect(auto.text).toContain('Te contesto yo personalmente');
    expect(sent.find((e) => e.tag === 'lead-notify')!.text).toContain('Marca o alianza · revísalo tú');
  });

  test('si la IA dice que no es lo que parece, se cancelan los WhatsApp y el email sale neutro', async () => {
    resetDemoLeads(); demoWhatsAppOutbox().length = 0;
    const s = waOn();
    await intake(deps2({ settings: s }), v2({ message: 'Hola, queremos información' }));
    expect(demoLeadsStore().msgs.filter((m) => m.channel === 'whatsapp')).toHaveLength(2);
    const sent: Email[] = [];
    const veto = async () => ({ category: 'partner' as const, confidence: 0.9, reason: 'El dominio es de una distribuidora de bebidas' });
    await processDue({ db: demoLeadsDb(), mailer: { async send(e) { sent.push(e); } }, whatsapp: demoWhatsApp, now: new Date('2026-11-03T10:05:00Z'), secret: 's', classifier: veto });
    expect(demoWhatsAppOutbox()).toHaveLength(0);
    expect(demoLeadsStore().msgs.filter((m) => m.channel === 'whatsapp').every((m) => m.status === 'cancelled')).toBe(true);
    expect(sent.find((e) => e.tag === 'lead-autoreply')!.subject).toBe('Gracias por escribir');
    expect(sent.find((e) => e.tag === 'lead-notify')!.text).toContain('escríbele tú');
    expect((demoLeadsStore().leads[0].facts.classification as { by: string }).by).toBe('ai');
  });

  test('textos propios: se usan; lo igual al de por defecto no se guarda', async () => {
    const { onlyCustom } = await import('./service');
    const { DEFAULT_TEXTS, autoreplyEmail: ar, waPreview: wp } = await import('./templates');
    expect(onlyCustom({ es: { ...DEFAULT_TEXTS.es, questions: { ...DEFAULT_TEXTS.es.questions, venue: '¿Cuántas noches abrís?' } } })).toEqual({ es: { questions: { venue: '¿Cuántas noches abrís?' } } });
    const custom = { es: { subject: 'Hola desde {marca}', body: 'Hola {nombre}{sobre}.\n\n{reserva}\n\n{firma}' } };
    const e = ar({ name: 'Laura G', type: 'venue', fields: { venue_name: 'Sala X' }, locale: 'es', signer: 'Cristian', brand: 'Enjoy', channel: 'email', eta: 'minutes', bookingUrl: null, unsubscribeUrl: null, custom });
    expect(e.subject).toBe('Hola desde Enjoy');
    expect(e.text).toBe('Hola Laura sobre Sala X.\n\nCristian');
    expect(wp('wa1', 'es', 'Cristian', 'Enjoy', ['Laura', 'Sala X', '¿Qué tal?'], { es: { wa1: 'Hola {{1}}, {firma} aquí. Sobre {{2}}: {{3}}' } })).toBe('Hola Laura, Cristian aquí. Sobre Sala X: ¿Qué tal?');
  });
});
