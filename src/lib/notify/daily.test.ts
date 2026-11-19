import { beforeEach, describe, expect, test } from 'vitest';
import { composeHref, dailyDue, dailyPlan, localClock, meetingsToday, type DailyDossier } from './daily';
import { dailyEmail, meetingsEmail, runDailyDigest } from './daily-job';
import { demoNotifyJobDb } from './db-demo';
import { demoDb, resetDemoDb } from '../data/store';
import type { Email } from './mailer';

const ME = 'u-me';
const now = new Date('2026-10-05T06:30:00Z'); // lunes, 8:30 en Madrid, 15:30 en Seúl
const d = (id: string, over: Partial<DailyDossier> = {}): DailyDossier => ({
  id, tenantId: 't', authorId: ME, title: `Propuesta ${id}`, company: `Empresa ${id}`, status: 'published', outcome: 'open',
  nextStep: null, nextStepAt: null, publishedAt: '2026-10-01T10:00:00Z', ...over,
});

describe('cuándo se envía', () => {
  test('a partir de las 7:00 locales y hasta las 12:00, una vez al día', () => {
    expect(localClock(now, 'Europe/Madrid')).toEqual({ day: '2026-10-05', hour: 8 });
    expect(dailyDue(now, 'Europe/Madrid', false).due).toBe(true);
    expect(dailyDue(now, 'Europe/Madrid', true).due).toBe(false);
    expect(dailyDue(now, 'Asia/Seoul', false).due).toBe(false);           // 15:30 en Seúl: ya pasó la ventana
    expect(dailyDue(new Date('2026-10-04T22:30:00Z'), 'Asia/Seoul', false).due).toBe(true); // 7:30 en Seúl
    expect(dailyDue(new Date('2026-10-05T04:00:00Z'), 'Europe/Madrid', false).due).toBe(false); // 6:00 en Madrid
    expect(localClock(now, 'No/Existe').day).toBe('2026-10-05');            // zona inválida → Madrid
  });
});

describe('qué entra', () => {
  test('cada propuesta una vez, en su motivo más urgente, y solo las mías', () => {
    const plan = dailyPlan({ userId: ME, manager: false }, [
      d('vencida', { nextStep: 'Llamar', nextStepAt: '2026-10-04T09:00:00Z' }),
      d('hoy', { nextStep: 'Enviar precio', nextStepAt: '2026-10-05T15:00:00Z' }),
      d('abierta'),
      d('sin-paso'),
      d('reciente', { publishedAt: '2026-10-05T05:00:00Z' }),           // publicada hace 1 h: aún no molesta
      d('ganada', { outcome: 'won', nextStepAt: '2026-10-01T09:00:00Z' }),
      d('borrador', { status: 'draft' }),
      d('de-otro', { authorId: 'u-otro', nextStepAt: '2026-10-01T09:00:00Z' }),
    ], new Map([['abierta', { opens: 2, lastAt: '2026-10-05T05:00:00Z' }], ['vencida', { opens: 1, lastAt: '2026-10-05T04:00:00Z' }]]), now, 'Europe/Madrid');
    expect(plan.items.map((i) => [i.dossier.id, i.reason])).toEqual([
      ['vencida', 'overdue'], ['hoy', 'today'], ['abierta', 'opened'], ['sin-paso', 'noNextStep'],
    ]);
    expect(plan.items[0].opened?.opens).toBe(1);   // la vencida también dice que la han abierto
    expect(plan.team).toBeNull();
  });

  test('aplazada a una fecha (la suya o la de su empresa): nada hasta ese día, ni aunque la abran', () => {
    const plan = dailyPlan({ userId: ME, manager: true }, [
      d('enero', { nextStepAt: '2027-01-10T09:00:00Z' }),
      d('empresa-enero', { accountNextStepAt: '2027-01-10T09:00:00Z' }),
      d('vieja', { nextStepAt: '2026-10-01T09:00:00Z', accountNextStepAt: '2027-01-10T09:00:00Z' }), // la empresa manda
      d('empresa-vencida', { accountNextStepAt: '2026-10-01T09:00:00Z' }),
      d('otro', { authorId: 'ana', nextStepAt: '2026-10-01T09:00:00Z', accountNextStepAt: '2027-01-10T09:00:00Z' }),
    ], new Map([['enero', { opens: 3, lastAt: '2026-10-05T05:00:00Z' }], ['empresa-enero', { opens: 1, lastAt: '2026-10-05T05:00:00Z' }]]), now, 'Europe/Madrid');
    // La de la empresa con fecha pasada tampoco cuenta como «sin próximo paso» (ya lo tiene, aunque esté por hacer en el CRM).
    expect(plan.items.map((i) => i.dossier.id)).toEqual([]);
    expect(plan.team).toBeNull();
  });

  test('sin próximo paso: como mucho 5', () => {
    const plan = dailyPlan({ userId: ME, manager: false }, Array.from({ length: 8 }, (_, i) => d(`s${i}`)), new Map(), now, 'Europe/Madrid');
    expect(plan.items).toHaveLength(5);
  });

  test('jefes: además, cómo va el equipo', () => {
    const plan = dailyPlan({ userId: ME, manager: true }, [
      d('a', { authorId: 'ana', nextStepAt: '2026-10-01T09:00:00Z' }), d('b', { authorId: 'ana', nextStepAt: '2026-10-02T09:00:00Z' }),
      d('c', { authorId: 'luis', nextStepAt: '2026-10-03T09:00:00Z' }), d('e', { authorId: 'luis' }),
    ], new Map([['e', { opens: 1, lastAt: '2026-10-05T05:00:00Z' }]]), now, 'Europe/Madrid');
    expect(plan.team).toEqual({ overdue: 3, openedNoStep: 1, people: [{ userId: 'ana', overdue: 2 }, { userId: 'luis', overdue: 1 }] });
  });

  test('el enlace abre «Preparar mensaje» con la propuesta y el tipo que toca', () => {
    expect(composeHref(d('x'), 'overdue')).toBe('/admin/compose?dossier=x&type=seguimiento&go=1');
    expect(composeHref(d('x'), 'opened')).toBe('/admin/compose?dossier=x&type=tras_reunion&go=1');
  });
});

