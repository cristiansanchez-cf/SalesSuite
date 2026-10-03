import { beforeEach, describe, expect, test } from 'vitest';
import { composeHref, dailyDue, dailyPlan, localClock, type DailyDossier } from './daily';
import { dailyEmail, runDailyDigest } from './daily-job';
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

  test('fuera de hora no se envía salvo forzado', async () => {
    const s = demoDb();
    for (const x of s.dossier) if (x.author_id === REP) x.next_step_at = '2026-10-04T09:00:00Z';
    const early = new Date('2026-10-05T03:00:00Z');
    expect((await runDailyDigest(demoNotifyJobDb(), mailer, { now: early, fallbackOrigin: 'http://x' })).sent).toBe(0);
    expect((await runDailyDigest(demoNotifyJobDb(), mailer, { now: early, fallbackOrigin: 'http://x', force: true })).sent).toBeGreaterThanOrEqual(1);
  });
});
