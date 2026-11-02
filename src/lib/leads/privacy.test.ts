import { beforeEach, describe, expect, test } from 'vitest';
import { parseLead, stripClickIds } from './contract';
import { demoLeadsDb, demoLeadsStore, resetDemoLeads } from './db-demo';
import { intake, type IntakeDeps } from './intake';
import { processDue } from './job';
import { anonymousPatch, cutoffs, eraseSubject, exportOf, purgeDue, purgeTenant, retentionOf, subjectData, subjectHash, suppressionKey } from './privacy';
import { demoPrivacyDb } from './privacy-db-demo';
import { DEFAULT_RETENTION, type Lead } from './types';
import { DEFAULT_TEXTS } from './templates';
import { demoWhatsApp, demoWhatsAppOutbox } from './whatsapp';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const SECRET = 'demo-leads-secret';
let n = 0;
const body = (over: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) => ({
  schema: 'enjoy.lead.v2', idempotency_key: `p-${++n}`, brand: 'enjoy', type: 'venue',
  contact: { name: 'Laura Gómez', email: 'laura@salax.es', phone: '600 123 123' },
  fields: { venue_name: 'Sala X', city: 'Valencia' }, message: 'Abrimos de jueves a sábado.',
  consent: { marketing: false, whatsapp_contact: true, legal_text_version: '2026-11-01', policy_url: 'https://enjoytheclub.es/es/politica-de-privacidad/' },
  context: {
    locale: 'es', page_url: 'https://enjoytheclub.es/es/locales/?utm_source=google&gclid=abc&x=1', page_path: '/es/locales/', cta: { id: 'hero' },
    cookie_consent: { analytics: true, ads: false }, time_to_submit_ms: 30000,
    attribution: { current: { utm_source: 'google', gclid: 'abc', fbclid: 'f', msclkid: 'm', landing_page: '/es/?gclid=abc&utm_medium=cpc' }, first: { utm_source: 'google', ttclid: 't', gbraid: 'g', wbraid: 'w' } },
    ...ctx,
  },
  ...over,
});
const deps = (now: string, over: Partial<IntakeDeps> = {}): IntakeDeps => ({
  db: demoLeadsDb(), tenant: { id: ENJOY, name: 'Enjoy the Club' }, settings: demoLeadsStore().settings[0], now: new Date(now),
  origin: 'https://enjoytheclub.es', ip: '1.2.3.4', secret: SECRET, baseUrl: 'https://enjoy.ventas.cofundo.io', whatsappReady: false, rand: () => 0.5, ...over,
});
const lead = (email: string, isTest = false) => demoLeadsStore().leads.find((l) => l.email === email && l.isTest === isTest)!;

describe('identificadores de clic', () => {
  test('sin consentimiento de publicidad no se guardan: ni en la atribución ni en las URLs', () => {
    const r = parseLead(body());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.consent.ads).toBe(false);
    expect(r.lead.attribution.current).toEqual({ utm_source: 'google', landing_page: '/es/?utm_medium=cpc' });
    expect(r.lead.attribution.first).toEqual({ utm_source: 'google' });
    expect(r.lead.page.url).toBe('https://enjoytheclub.es/es/locales/?utm_source=google&x=1');
    expect(r.lead.context.page_url).toBe('https://enjoytheclub.es/es/locales/?utm_source=google&x=1');
    expect(JSON.stringify(r.lead)).not.toMatch(/gclid|fbclid|msclkid|ttclid|gbraid|wbraid/);
  });
  test('con consentimiento se guardan tal cual', () => {
    const r = parseLead(body({}, { cookie_consent: { ads: true } }));
    expect(r.ok && r.lead.attribution.current?.gclid).toBe('abc');
    expect(r.ok && r.lead.page.url).toContain('gclid=abc');
  });
  test('stripClickIds respeta el resto de la URL', () => {
    expect(stripClickIds('/es/?gclid=1')).toBe('/es/');
    expect(stripClickIds('https://x.es/a?b=2&FBCLID=3#top')).toBe('https://x.es/a?b=2#top');
    expect(stripClickIds('https://x.es/a')).toBe('https://x.es/a');
  });
});

