/** Contrato de comisiones: el mismo recorrido en demo y en Postgres + PostgREST + RLS (triggers del libro incluidos). */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext } from '../admin/auth';
import type { AdminDb } from '../admin/db';
import { AdminError } from '../admin/service';
import type { AccountsDb } from '../accounts/db';
import type { EvidenceDb } from '../evidence/db';
import type { NotifyDb } from '../notify/db';
import type { PlaybookDb } from '../playbook/db';
import type { TenantContext } from '../types';
import type { CommissionsDb, IngestDb } from './db';
import { ingest } from './ingest';
import { hashKey } from './service';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' },
  dj: { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' },
};
const tenant: TenantContext = { id: ENJOY, slug: 'enjoy', name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never };
const today = () => new Date().toISOString().slice(0, 10);
const thisPeriod = () => new Date().toISOString().slice(0, 7);

export interface CommissionsEnv {
  reset(): Promise<void>;
  adminDbFor(u: string): AdminDb; partnerDbFor(u: string): AdminDb; playbookDbFor(u: string): PlaybookDb; evidenceDbFor(u: string): EvidenceDb;
  notifyDbFor(u: string): NotifyDb; accountsDbFor(u: string): AccountsDb; commissionsDbFor(u: string): CommissionsDb;
  /** Servidor con service role (API). */
  ingestDb(): IngestDb;
  lead: { id: string; email: string };
}

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
}

