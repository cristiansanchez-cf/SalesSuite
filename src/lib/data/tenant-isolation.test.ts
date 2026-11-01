/**
 * Aislamiento entre espacios (modo demo, mismo cableado que producción: buildAdminContext). Lo de un espacio no se ve
 * ni se toca desde otro, aunque se conozca el id. Se prueba con:
 *  · ALT_ADMIN: admin de «Re-tema» (otro espacio), sin nada en Enjoy;
 *  · DUAL: comercial en Enjoy y admin en Re-tema. Ser admin en un espacio no da poderes de admin en el otro.
 * En Supabase lo mismo lo garantiza la RLS (supabase/tests/*.test.sql, entre ellos 75_tenant_isolation.test.sql); aquí
 * se comprueba que la demo y los servicios lo respetan.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext, type AdminContext } from '../admin/auth';
import { demoAdminDb, demoAssets, demoIdentity } from '../admin/db-demo';
import { AdminError } from '../admin/service';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoAnalyticsDb } from '../analytics/db-demo';
import { demoCommissionsDb } from '../commissions/db-demo';
import { demoCrmDb } from '../crm/db-demo';
import { demoEvidenceDb } from '../evidence/db-demo';
import { demoNotifyDb } from '../notify/db-demo';
import { demoOrgDb } from '../org/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import type { TenantContext } from '../types';
import { demoDb, resetDemoDb } from './store';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const tenantOf = (id: string, slug: string): TenantContext => ({ id, slug, name: slug, defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never });
const ENJOY_T = tenantOf(ENJOY, 'enjoy');
const ALT_T = tenantOf(ALT, 'retheme-test');

const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' },
  altRep: { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test' },
  dj: { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' },
  altAdmin: { id: 'abababab-0000-4000-8000-0000000000a1', email: 'admin@retheme.test' },
  dual: { id: 'abababab-0000-4000-8000-0000000000a2', email: 'dual@retheme.test' },
};
// Datos de Enjoy del seed demo (src/lib/data/store.ts).
const CLUB_SOL = '00000000-0000-4000-8000-0000000ac001';      // la lleva el comercial
const SALA_MARINA = '00000000-0000-4000-8000-0000000ac002';   // libre
const MARTA = '00000000-0000-4000-8000-0000000cc501';
const ACTIVITY = '00000000-0000-4000-8000-0000000ca001';
const PLAN = '00000000-0000-4000-8000-0000000cc001';
const NOTIFICATION = '00000000-0000-4000-8000-0000009d0001';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const PRICE = '00000000-0000-4000-8000-0000000f0002';

async function login(u: { id: string; email: string }, tenant: TenantContext) {
  return buildAdminContext(demoAdminDb(), { id: u.id, email: u.email, name: null }, tenant, 'demo', {
    identity: demoIdentity(), assets: demoAssets, supabase: null, playbookDb: demoPlaybookDb(), evidenceDb: demoEvidenceDb(), partnerDb: () => demoAdminDb(),
    notifyDb: demoNotifyDb(), accountsDb: demoAccountsDb, crmDb: demoCrmDb, commissionsDb: demoCommissionsDb, analyticsDb: demoAnalyticsDb(), orgDb: demoOrgDb(),
  });
}
async function ctx(u: { id: string; email: string }, tenant: TenantContext): Promise<AdminContext> {
  const r = await login(u, tenant);
  if (r.kind !== 'ok') throw new Error(`login ${u.email} en ${tenant.slug}: ${r.kind}`);
  return r.admin;
}
/** Tiene que fallar con un AdminError de «no es tuyo» (403/404) o de datos que no cuadran (422). */
async function denied(p: Promise<unknown>, statuses: number[] = [403, 404]) {
  const e = await p.then(() => null, (err) => err);
  expect(e, 'esperaba un rechazo y ha funcionado').not.toBeNull();
  expect(e, `esperaba AdminError, llegó ${e}`).toBeInstanceOf(AdminError);
  expect(statuses, `estado ${(e as AdminError).status}: ${(e as AdminError).message}`).toContain((e as AdminError).status);
}
const db = () => demoDb();

beforeEach(() => {
  resetDemoDb();
  db().users.push(
    { id: U.altAdmin.id, email: U.altAdmin.email, display_name: 'Admin Re-tema', memberships: [{ tenant_id: ALT, role: 'admin' }] },
    { id: U.dual.id, email: U.dual.email, display_name: 'Dual', memberships: [{ tenant_id: ENJOY, role: 'rep' }, { tenant_id: ALT, role: 'admin' }] },
  );
});