describe('plazos y borrado diario', () => {
  beforeEach(() => { resetDemoLeads(); demoWhatsAppOutbox().length = 0; });
  const p = () => demoPrivacyDb();

  test('por defecto: 24 meses, 6 meses, 30 días y 5 años; las pruebas, nunca más de 183 días', () => {
    expect(DEFAULT_RETENTION).toEqual({ leadMonths: 24, spamMonths: 6, testDays: 30, proofYears: 5 });
    expect(retentionOf({})).toEqual(DEFAULT_RETENTION);
    expect(retentionOf({ retention: { ...DEFAULT_RETENTION, testDays: 400 } }).testDays).toBe(183);
    const c = cutoffs(DEFAULT_RETENTION, new Date('2026-11-02T00:00:00Z'));
    expect(c).toEqual({ lead: '2024-11-02T00:00:00.000Z', spam: '2026-05-02T00:00:00.000Z', test: '2026-10-03T00:00:00.000Z' });
  });

  test('pruebas a los 30 días, spam a los 6 meses y leads a los 24: anonimizados, con la prueba legal bloqueada', async () => {
    const t0 = '2024-01-10T10:00:00Z';
    await intake(deps(t0), body());                                                              // lead que no contrata
    await intake(deps(t0), body({ contact: { name: 'Bot', email: 'bot@spam.es' }, message: 'x' }, { time_to_submit_ms: 100 })); // cuarentena
    await intake(deps(t0), body({ contact: { name: 'Val', email: 'val@ok.es' } }));               // lo validan
    await intake(deps('2026-09-01T10:00:00Z'), body({ test: true, contact: { name: 'Test', email: 'test@me.es' } }));
    await intake(deps('2026-10-30T10:00:00Z'), body({ test: true, contact: { name: 'Test2', email: 'test2@me.es' } }));
    expect(lead('bot@spam.es').quarantined).toBe(true);
    await demoLeadsDb().updateLead(lead('val@ok.es').id, { validatedAt: '2024-01-11T00:00:00Z' });
    // Respuesta automática de Laura enviada (para ver que también se borra la cola).
    await processDue({ db: demoLeadsDb(), mailer: { async send() { return { id: 'x' }; } }, whatsapp: null, now: new Date('2024-01-10T10:01:00Z'), secret: SECRET });
    const laura = lead('laura@salax.es');
    expect(demoLeadsStore().subs.some((s) => s.leadId === laura.id && s.ipHash)).toBe(true);

    const log = await purgeTenant(p(), demoLeadsStore().settings[0], new Date('2026-11-02T03:00:00Z'), SECRET);
    expect(log).toMatchObject({ anonymized: 1, deleted: 1, tests: 1 });
    const st = demoLeadsStore();
    // Laura: anonimizada (las métricas siguen) y sin envíos (ni hash de IP), historial ni cola.
    const a = st.leads.find((l) => l.id === laura.id)!;
    expect(a).toMatchObject({ name: 'Anónimo', phoneE164: null, phoneRaw: null, domain: null, attributionFirst: { utm_source: 'google' }, anonymizedAt: '2026-11-02T03:00:00.000Z' });
    expect(a.email).toBe(`anon-${laura.id}@anon.invalid`);
    expect(JSON.stringify(a)).not.toMatch(/Laura|salax|600 ?123|Sala X|Valencia/);
    expect(st.subs.some((s) => s.leadId === laura.id) || st.events.some((e) => e.leadId === laura.id) || st.msgs.some((m) => m.leadId === laura.id)).toBe(false);
    // Spam fuera; lo validado, intacto; la prueba de hace 2 meses fuera y la de hace 3 días, no.
    expect(st.leads.map((l) => l.email).sort()).toEqual([a.email, 'test2@me.es', 'val@ok.es'].sort());
    // Prueba legal bloqueada de Laura (y de la cuarentena, que no se marcó como spam): por su hash, con 5 años.
    const proofs = st.proofs!.filter((x) => x.subjectHash === subjectHash('laura@salax.es', SECRET));
    expect(proofs).toHaveLength(1);
    expect(proofs[0]).toMatchObject({ reason: 'purge', deleteAfter: '2031-11-02T03:00:00.000Z', pagePath: '/es/locales/', consent: { legal_text_version: '2026-11-01' } });
    expect(JSON.stringify(proofs[0])).not.toMatch(/1\.2\.3\.4|ipHash|laura/);
    // Fuera de las listas, pero en las métricas.
    expect(await demoLeadsDb().list(ENJOY, 'all')).toHaveLength(1);
    expect(await demoLeadsDb().list(ENJOY, 'all', { anonymized: true })).toHaveLength(2);
    expect(st.settings[0].lastPurgeAt).toBe('2026-11-02T03:00:00.000Z');
    expect(st.purges![0]).toMatchObject({ anonymized: 1, deleted: 1, tests: 1 });
    // Pasados los 5 años, la prueba legal se borra.
    const later = await purgeTenant(p(), st.settings[0], new Date('2031-11-03T03:00:00Z'), SECRET);
    expect(later.proofsDeleted).toBeGreaterThanOrEqual(1);
    expect(st.proofs!.filter((x) => x.subjectHash === subjectHash('laura@salax.es', SECRET))).toHaveLength(0);
  });

  test('el último contacto cuenta: si volvió a escribir hace poco, no se toca', async () => {
    await intake(deps('2024-01-10T10:00:00Z'), body());
    await intake(deps('2026-06-01T10:00:00Z'), body());
    const log = await purgeTenant(p(), demoLeadsStore().settings[0], new Date('2026-11-02T03:00:00Z'), SECRET);
    expect(log.anonymized).toBe(0);
    expect(lead('laura@salax.es').name).toBe('Laura Gómez');
  });

  test('plazos propios del espacio y una vez al día', async () => {
    const s = { ...demoLeadsStore().settings[0], retention: { leadMonths: 12, spamMonths: 3, testDays: 7, proofYears: 3 } };
    demoLeadsStore().settings = [s];
    await intake(deps('2025-09-01T10:00:00Z', { settings: s }), body());
    const now = new Date('2026-11-02T03:00:00Z');
    expect(await purgeDue(p(), demoLeadsDb(), now, SECRET)).toHaveLength(1);
    expect(lead('laura@salax.es')).toBeUndefined();
    expect(await purgeDue(p(), demoLeadsDb(), new Date('2026-11-02T20:00:00Z'), SECRET)).toHaveLength(0);
    expect(await purgeDue(p(), demoLeadsDb(), new Date('2026-11-03T03:00:00Z'), SECRET)).toHaveLength(1);
  });

  test('la lista de supresión guarda un hash; las filas en claro antiguas se convierten', async () => {
    const db = demoLeadsDb();
    await db.suppress(ENJOY, 'all', 'Pepa@Mail.es', 'baja');
    const st = demoLeadsStore();
    expect(st.supp[0].value).toBe(suppressionKey('pepa@mail.es', SECRET));
    expect(JSON.stringify(st.supp)).not.toContain('pepa');
    expect(await db.suppressed(ENJOY, { email: 'pepa@mail.es' })).toEqual({ email: true, whatsapp: true });
    st.supp.push({ tenantId: ENJOY, channel: 'whatsapp', value: '+34600111222', reason: 'antigua' });
    expect(await db.suppressed(ENJOY, { phone: '+34600111222' })).toMatchObject({ whatsapp: true });
    const log = await purgeTenant(p(), st.settings[0], new Date(), SECRET);
    expect(log.hashed).toBe(1);
    expect(JSON.stringify(st.supp)).not.toContain('600111222');
    expect(await db.suppressed(ENJOY, { phone: '+34600111222' })).toMatchObject({ whatsapp: true });
  });

  test('anonymousPatch: la fuente para las métricas, sin identificadores', () => {
    const l = { id: 'x', type: 'venue', stage: 'discarded', facts: { fields: { venue_name: 'Sala' }, classification: { category: 'venue', reason: 'Sala de Laura' } },
      attributionFirst: { gclid: 'abc', referrer: 'https://google.es/?q=laura' }, attributionLast: null, scoreDetail: { fit: 1, intent: 2, band: 'hot', detail: ['Laura'] } } as unknown as Lead;
    const a = anonymousPatch(l, '2026-11-02T00:00:00Z');
    expect(a).toMatchObject({ attributionFirst: { utm_source: 'google-ads' }, attributionLast: null, discardReason: 'anonimizado', facts: { anonymized: true, type: 'venue', classification: { category: 'venue' } } });
    expect(JSON.stringify(a)).not.toMatch(/laura|Sala|abc/i);
  });
});