export function commissionsContract(name: string, env: () => CommissionsEnv) {
  describe(`comisiones · ${name}`, () => {
    let E: CommissionsEnv;
    const ctx = async (u: { id: string; email: string }) => {
      const r = await buildAdminContext(E.adminDbFor(u.id), { id: u.id, email: u.email, name: null }, tenant, 'demo', {
        identity: null, assets: { async upload() { throw new Error('x'); } }, supabase: null,
        playbookDb: E.playbookDbFor(u.id), evidenceDb: E.evidenceDbFor(u.id), partnerDb: () => E.partnerDbFor(u.id),
        notifyDb: E.notifyDbFor(u.id), accountsDb: (id) => E.accountsDbFor(id), commissionsDb: (id) => E.commissionsDbFor(id),
      });
      if (r.kind !== 'ok') throw new Error(`login ${u.email}: ${r.kind}`);
      return r.admin;
    };
    beforeEach(async () => { E = env(); await E.reset(); });

    async function wonDossier(who: Awaited<ReturnType<typeof ctx>>, title: string, extra: Record<string, unknown> = {}) {
      const id = await who.service.createDossier({ title, ...extra });
      await who.service.apply(id, { op: 'setOutcome', outcome: 'won' });
      return id;
    }

    test('MVP de punta a punta: «todo igual 30 %», venta declarada, confirmada, aprobada, liquidada y pagada', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      await rejects(rep.commissions.setFlat(50), 403);
      await admin.commissions.setFlat(30);
      expect((await admin.commissions.plans()).plans).toMatchObject([{ name: 'General', isDefault: true, rules: [{ id: 'todo-igual', pay: { type: 'percent', bps: 3000 } }] }]);

      const d = await wonDossier(rep, 'Boda Laura');
      await rep.commissions.declareSale(d, { amount: '1.000', offer: 'pack-1000', occurredAt: today() });
      await rejects(rep.commissions.declareSale(d, { amount: '1.000', occurredAt: today() }), 409);  // doble clic
      await rejects(rep.commissions.confirmEvent((await rep.commissions.events())[0].id), 403);
      expect((await admin.notifications.feed()).items.some((n) => n.kind === 'sale_to_confirm')).toBe(true);

      // Pendiente de confirmar: no genera nada.
      expect((await admin.commissions.process()).created).toBe(0);
      const ev = (await admin.commissions.events({ status: 'pending' }))[0];
      await admin.commissions.confirmEvent(ev.id);
      expect((await admin.commissions.process()).created).toBe(1);
      expect((await admin.commissions.process()).created).toBe(0);  // idempotente

      const mine = await rep.commissions.mine();
      expect(mine.entries).toMatchObject([{ kind: 'commission', amountCents: 30_000, baseCents: 100_000, status: 'pending', ruleLabel: 'Todo igual: 30 %' }]);
      expect(mine.totals.pending).toBe(30_000);

      // La jefa ve el equipo pero no aprueba.
      const lead = await ctx(E.lead);
      expect((await lead.commissions.team()).totals.pending).toBe(30_000);
      await rejects(lead.commissions.approvePeriod(thisPeriod()), 403);

      expect(await admin.commissions.approvePeriod(thisPeriod())).toBe(1);
      expect((await admin.commissions.settle(thisPeriod())).created).toBe(1);
      const payout = (await admin.commissions.team()).payouts[0];
      expect(payout).toMatchObject({ userId: U.rep.id, totalCents: 30_000, status: 'open' });
      await admin.commissions.markPaid(payout.id);
      const after = await rep.commissions.mine();
      expect(after.totals).toMatchObject({ paid: 30_000, pending: 0, approved: 0 });
      expect(after.payouts[0].status).toBe('paid');
      await rejects(admin.commissions.voidEntries([after.entries[0].id]), 409);   // lo pagado no se anula
      await rejects(admin.commissions.voidEvent(ev.id), 409);                       // ni su ingreso
      expect((await rep.notifications.feed()).items.map((n) => n.kind)).toEqual(expect.arrayContaining(['payout_ready', 'payout_paid']));
    });

    test('excepciones por paquete y por rol; recalcular respeta lo aprobado', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      const planId = await admin.commissions.setFlat(30);
      await admin.commissions.addRule(planId, { label: 'Paquete grande', when: { offers: ['pack-3000'] }, pay: { type: 'percent', pct: 10 } });
      await admin.commissions.addRule(planId, { label: 'Colaboradores', when: { roles: ['partner'] }, pay: { type: 'percent', pct: '20' } });
      expect((await admin.commissions.plans()).plans[0].rules.map((r) => r.label)).toEqual(['Paquete grande', 'Colaboradores', 'Todo igual: 30 %']);

      const d1 = await wonDossier(rep, 'Grande');
      await rep.commissions.declareSale(d1, { amount: '3000', offer: 'pack-3000', occurredAt: today() });
      const dj = await ctx(U.dj);
      const d2 = await wonDossier(dj, 'DJ', { partnerAccountId: dj.session.partner!.accounts[0].id });
      await dj.commissions.declareSale(d2, { amount: '500', occurredAt: today() });
      for (const e of await admin.commissions.events({ status: 'pending' })) await admin.commissions.confirmEvent(e.id);
      await admin.commissions.process();
      const team = await admin.commissions.team();
      expect(team.entries.map((e) => [e.userId, e.amountCents]).sort()).toEqual([[U.dj.id, 10_000], [U.rep.id, 30_000]].sort());
      expect((await dj.commissions.mine()).entries).toHaveLength(1);  // el colaborador solo ve lo suyo

      // Aprobar lo de la comercial; cambiar el plan y recalcular: lo aprobado no se toca.
      await admin.commissions.approve(team.entries.filter((e) => e.userId === U.rep.id).map((e) => e.id));
      await admin.commissions.setFlat(40);
      await admin.commissions.removeRule(planId, (await admin.commissions.plans()).plans[0].rules[1].id);  // quitar «Colaboradores»
      const r = await admin.commissions.recalculate();
      expect(r).toMatchObject({ removed: 1, created: 1 });
      const again = (await admin.commissions.team()).entries;
      expect(again.find((e) => e.userId === U.rep.id)).toMatchObject({ amountCents: 30_000, status: 'approved' });
      expect(again.find((e) => e.userId === U.dj.id)).toMatchObject({ amountCents: 20_000, status: 'pending' });
    });

    test('API con clave: Oquea, 70 % del 3 % los 6 primeros meses; devolución; reintento idempotente', async () => {
      const admin = await ctx(U.admin);
      const planId = await admin.commissions.setFlat(30);
      await admin.commissions.addRule(planId, { label: 'Pasarela: 70 % del 3 %, 6 meses', when: { kinds: ['volume'], monthsFrom: 0, monthsTo: 6 }, pay: { type: 'percent', pct: 70 } });
      const acc = await (await ctx(U.rep)).accounts.create({ name: 'Centro Azul', externalRef: 'oquea:c1' });
      const key = await admin.commissions.createApiKey('Pasarela Oquea');
      expect(key).toMatch(/^ss_live_/);
      expect((await admin.commissions.apiKeys())[0]).toMatchObject({ name: 'Pasarela Oquea', prefix: key.slice(0, 12) });
      const t = await E.ingestDb().tenantForKey(hashKey(key));
      expect(t?.tenantId).toBe(ENJOY);
      expect(await E.ingestDb().tenantForKey(hashKey('ss_live_falsa'))).toBeNull();

      const at = new Date().toISOString();
      const batch = [{ external_id: 'oq-1', kind: 'volume', occurred_at: at, amount: '9000', take_rate: 3, account_ref: 'oquea:c1', seller_email: 'rep@enjoy.test', quantity: 35 }];
      expect(await ingest(E.ingestDb(), ENJOY, 'oquea', batch)).toMatchObject({ created: 1 });
      expect(await ingest(E.ingestDb(), ENJOY, 'oquea', batch)).toMatchObject({ created: 0, duplicates: 1 });
      await admin.commissions.process();
      let rep = (await (await ctx(U.rep)).commissions.mine()).entries;
      expect(rep).toMatchObject([{ amountCents: 18_900, baseCents: 27_000, ruleLabel: 'Pasarela: 70 % del 3 %, 6 meses', accountId: acc }]);

      expect(await ingest(E.ingestDb(), ENJOY, 'oquea', [{ external_id: 'oq-1-r', kind: 'refund', occurred_at: at, amount: '3000', refunds_external_id: 'oq-1' }])).toMatchObject({ created: 1 });
      await admin.commissions.process();
      rep = (await (await ctx(U.rep)).commissions.mine()).entries;
      expect(rep.reduce((s, e) => s + e.amountCents, 0)).toBe(12_600);  // 9.000 → 6.000 € procesados
      await admin.commissions.revokeApiKey((await admin.commissions.apiKeys())[0].id);
      expect(await E.ingestDb().tenantForKey(hashKey(key))).toBeNull();
    });

    test('cupones: el admin los crea, el equipo los aplica, la propuesta guarda una copia', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      await rejects(rep.commissions.saveCoupon({ code: 'MIO', label: 'x', kind: 'percent', value: '90' }), 403);
      await rejects(admin.commissions.saveCoupon({ code: 'mal código', label: 'x', kind: 'percent', value: '10' }), 422);
      await admin.commissions.saveCoupon({ code: 'lanza30', label: '30 % de lanzamiento', kind: 'percent', value: '30', maxUses: '1' });
      const [c] = await rep.commissions.coupons();
      expect(c).toMatchObject({ code: 'LANZA30', value: 3000, uses: 0 });

      const d = await rep.service.createDossier({ title: 'Con cupón' });
      await rep.service.apply(d, { op: 'update', patch: { priceMode: 'total', totalPrice: 1000 } });
      await rep.service.apply(d, { op: 'setCoupon', couponId: c.id });
      const st = await rep.service.getState(d);
      expect(st.dossier.discount).toEqual({ code: 'LANZA30', label: '30 % de lanzamiento', kind: 'percent', value: 3000 });
      expect(st.total).toMatchObject({ amount: 700, before: { amount: 1000 }, discount: { code: 'LANZA30' } });

      // Sin usos libres: ni aparece ni se puede aplicar a otra.
      expect(await rep.commissions.coupons()).toEqual([]);
      const d2 = await rep.service.createDossier({ title: 'Otra' });
      await rejects(rep.service.apply(d2, { op: 'setCoupon', couponId: c.id }), 409);
      // Desactivarlo no cambia lo ya aplicado; quitarlo, sí.
      await admin.commissions.setCouponActive(c.id, false);
      expect((await rep.service.getState(d)).total?.amount).toBe(700);
      await rep.service.apply(d, { op: 'setCoupon', couponId: null });
      expect((await rep.service.getState(d)).total).toMatchObject({ amount: 1000 });
      expect((await rep.service.getState(d)).total?.before).toBeUndefined();

      const dj = await ctx(U.dj);
      const dd = await dj.service.createDossier({ title: 'DJ', partnerAccountId: dj.session.partner!.accounts[0].id });
      await rejects(dj.service.apply(dd, { op: 'setCoupon', couponId: c.id }), 403);
    });

    test('condiciones opcionales: invisibles hasta que se acuerdan; cada uno ve las suyas', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      const dj = await ctx(U.dj);
      await admin.commissions.setFlat(30);
      const colab = await admin.commissions.savePlan({ name: 'Colaboradores', rules: [{ label: '20 % por paquete', pay: { type: 'percent', pct: 20 } }] });
      await admin.commissions.assignPlan(U.dj.id, colab);
      expect(await rep.commissions.myConditions()).toMatchObject({ visible: false, plan: null });
      await rejects(rep.commissions.setConditions(U.rep.id, { visible: true }), 403);
      await admin.commissions.setConditions(U.rep.id, { visible: true, note: 'Revisamos en enero' });
      await admin.commissions.setConditions(U.dj.id, { visible: true });
      expect(await rep.commissions.myConditions()).toMatchObject({ visible: true, note: 'Revisamos en enero', plan: { name: 'General' } });
      expect((await dj.commissions.myConditions()).plan?.name).toBe('Colaboradores');
      expect((await admin.commissions.conditions()).filter((c) => c.visible)).toHaveLength(2);
      await admin.commissions.setConditions(U.rep.id, { visible: false });
      expect((await rep.commissions.myConditions()).visible).toBe(false);
    });

    test('ajustes con motivo y liquidaciones que no pagan saldos negativos', async () => {
      const admin = await ctx(U.admin);
      await admin.commissions.setFlat(30);
      await rejects(admin.commissions.adjust({ userId: U.rep.id, amount: '-50', reason: ' ' }), 422);
      await admin.commissions.adjust({ userId: U.rep.id, amount: '-50', reason: 'Descuento acordado' });
      await admin.commissions.approvePeriod(thisPeriod());
      expect(await admin.commissions.settle(thisPeriod())).toEqual({ created: 0, held: 1 });
      await admin.commissions.adjust({ userId: U.rep.id, amount: '80', reason: 'Bonus de campaña' });
      await admin.commissions.approvePeriod(thisPeriod());
      expect((await admin.commissions.settle(thisPeriod())).created).toBe(1);
      expect((await admin.commissions.team()).payouts[0].totalCents).toBe(3_000);
      await rejects(admin.commissions.settle('2026-13'), 422);
    });
  });
}
