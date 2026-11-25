import { beforeEach, expect, test } from 'vitest';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';

const REP = '11111111-1111-4111-8111-111111111111';
const SOL = '00000000-0000-4000-8000-0000000ac001';
beforeEach(() => { resetDemoDb(); process.env.AI_RESEARCH_FIXTURE = '1'; });

test('«hasta el 20 de enero, nada»: la reserva llega hasta entonces y la empresa no sale arriba ni resaltada', async () => {
  const admin = (await contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, REP))!;
  const far = new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10);
  await admin.crm.setNextStep(SOL, { at: far, step: 'Hablar de nuevo' });
  const a = (await admin.accounts.get(SOL)).account;
  expect(Date.parse(a.claimedUntil!)).toBeGreaterThan(Date.parse(`${far}T00:00:00Z`));
  const { items } = await admin.accounts.list({ scope: 'all' });
  const sol = items.find((x) => x.id === SOL)!;
  expect(sol.state).toBe('mine');
  expect(sol.parked).toBe(true);
  // Detrás de las libres; las tuyas con algo pendiente, arriba.
  const firstFree = items.findIndex((x) => x.state === 'free');
  expect(items.indexOf(sol)).toBeGreaterThan(firstFree);
  expect(items.slice(0, firstFree).every((x) => !x.parked)).toBe(true);
  // Con el próximo paso esta semana, vuelve arriba.
  await admin.crm.setNextStep(SOL, { at: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), step: 'Llamar' });
  const again = (await admin.accounts.list({ scope: 'all' })).items;
  expect(again.find((x) => x.id === SOL)!.parked).toBe(false);
  expect(again.findIndex((x) => x.id === SOL)).toBeLessThan(again.findIndex((x) => x.state === 'free'));
  expect(demoDb().account.find((x) => x.id === SOL)).toBeTruthy();
});