describe('derechos', () => {
  beforeEach(() => resetDemoLeads());
  test('exportar todo en JSON y suprimirlo, con la prueba bloqueada, la baja en hash y el registro', async () => {
    await intake(deps('2026-10-01T10:00:00Z'), body());
    await intake(deps('2026-10-01T10:00:00Z'), body({ test: true }));
    await intake(deps('2026-10-01T10:00:00Z'), body({ contact: { name: 'Otro', email: 'otro@x.es' } }));
    const pdb = demoPrivacyDb();
    const d = await subjectData(pdb, ENJOY, ' LAURA@salax.es ', SECRET);
    expect(d.leads).toHaveLength(2);
    const out = exportOf(d, 'Enjoy', new Date('2026-11-02T00:00:00Z'));
    expect(out.subject).toBe('laura@salax.es');
    expect(out.leads[0].submissions[0]).toMatchObject({ message: 'Abrimos de jueves a sábado.', consent: { legal_text_version: '2026-11-01' } });
    expect(JSON.stringify(out)).not.toContain('otro@x.es');

    const r = await eraseSubject(pdb, demoLeadsDb(), d, { tenantId: ENJOY, byUser: 'u1', suppress: true, now: new Date('2026-11-02T00:00:00Z'), proofYears: 5, secret: SECRET });
    expect(r).toMatchObject({ leads: 2, proofsKept: 1, suppressed: true });
    const st = demoLeadsStore();
    expect(st.leads.map((l) => l.email)).toEqual(['otro@x.es']);
    expect(JSON.stringify([st.leads, st.subs, st.events, st.msgs, st.supp, st.proofs, st.requests])).not.toContain('laura');
    expect(await demoLeadsDb().suppressed(ENJOY, { email: 'laura@salax.es', phone: '+34600123123' })).toEqual({ email: true, whatsapp: true });
    expect(st.requests![0]).toMatchObject({ kind: 'erase', byUser: 'u1', subjectHash: subjectHash('laura@salax.es', SECRET) });
    const again = await subjectData(pdb, ENJOY, 'laura@salax.es', SECRET);
    expect(again).toMatchObject({ leads: [], proofs: 1 });
    expect(again.suppression.length).toBeGreaterThan(0);
  });
});

