/** Contrato de zonas y cuentas: igual en demo y en Postgres + PostgREST + RLS (triggers y RPC incluidos). */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext } from '../admin/auth';
import type { AdminDb } from '../admin/db';
import { AdminError } from '../admin/service';
import type { EvidenceDb } from '../evidence/db';
import type { NotifyDb } from '../notify/db';
import type { PlaybookDb } from '../playbook/db';
import type { TenantContext } from '../types';
import type { AccountsDb } from './db';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' },
  dj: { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' },
};
const tenant: TenantContext = { id: ENJOY, slug: 'enjoy', name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never };

export interface AccountsEnv {
  reset(): Promise<void>;
  adminDbFor(userId: string): AdminDb;
  partnerDbFor(userId: string): AdminDb;
  playbookDbFor(userId: string): PlaybookDb;
  evidenceDbFor(userId: string): EvidenceDb;
  notifyDbFor(userId: string): NotifyDb;
  accountsDbFor(userId: string): AccountsDb;
  /** Segundo comercial (lo crea el entorno). */
  rep2: { id: string; email: string };
  /** Simula el paso del tiempo: caduca la reserva de una cuenta. */
  expireClaim(accountId: string): Promise<void>;
}

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
}

export function accountsContract(name: string, env: () => AccountsEnv) {
  describe(`zonas y cuentas · ${name}`, () => {
    let E: AccountsEnv;
    const ctx = async (u: { id: string; email: string }) => {
      const r = await buildAdminContext(E.adminDbFor(u.id), { id: u.id, email: u.email, name: null }, tenant, 'demo', {
        identity: null, assets: { async upload() { throw new Error('x'); } }, supabase: null,
        playbookDb: E.playbookDbFor(u.id), evidenceDb: E.evidenceDbFor(u.id), partnerDb: () => E.partnerDbFor(u.id),
        notifyDb: E.notifyDbFor(u.id), accountsDb: (id) => E.accountsDbFor(id),
      });
      if (r.kind !== 'ok') throw new Error(`login ${u.email}: ${r.kind}`);
      return r.admin;
    };
    beforeEach(async () => { E = env(); await E.reset(); });

    /** España › Comunidad Valenciana › {Valencia, Castellón} y Madrid; rep en la Comunidad, rep2 en Madrid. */
    async function territory() {
      const admin = await ctx(U.admin);
      const es = await admin.accounts.saveZone({ name: 'España', kind: 'country' });
      const cv = await admin.accounts.saveZone({ name: 'Comunidad Valenciana', kind: 'region', parentId: es });
      const vlc = await admin.accounts.saveZone({ name: 'Valencia', parentId: cv });
      const cs = await admin.accounts.saveZone({ name: 'Castellón', parentId: cv });
      const mad = await admin.accounts.saveZone({ name: 'Madrid', parentId: es });
      await admin.accounts.setAssignments(U.rep.id, [cv]);
      await admin.accounts.setAssignments(E.rep2.id, [mad]);
      return { admin, es, cv, vlc, cs, mad };
    }

    test('territorio: solo el admin lo define; el comercial ve sus cuentas de zona y a sus compañeros', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      await rejects(rep.accounts.saveZone({ name: 'Mi zona' }), 403);
      await rejects(t.admin.accounts.saveZone({ name: 'valencia', parentId: t.cv }), 409);
      await rejects(t.admin.accounts.saveZone({ name: 'España', parentId: t.vlc }, t.es), 422);  // ciclo
      const r = await t.admin.accounts.importCsv('nombre;ciudad;referencia\nClub Sol;Valencia;gmaps:1\nTerraza Azahar;castellon;gmaps:2\nSala Gran Vía;Madrid;\nSala X;Murcia;\nClub Sol bis;Valencia;gmaps:1');
      expect(r).toMatchObject({ created: 4, duplicates: 1, unknownZones: ['Murcia'] });

      const list = await rep.accounts.list();
      expect(list.scope).toBe('zone');
      expect(list.items.map((a) => a.name)).toEqual(['Club Sol', 'Terraza Azahar']);  // su zona: la Comunidad incluye sus ciudades
      expect(list.items[0]).toMatchObject({ state: 'free', zonePath: 'España › Comunidad Valenciana › Valencia' });
      expect((await rep.accounts.list({ scope: 'all' })).items).toHaveLength(4);

      // Compañeros de zona: el jefe de Valencia ve al de la Comunidad; Madrid no se cruza.
      const ana = await ctx(E.rep2);
      expect(await ana.accounts.colleagues()).toEqual([]);
      await t.admin.accounts.setAssignments(t.admin.session.userId, [t.vlc]);
      expect((await rep.accounts.colleagues()).map((c) => c.email)).toEqual(['admin@enjoy.test']);

      // El colaborador no ve el CRM.
      await rejects((await ctx(U.dj)).accounts.list(), 403);
    });

    test('reserva: quien la trabaja la tiene; el otro no puede «bombardearla»; caduca', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      const ana = await ctx(E.rep2);
      const sol = await t.admin.accounts.create({ name: 'Club Sol', zoneId: t.vlc });
      expect((await rep.accounts.get(sol)).account.state).toBe('free');
      expect(await rep.accounts.touch(sol, 'contact', 'Llamada al dueño')).toBe('eligible');
      const mine = await rep.accounts.get(sol);
      expect(mine.account.state).toBe('mine');
      expect(mine.touches.map((x) => x.kind)).toContain('contact');
      expect(await ana.accounts.touch(sol, 'contact')).toBe('claimed_by_other');
      expect((await ana.accounts.get(sol)).account).toMatchObject({ state: 'taken', ownerName: expect.stringMatching(/Comercial Enjoy|rep@enjoy.test/) });
      expect(await ana.accounts.preview(sol)).toBe('claimed_by_other');
      await rejects(ana.accounts.update(sol, { name: 'Mía' }), 403);
      await rejects(ana.accounts.block(sol, 'x'), 403);
      await rejects(ana.accounts.touch(sol, 'release'), 403);

      await E.expireClaim(sol);
      expect(await ana.accounts.touch(sol, 'claim')).toBe('eligible');
      expect((await rep.accounts.get(sol)).account.state).toBe('taken');

      // Alta propia: queda reservada para quien la crea.
      const nueva = await rep.accounts.create({ name: 'Bar Nuevo', zoneId: t.cs });
      expect((await rep.accounts.get(nueva)).account.state).toBe('mine');
      await rep.accounts.touch(nueva, 'release');
      expect((await rep.accounts.get(nueva)).account.state).toBe('free');
    });

    test('vender una cuenta ajena: sin comisión, el admin se entera y decide', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      const ana = await ctx(E.rep2);
      const sol = await t.admin.accounts.create({ name: 'Club Sol', zoneId: t.vlc });
      await rep.accounts.touch(sol, 'contact');

      const d = await ana.service.createDossier({ title: 'Sol por la puerta de atrás', accountId: sol });
      await ana.service.apply(d, { op: 'setOutcome', outcome: 'won' });
      expect((await ana.service.getState(d)).dossier).toMatchObject({ accountEligibility: 'claimed_by_other', accountDecision: null });
      expect((await rep.accounts.get(sol)).account.state).toBe('mine');  // sigue siendo de quien la trabajaba

      const feed = await t.admin.notifications.feed();
      const n = feed.items.find((x) => x.kind === 'account_conflict')!;
      expect(n).toMatchObject({ severity: 'action', open: true });
      expect(n.title).toContain('Club Sol');
      expect((await t.admin.accounts.conflicts()).map((x) => x.id)).toEqual([d]);
      await rejects(ana.accounts.decide(d, 'approved'), 403);
      await t.admin.accounts.decide(d, 'rejected');
      expect((await t.admin.accounts.conflicts())).toEqual([]);
      expect((await t.admin.notifications.feed()).items.find((x) => x.kind === 'account_conflict')!.open).toBe(false);

      // Quien la trabajaba la gana: cliente suyo; deshacerlo la devuelve a trabajo.
      const d2 = await rep.service.createDossier({ title: 'Sol', accountId: sol });
      await rep.service.apply(d2, { op: 'setOutcome', outcome: 'won' });
      expect((await rep.service.getState(d2)).dossier.accountEligibility).toBe('eligible');
      expect((await rep.accounts.get(sol)).account).toMatchObject({ state: 'my_customer', wonByName: expect.stringMatching(/Comercial Enjoy|rep@enjoy.test/) });
      expect((await ana.accounts.get(sol)).account.state).toBe('customer');
      await rep.service.apply(d2, { op: 'setOutcome', outcome: 'open' });
      expect((await rep.accounts.get(sol)).account.state).toBe('mine');
    });

    test('bloqueo y zonas estrictas', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      const ana = await ctx(E.rep2);
      const gv = await t.admin.accounts.create({ name: 'Sala Gran Vía', zoneId: t.mad });
      await rejects(t.admin.accounts.block(gv, ' '), 422);
      await t.admin.accounts.block(gv, 'El dueño no quiere más comerciales');
      expect(await ana.accounts.touch(gv, 'contact')).toBe('blocked');
      const g = await ana.accounts.get(gv);
      expect(g.account).toMatchObject({ state: 'blocked', blockedReason: 'El dueño no quiere más comerciales' });
      expect(g.touches.map((x) => x.kind)).toContain('block');
      await t.admin.accounts.unblock(gv);

      await rejects(rep.accounts.saveRules({ claimDays: 10, strictZones: true, requireAccount: false }), 403);
      await t.admin.accounts.saveRules({ claimDays: 10, strictZones: true, requireAccount: true });
      expect(await rep.accounts.touch(gv, 'contact')).toBe('out_of_zone');
      expect(await ana.accounts.touch(gv, 'contact')).toBe('eligible');
      const until = Date.parse((await ana.accounts.get(gv)).account.claimedUntil!);
      expect(Math.round((until - Date.now()) / 86_400_000)).toBe(10);

      // Con «exigir cuenta», una venta sin cuenta no genera comisión.
      const d = await rep.service.createDossier({ title: 'Sin cuenta' });
      await rep.service.apply(d, { op: 'setOutcome', outcome: 'won' });
      expect((await rep.service.getState(d)).dossier.accountEligibility).toBe('no_account');
    });

    test('asignar y vincular una propuesta existente', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      const sol = await t.admin.accounts.create({ name: 'Club Sol', zoneId: t.vlc });
      await t.admin.accounts.assign(sol, U.rep.id);
      const g = await rep.accounts.get(sol);
      expect(g.account.state).toBe('mine');
      expect(g.touches.map((x) => x.kind)).toContain('assign');
      const d = await rep.service.createDossier({ title: 'Sol' });
      await rep.service.apply(d, { op: 'setAccount', accountId: sol });
      expect((await rep.service.getState(d)).dossier.accountId).toBe(sol);
      expect((await rep.accounts.get(sol)).dossiers.map((x) => x.id)).toEqual([d]);
      const dj = await ctx(U.dj);
      await rejects(dj.service.createDossier({ title: 'x', partnerAccountId: dj.session.partner!.accounts[0].id, accountId: sol }), 422);
    });
  });
}