describe('entrar en un espacio', () => {
  test('sin membresía no hay consola, aunque seas admin de otro espacio', async () => {
    for (const [u, t] of [[U.altAdmin, ENJOY_T], [U.altRep, ENJOY_T], [U.rep, ALT_T], [U.admin, ALT_T], [U.dj, ALT_T]] as const) {
      expect((await login(u, t)).kind, `${u.email} → ${t.slug}`).toBe('forbidden');
    }
  });
  test('quien está en dos espacios entra en cada uno con SU rol de ese espacio', async () => {
    expect((await ctx(U.dual, ENJOY_T)).session).toMatchObject({ tenantId: ENJOY, role: 'rep' });
    expect((await ctx(U.dual, ALT_T)).session).toMatchObject({ tenantId: ALT, role: 'admin' });
  });
});

describe('cuentas del CRM', () => {
  test('cada espacio lista solo las suyas', async () => {
    const alt = await ctx(U.altAdmin, ALT_T);
    const mine = await alt.accounts.create({ name: 'Cuenta de Re-tema' });
    const enjoyList = (await (await ctx(U.admin, ENJOY_T)).accounts.list({ scope: 'all' })).items;
    expect(enjoyList.map((a) => a.id)).toContain(CLUB_SOL);
    expect(enjoyList.map((a) => a.id)).not.toContain(mine);
    expect(enjoyList.every((a) => a.tenantId === ENJOY)).toBe(true);
    const altList = (await alt.accounts.list({ scope: 'all' })).items;
    expect(altList.map((a) => a.id)).toEqual([mine]);
    expect(await (await ctx(U.dual, ALT_T)).accounts.mine()).toEqual([]);
  });

  test('desde otro espacio no se lee, edita, bloquea, asigna, reserva ni borra una cuenta (aunque se sepa el id)', async () => {
    for (const u of [U.altAdmin, U.dual]) {
      const alt = await ctx(u, ALT_T);
      await denied(alt.accounts.get(CLUB_SOL));
      await denied(alt.accounts.update(SALA_MARINA, { name: 'Robada' }));
      await denied(alt.accounts.block(SALA_MARINA, 'por las malas'));
      await denied(alt.accounts.assign(SALA_MARINA, u.id));
      await denied(alt.accounts.remove(SALA_MARINA));
    }
    // El de otro espacio sin nada en Enjoy tampoco la reserva.
    await expect((await ctx(U.altAdmin, ALT_T)).accounts.touch(SALA_MARINA, 'claim')).rejects.toBeTruthy();
    const s = db().account.find((a) => a.id === SALA_MARINA)!;
    expect([s.name, s.status, s.owner_id]).toEqual(['Sala Marina', 'open', null]);
    expect(db().account.some((a) => a.id === CLUB_SOL)).toBe(true);
  });
});