describe('email', () => {
  test('en el idioma de la persona, con hora local y sin nada que no sea suyo', () => {
    const plan = dailyPlan({ userId: ME, manager: false }, [d('v', { nextStep: 'Llamar', nextStepAt: '2026-10-04T09:00:00Z' })], new Map(), now, 'Europe/Madrid');
    const member = { userId: ME, tenantId: 't', role: 'rep', email: 'a@b.c', name: 'Amrit Singh', locale: 'es', timezone: 'Europe/Madrid', daily: true };
    const m = dailyEmail({ plan, member, tenant: { id: 't', name: 'Enjoy', hostname: 'enjoy.ventas.cofundo.io' }, base: 'https://enjoy.ventas.cofundo.io', names: new Map(), now });
    expect(m.subject).toBe('Enjoy: 1 cosa para hoy');
    expect(m.html).toContain('Hola, Amrit:');
    expect(m.html).toContain('Vencidos · 1');
    expect(m.html).toContain('Empresa v · Propuesta v');
    const same = dailyEmail({ plan: { ...plan, items: plan.items.map((i) => ({ ...i, dossier: { ...i.dossier, title: 'Empresa v · Bodas' } })) }, member, tenant: undefined, base: 'https://x', names: new Map(), now });
    expect(same.html).not.toContain('Empresa v · Empresa v');
    expect(m.html).toContain('https://enjoy.ventas.cofundo.io/admin/compose?dossier=v&amp;type=seguimiento&amp;go=1');
    expect(m.text).toContain('Llamar · dom, 4 oct, 11:00');   // 9:00 UTC = 11:00 en Madrid
    const ko = dailyEmail({ plan, member: { ...member, locale: 'ko', timezone: 'Asia/Seoul' }, tenant: undefined, base: 'https://x', names: new Map(), now });
    expect(ko.subject).toContain('오늘 할 일 1건');
  });
});