describe('WhatsApp 2 (Utility)', () => {
  beforeEach(() => { resetDemoLeads(); demoWhatsAppOutbox().length = 0; });
  const wa = (over: Record<string, unknown> = {}) => ({ ...demoLeadsStore().settings[0], whatsappEnabled: true, whatsappPhoneId: '123456789', whatsappTemplates: { wa1: { es: 't1' }, wa2: { es: 't2' } }, ...over });
  test('apagado en el espacio: sale el 1 y no se programa el 2', async () => {
    const s = wa({ whatsappWa2: false });
    demoLeadsStore().settings = [s];
    await intake(deps('2026-11-03T10:00:00Z', { settings: s, whatsappReady: true }), body());
    expect(demoLeadsStore().msgs.map((m) => m.step).sort()).toEqual(['autoreply', 'notify', 'wa1']);
  });
  test('apagado después de programarlo: se cancela al ir a enviarlo', async () => {
    const s = wa();
    demoLeadsStore().settings = [s];
    await intake(deps('2026-11-03T10:00:00Z', { settings: s, whatsappReady: true }), body());
    demoLeadsStore().settings = [{ ...s, whatsappWa2: false }];
    await processDue({ db: demoLeadsDb(), mailer: null, whatsapp: demoWhatsApp, now: new Date('2026-11-10T10:00:00Z'), secret: SECRET });
    expect(demoWhatsAppOutbox().map((x) => x.template)).toEqual(['t1']);
    expect(demoLeadsStore().msgs.find((m) => m.step === 'wa2')).toMatchObject({ status: 'cancelled', error: 'WhatsApp 2 desactivado en Ajustes' });
  });
  test('sin enlace de reserva no hay WhatsApp 2', async () => {
    const s = wa({ bookingUrl: null, media: {} });
    demoLeadsStore().settings = [s];
    await intake(deps('2026-11-03T10:00:00Z', { settings: s, whatsappReady: true }), body());
    expect(demoLeadsStore().msgs.some((m) => m.step === 'wa2')).toBe(false);
  });
  test('los textos por defecto no tienen lenguaje comercial y responden a su solicitud', () => {
    for (const l of ['es', 'en', 'fr'] as const) {
      for (const k of ['wa1', 'wa2'] as const) {
        const t = DEFAULT_TEXTS[l][k];
        expect(t).not.toMatch(/descuento|oferta|gratis|promo|discount|offer|free|réduction|offre|gratuit|vídeo|video|vidéo/i);
        expect(t).toMatch(/solicitud|request|demande/i);
        expect(t.match(/\{\{[123]\}\}/g)).toHaveLength(3);
        expect(t).not.toMatch(/^\{\{|\}\}$/);
      }
    }
  });
});