describe('personas, historial y cobros (CRM)', () => {
  test('desde otro espacio no se ve ninguna persona, empresa ni historial de este', async () => {
    const alt = await ctx(U.altAdmin, ALT_T);
    const { id: theirs } = await alt.crm.quickAdd({ name: 'Persona de Re-tema' });
    expect((await alt.crm.people()).items.map((p) => p.id)).toEqual([theirs]);
    expect((await (await ctx(U.admin, ENJOY_T)).crm.people()).items.map((p) => p.id)).not.toContain(theirs);
    await denied(alt.crm.person(MARTA));
    await denied(alt.crm.company(CLUB_SOL));
    await denied(alt.crm.timeline(CLUB_SOL));
    expect(await alt.crm.charges(CLUB_SOL)).toEqual([]);
    const ids = new Set(db().account.filter((a) => a.tenant_id === ENJOY).map((a) => a.id));
    expect((await alt.crm.today({ all: true })).items.filter((x) => ids.has(x.id))).toEqual([]);
    const board = await alt.crm.board();
    expect(JSON.stringify(board)).not.toContain(CLUB_SOL);
    // Control: desde Enjoy, Club Sol sí sale en «Hoy» (si no, la comprobación de arriba no diría nada).
    expect((await (await ctx(U.rep, ENJOY_T)).crm.today()).items.map((x) => x.id)).toContain(CLUB_SOL);
  });

  test('desde otro espacio no se apunta, cobra, vincula ni borra nada de este', async () => {
    const enjoy = await ctx(U.admin, ENJOY_T);
    const charge = await enjoy.crm.charge(CLUB_SOL, { priceOptionId: PRICE });
    for (const u of [U.altAdmin, U.dual]) {
      const alt = await ctx(u, ALT_T);
      const { id: theirs } = await alt.crm.quickAdd({ name: `Persona de ${u.email}` });
      await denied(alt.crm.logActivity(CLUB_SOL, { channel: 'visit', outcome: 'note', note: 'colado' }));
      await denied(alt.crm.charge(CLUB_SOL, { priceOptionId: PRICE }));
      await denied(alt.crm.chargeCancel(charge.id));
      await denied(alt.crm.setNextStep(SALA_MARINA, { step: 'Llamar', at: '2026-11-02' }));
      await denied(alt.crm.setTags('account', SALA_MARINA, ['robada']));
      await denied(alt.crm.deleteActivity(ACTIVITY));
      await denied(alt.crm.deletePerson(MARTA));
      await denied(alt.crm.link(theirs, { accountId: CLUB_SOL }));                 // su persona en una empresa de Enjoy
      await expect(alt.crm.link(MARTA, { company: 'Empresa de Re-tema' })).rejects.toBeTruthy();   // una persona de Enjoy en su empresa
      await denied(alt.crm.markWon(SALA_MARINA), [403, 404]);
    }
    expect(db().crm_activity.filter((a) => a.account_id === CLUB_SOL).map((a) => a.id)).toEqual([ACTIVITY]);
    expect(db().crm_contact.some((c) => c.id === MARTA)).toBe(true);
    expect(db().crm_contact_account.filter((l) => l.contact_id === MARTA || l.account_id === CLUB_SOL).length).toBe(1);
    expect((db().payment_request ?? []).find((r) => r.id === charge.id)?.status).toBe('sent');
    const marina = db().account.find((a) => a.id === SALA_MARINA)!;
    expect([marina.next_step ?? null, marina.tags ?? [], marina.won_at]).toEqual([null, [], null]);
  });

  // BUG (src/lib/crm/db-demo.ts:60, demoCrmDb.canEdit): en demo, una persona sin dueño (`owner_id` null) la puede
  // editar CUALQUIER usuario, sea o no del espacio; falta `isMember(c.tenant_id, actorId)`. El servicio
  // (crm/service.ts updatePerson/setTags) tampoco mira el espacio y confía en la RLS. En Supabase la RLS lo impide
  // (crm_contact_update usa también la política de lectura is_member; ver 75_tenant_isolation.test.sql), así que es
  // solo de la demo, pero la demo dice replicar la RLS. Quitar `.fails` cuando esté arreglado.
  test('una persona sin dueño no se edita desde otro espacio', async () => {
    const enjoy = await ctx(U.admin, ENJOY_T);
    const { id } = await enjoy.crm.quickAdd({ name: 'Sin dueño' });
    await enjoy.crm.setOwner(id, null);
    const alt = await ctx(U.altAdmin, ALT_T);
    await denied(alt.crm.updatePerson(id, { name: 'Robada' }));
    await denied(alt.crm.setTags('contact', id, ['robada']));
    const c = db().crm_contact.find((x) => x.id === id)!;
    expect([c.name, c.tags]).toEqual(['Sin dueño', []]);
  });
});