describe('envío (cron)', () => {
  const REP = '11111111-1111-4111-8111-111111111111';
  let sent: Email[];
  const mailer = { async send(e: Email) { sent.push(e); } };
  beforeEach(() => { resetDemoDb(); sent = []; });

  test('a las 8:30 de Madrid: el comercial recibe su día; repetir no duplica; sin nada que mover, no hay email', async () => {
    const s = demoDb();
    for (const x of s.dossier) if (x.author_id === REP) x.next_step_at = '2026-10-04T09:00:00Z';
    const r1 = await runDailyDigest(demoNotifyJobDb(), mailer, { now, fallbackOrigin: 'http://localhost' });
    const mine = sent.filter((e) => e.to === 'rep@enjoy.test');
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toMatch(/^Enjoy the Club: \d+ cosas? para hoy$/);
    expect(mine[0].tag).toBe('daily');
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    const r2 = await runDailyDigest(demoNotifyJobDb(), mailer, { now: new Date(now.getTime() + 600_000), fallbackOrigin: 'http://localhost' });
    expect(r2.sent).toBe(0);
    expect(sent.filter((e) => e.to === 'rep@enjoy.test')).toHaveLength(1);
  });

  test('quien lo desactiva, o desactiva los emails, no lo recibe', async () => {
    const s = demoDb();
    for (const x of s.dossier) if (x.author_id === REP) x.next_step_at = '2026-10-04T09:00:00Z';
    s.users.find((u) => u.id === REP)!.daily_digest = false;
    await runDailyDigest(demoNotifyJobDb(), mailer, { now, fallbackOrigin: 'http://localhost' });
    expect(sent.filter((e) => e.to === 'rep@enjoy.test')).toHaveLength(0);
  });

  test('reuniones de hoy: correo aparte e importante, y no se repiten en «Para hoy»', async () => {
    const s = demoDb();
    for (const x of s.dossier) if (x.author_id === REP) { x.next_step_at = null; x.published_at = '2026-10-05T05:00:00Z'; }
    const acc = s.account.find((a) => a.tenant_id === '00000000-0000-4000-8000-000000000e01')!;
    Object.assign(acc, { owner_id: REP, next_channel: 'meeting', next_step: 'Enseñar la demo al dueño', next_step_at: '2026-10-05T15:00:00Z' });
    const d = s.dossier.find((x) => x.author_id === REP)!;
    Object.assign(d, { next_step: 'Reunión con el gerente', next_step_at: '2026-10-05T10:30:00Z', outcome: 'open', status: 'published' });
    await runDailyDigest(demoNotifyJobDb(), mailer, { now, fallbackOrigin: 'http://localhost' });
    const mine = sent.filter((e) => e.to === 'rep@enjoy.test');
    const imp = mine.find((e) => e.tag === 'meetings')!;
    expect(imp.subject).toBe('🔴 Importante · Hoy tienes 2 reuniones, la primera a las 12:30 (Enjoy the Club)');
    expect(imp.headers).toMatchObject({ Importance: 'high' });
    expect(imp.html).toContain('Importante');
    expect(imp.text).toContain(`17:00 · ${acc.name}`);
    // La propuesta de la reunión no vuelve a salir en el resumen.
    const daily = mine.find((e) => e.tag === 'daily');
    expect(daily?.text ?? '').not.toContain('Reunión con el gerente');
  });

  test('qué es una reunión de hoy', () => {
    const rows = [
      { id: 'a', tenantId: 't', ownerId: ME, name: 'Havana', nextStep: 'Demo', nextStepAt: '2026-10-05T15:00:00Z', nextChannel: 'meeting', contactName: 'José María' },
      { id: 'b', tenantId: 't', ownerId: ME, name: 'Club Sol', nextStep: 'Llamar', nextStepAt: '2026-10-05T15:00:00Z', nextChannel: 'phone', contactName: null },
      { id: 'c', tenantId: 't', ownerId: ME, name: 'Mañana', nextStep: null, nextStepAt: '2026-10-06T09:00:00Z', nextChannel: 'meeting', contactName: null },
      { id: 'e', tenantId: 't', ownerId: 'otro', name: 'Ajena', nextStep: null, nextStepAt: '2026-10-05T09:00:00Z', nextChannel: 'meeting', contactName: null },
    ];
    const ms = meetingsToday(ME, rows, [d('p', { nextStep: 'Cita con el dueño', nextStepAt: '2026-10-05T08:00:00Z' }), d('q', { nextStep: 'Enviar precio', nextStepAt: '2026-10-05T08:00:00Z' })], now, 'Europe/Madrid');
    expect(ms.map((x) => x.id)).toEqual(['p', 'a']);
    const one = meetingsEmail({ meetings: ms.slice(1), member: { userId: ME, tenantId: 't', role: 'rep', email: 'x@y', name: 'Ana', locale: 'en', timezone: 'Europe/Madrid', daily: true }, tenant: undefined, base: 'https://x' });
    expect(one.subject).toBe('🔴 Important · Meeting with Havana today at 17:00 (Ventas)');
    expect(one.text).toContain('with José María');
  });

  test('fuera de hora no se envía salvo forzado', async () => {
    const s = demoDb();
    for (const x of s.dossier) if (x.author_id === REP) x.next_step_at = '2026-10-04T09:00:00Z';
    const early = new Date('2026-10-05T03:00:00Z');
    expect((await runDailyDigest(demoNotifyJobDb(), mailer, { now: early, fallbackOrigin: 'http://x' })).sent).toBe(0);
    expect((await runDailyDigest(demoNotifyJobDb(), mailer, { now: early, fallbackOrigin: 'http://x', force: true })).sent).toBeGreaterThanOrEqual(1);
  });
});