describe('equipo, propuestas, playbook y avisos', () => {
  test('el equipo de cada espacio es solo suyo: no se ve ni se cambia el rol de nadie de fuera', async () => {
    const alt = await ctx(U.altAdmin, ALT_T);
    const members = (await alt.tenantAdmin.listMembers()).map((m) => m.userId);
    expect(members).toEqual(expect.arrayContaining([U.altAdmin.id, U.altRep.id, U.dual.id]));
    expect(members).not.toContain(U.rep.id);
    expect(members).not.toContain(U.admin.id);
    await expect(alt.tenantAdmin.setRole(U.rep.id, 'admin')).rejects.toBeTruthy();
    await expect(alt.tenantAdmin.removeMember(U.admin.id)).rejects.toBeTruthy();
    expect(await demoAdminDb().membershipRole(U.rep.id, ENJOY)).toBe('rep');
    expect(await demoAdminDb().membershipRole(U.admin.id, ENJOY)).toBe('admin');
    // El admin de Re-tema que es comercial en Enjoy no se asciende en Enjoy desde Re-tema.
    const dual = await ctx(U.dual, ALT_T);
    await dual.tenantAdmin.setRole(U.dual.id, 'admin').catch(() => null);
    expect(await demoAdminDb().membershipRole(U.dual.id, ENJOY)).toBe('rep');
  });

  test('propuestas: no se listan, abren ni borran las de otro espacio', async () => {
    const alt = await ctx(U.altAdmin, ALT_T);
    expect((await alt.service.listDossiers()).every((d) => d.tenantId === ALT)).toBe(true);
    await denied(alt.service.getState(SALA_X));
    await denied(alt.service.deleteDossier(SALA_X));
    expect(db().dossier.some((d) => d.id === SALA_X)).toBe(true);
  });

  test('playbook y situaciones: cada espacio ve los suyos', async () => {
    const [enjoy, alt] = [await ctx(U.admin, ENJOY_T), await ctx(U.altAdmin, ALT_T)];
    const ePlays = new Set((await enjoy.playbook.listAll()).plays.map((p) => p.id));
    const aPlays = (await alt.playbook.listAll()).plays.map((p) => p.id);
    expect(ePlays.size).toBeGreaterThan(0);
    expect(aPlays.filter((id) => ePlays.has(id))).toEqual([]);
    const eFacets = new Set((await enjoy.evidence.facets({ all: true })).map((f) => f.id));
    expect((await alt.evidence.facets({ all: true })).filter((f) => eFacets.has(f.id))).toEqual([]);
    const eSegs = new Set((await enjoy.playbook.market()).map((x) => x.id));
    expect([eFacets.size > 0, eSegs.size > 0]).toEqual([true, true]);   // control: Enjoy sí tiene
    expect((await alt.playbook.market()).filter((x) => eSegs.has(x.id))).toEqual([]);
  });

  test('avisos: los de un espacio no salen en otro, ni para la misma persona', async () => {
    const enjoyFeed = await (await ctx(U.admin, ENJOY_T)).notifications.feed();
    expect(enjoyFeed.items.map((n) => n.id)).toContain(NOTIFICATION);
    // DUAL recibe un aviso en Enjoy; en Re-tema no lo ve ni puede descartarlo.
    db().notification.push({ ...structuredClone(db().notification.find((n) => n.id === NOTIFICATION)!), id: 'abababab-0000-4000-8000-0000000000f1', user_id: U.dual.id });
    const dualAlt = await ctx(U.dual, ALT_T);
    expect((await dualAlt.notifications.feed()).items).toEqual([]);
    await dualAlt.notifications.dismiss('abababab-0000-4000-8000-0000000000f1');
    await dualAlt.notifications.markAllRead();
    const n = db().notification.find((x) => x.id === 'abababab-0000-4000-8000-0000000000f1')!;
    expect([n.dismissed_at, n.read_at]).toEqual([null, null]);
    expect((await (await ctx(U.dual, ENJOY_T)).notifications.feed()).items.map((x) => x.id)).toContain('abababab-0000-4000-8000-0000000000f1');
  });
});

describe('comisiones', () => {
  test('los planes de comisión de un espacio no se ven ni se borran desde otro', async () => {
    const alt = await ctx(U.altAdmin, ALT_T);
    expect((await alt.commissions.plans()).plans.map((p) => p.id)).not.toContain(PLAN);
    await denied(alt.commissions.deletePlan(PLAN));
    await denied(alt.commissions.voidEvent('abababab-0000-4000-8000-0000000000e1'));
    expect((await alt.commissions.events()).every((e) => e.tenantId === ALT)).toBe(true);
    expect(db().commission_plan.find((p) => p.id === PLAN)?.tenant_id).toBe(ENJOY);
  });

  // BUG (src/lib/commissions/db-demo.ts:75-80, demoCommissionsDb.savePlan): con un id, la demo quita la fila con ese id
  // SEA DE QUIEN SEA y la vuelve a meter en el espacio de quien guarda: el admin de otro espacio que conozca el id
  // «roba» (mueve) el plan. En Supabase es un UPDATE … where id que la RLS limita a su espacio (0 filas → «permission
  // denied»), y el servicio solo pasa ids de planes leídos de su espacio (getPlan), así que hoy no se llega desde la
  // consola: es fidelidad de la demo. Quitar `.fails` cuando esté arreglado.
  test('la demo no deja guardar sobre el plan de otro espacio (como la RLS)', async () => {
    const dbAlt = demoCommissionsDb(U.altAdmin.id);
    await expect(dbAlt.savePlan(ALT, { name: 'Robado', isDefault: false, rules: [], referral: null }, PLAN)).rejects.toThrow(/permission/);
    expect(db().commission_plan.find((p) => p.id === PLAN)?.tenant_id).toBe(ENJOY);
  });
});
