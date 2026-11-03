/** Organigrama y alta de espacios (docs/ORG.md) con la BD demo: quién puede, validación y errores de la base. */
import { beforeEach, describe, expect, test } from 'vitest';
import { demoAdminDb } from '../admin/db-demo';
import type { Identity } from '../admin/db';
import { AdminError } from '../admin/service';
import type { AdminSession } from '../admin/types';
import { resetDemoDb } from '../data/store';
import { demoOrgDb } from './db-demo';
import type { OrgDb } from './db';
import { createOrgService, slugOf, SPACE_LOCALES } from './service';
import { inTeam, isGlobal } from './scope';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const REP = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const ALT_REP = '33333333-3333-4333-8333-333333333333';
const SUPER = '99999999-9999-4999-8999-0000000000aa';

const session = (o: Partial<AdminSession> & Pick<AdminSession, 'userId' | 'role'>): AdminSession =>
  ({ email: 'x@x.test', displayName: null, tenantId: ENJOY, ...o });

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

/** Identidad de prueba: apunta a quién invita y con qué redirección. */
function fakeIdentity(existing: Record<string, string> = {}) {
  const calls: Array<{ email: string; redirectTo: string }> = [];
  const identity: Identity = {
    async findOrInvite(email, opts) {
      calls.push({ email, redirectTo: opts.redirectTo });
      return existing[email] ? { userId: existing[email], invited: false } : { userId: ADMIN, invited: true };
    },
  };
  return { identity, calls };
}

const svc = (s: AdminSession, o: { identity?: Identity | null; db?: OrgDb } = {}) =>
  createOrgService(o.db ?? demoOrgDb(), demoAdminDb(), s, { zones: async () => [], identity: o.identity });
const BASE = { base: 'ventas.example.com', scheme: 'https' as const };

describe('dirección de un espacio (slugOf)', () => {
  test('minúsculas, sin tildes ni signos, guiones entre palabras, como mucho 40', () => {
    expect(slugOf('Ocean Dive Lab')).toBe('ocean-dive-lab');
    expect(slugOf('  Ñandú & Cía., S.L.  ')).toBe('nandu-cia-s-l');
    expect(slugOf('Café — Bolsería!!')).toBe('cafe-bolseria');
    expect(slugOf('---')).toBe('');
    expect(slugOf('a'.repeat(60))).toHaveLength(40);
  });
});

describe('alta de un espacio (createSpace)', () => {
  beforeEach(() => { resetDemoDb(); });
  const superadmin = () => session({ userId: SUPER, role: 'admin', superadmin: true });

  test('solo el superadmin: un admin de un espacio no da de alta otros (403)', async () => {
    await rejects(svc(session({ userId: ADMIN, role: 'admin' })).createSpace({ name: 'Nueva' }, BASE), 403);
    await rejects(svc(session({ userId: REP, role: 'rep' })).createSpace({ name: 'Nueva' }, BASE), 403);
  });

  test('crea el espacio en <dirección>.<base> con su origen; sin email no invita a nadie', async () => {
    const { identity, calls } = fakeIdentity();
    const r = await svc(superadmin(), { identity }).createSpace({ name: 'Ocean Dive Lab', locale: 'en-GB' }, BASE);
    expect(r).toMatchObject({ slug: 'ocean-dive-lab', hostname: 'ocean-dive-lab.ventas.example.com', origin: 'https://ocean-dive-lab.ventas.example.com', invited: false, adminEmail: null });
    expect(calls).toEqual([]);
    const overview = await demoOrgDb().platformOverview();
    expect(overview?.find((t) => t.id === r.id)).toMatchObject({ slug: 'ocean-dive-lab', domain: 'ocean-dive-lab.ventas.example.com', members: 0 });
  });

  test('la dirección escrita manda sobre el nombre (y se normaliza igual)', async () => {
    const r = await svc(superadmin()).createSpace({ name: 'Ocean Dive Lab', slug: '  ODL Valencia ' }, BASE);
    expect(r.slug).toBe('odl-valencia');
  });

  test('validación: nombre, dirección, idioma y email (422)', async () => {
    const s = svc(superadmin(), { identity: fakeIdentity().identity });
    await rejects(s.createSpace({ name: '   ' }, BASE), 422);
    await rejects(s.createSpace({ name: 'x'.repeat(81) }, BASE), 422);
    await rejects(s.createSpace({ name: 'Ok', slug: '!!!' }, BASE), 422);       // la dirección queda vacía
    await rejects(s.createSpace({ name: 'A' }, BASE), 422);                     // «a»: demasiado corta (mín. 2)
    await rejects(s.createSpace({ name: 'Ok', locale: 'de-DE' }, BASE), 422);
    await rejects(s.createSpace({ name: 'Ok', adminEmail: 'no-es-email' }, BASE), 422);
    for (const l of SPACE_LOCALES) expect((await s.createSpace({ name: `Esp ${l}`, locale: l }, BASE)).slug).toBe(slugOf(`Esp ${l}`));
  });

  test('dirección repetida (la del seed o una recién creada) → 409', async () => {
    const s = svc(superadmin());
    await rejects(s.createSpace({ name: 'Enjoy' }, BASE), 409);
    await s.createSpace({ name: 'Nueva Empresa' }, BASE);
    await rejects(s.createSpace({ name: 'Otra', slug: 'nueva-empresa' }, BASE), 409);
  });

  test('si la base dice «permission denied», 403 (la RLS manda aunque la sesión diga superadmin)', async () => {
    const db: OrgDb = { ...demoOrgDb(), async createTenant() { throw new Error('new row violates row-level security policy (42501)'); } };
    await rejects(svc(superadmin(), { db }).createSpace({ name: 'Nueva' }, BASE), 403);
  });

  test('con email: invita al admin y la invitación lleva a la configuración del espacio nuevo (con su puerto)', async () => {
    const { identity, calls } = fakeIdentity();
    const r = await svc(superadmin(), { identity }).createSpace({ name: 'Ocean', adminEmail: '  Dueno@Ocean.TEST ' }, { base: 'localhost', scheme: 'http', port: '4321' });
    expect(r).toMatchObject({ origin: 'http://ocean.localhost:4321', invited: true, adminEmail: 'dueno@ocean.test' });
    expect(calls).toEqual([{ email: 'dueno@ocean.test', redirectTo: `http://ocean.localhost:4321/admin/auth/confirm?next=${encodeURIComponent('/admin/setup/ia?first=1')}` }]);
    // Queda como admin del espacio nuevo.
    expect(await demoAdminDb().membershipRole(ADMIN, r.id)).toBe('admin');
  });

  test('con email de alguien que ya existe: se le hace admin sin reinvitar', async () => {
    const { identity } = fakeIdentity({ 'rep@enjoy.test': REP });
    const r = await svc(superadmin(), { identity }).createSpace({ name: 'Ocean', adminEmail: 'rep@enjoy.test' }, BASE);
    expect(r.invited).toBe(false);
    expect(await demoAdminDb().membershipRole(REP, r.id)).toBe('admin');
    expect(await demoAdminDb().membershipRole(REP, ENJOY)).toBe('rep');   // en su espacio sigue igual
  });

  test('con email pero sin servicio de invitaciones: 503 y no se crea nada a medias', async () => {
    const before = (await demoOrgDb().platformOverview())!.length;
    await rejects(svc(superadmin(), { identity: null }).createSpace({ name: 'Ocean', adminEmail: 'a@b.test' }, BASE), 503);
    expect((await demoOrgDb().platformOverview())!.length).toBe(before);
  });
});

describe('organigrama: quién lo monta y quién ve qué', () => {
  beforeEach(() => { resetDemoDb(); });

  test('isGlobal / inTeam', () => {
    expect(isGlobal({ role: 'admin' })).toBe(true);
    expect(isGlobal({ role: 'lead', delegationId: null })).toBe(true);
    expect(isGlobal({ role: 'lead', delegationId: 'd1' })).toBe(false);
    expect(isGlobal({ role: 'rep' })).toBe(false);
    expect(isGlobal({ role: 'rep', superadmin: true })).toBe(true);
    expect(inTeam({ team: null }, 'u1')).toBe(true);
    expect(inTeam({ team: ['u1'] }, 'u1')).toBe(true);
    expect(inTeam({ team: ['u1'] }, 'u2')).toBe(false);
    expect(inTeam({ team: ['u1'] }, null)).toBe(false);
  });

  test('el comercial y el gerente de delegación no montan el organigrama (403); la plataforma, solo el superadmin', async () => {
    await rejects(svc(session({ userId: REP, role: 'rep' })).saveDelegation({ name: 'Levante' }), 403);
    await rejects(svc(session({ userId: REP, role: 'lead', delegationId: 'x' })).saveDelegation({ name: 'Levante' }), 403);
    await rejects(svc(session({ userId: ADMIN, role: 'admin' })).platform(), 403);
    expect((await svc(session({ userId: SUPER, role: 'admin', superadmin: true })).platform()).map((t) => t.slug)).toEqual(expect.arrayContaining(['enjoy']));
  });

  test('tope de IA: solo el superadmin lo cambia, y sale en el coste por empresa', async () => {
    const ENJOY = '00000000-0000-4000-8000-000000000e01';
    await rejects(svc(session({ userId: ADMIN, role: 'admin' })).setLimits(ENJOY, { aiPerUserDay: 999 }), 403);
    const sup = svc(session({ userId: SUPER, role: 'admin', superadmin: true }));
    await rejects(sup.setLimits(ENJOY, { aiPerUserDay: 0 }), 422);
    await rejects(sup.setLimits('no-es-un-id', { aiPerUserDay: 10 }), 422);
    expect(await sup.setLimits(ENJOY, { aiPerUserDay: '120', aiMonthUsd: '50' })).toEqual({ aiPerUserDay: 120, aiMonthUsd: 50 });
    const { report } = await sup.costs(new Date().toISOString().slice(0, 7));
    const enjoy = report.tenants.find((t) => t.id === ENJOY)!;
    expect(enjoy.limits).toEqual({ aiPerUserDay: 120, aiMonthUsd: 50, custom: true });
    expect(enjoy.budgetUsed).toBeCloseTo(enjoy.variable / 50, 6);
    expect(report.tenants.find((t) => t.id !== ENJOY)!.limits).toMatchObject({ aiPerUserDay: 40, aiMonthUsd: null, custom: false });
    (await import('../usage/demo')).demoLimits().clear();
  });

  test('coste por empresa: solo el superadmin; en demo, un mes de ejemplo con más gasto en IA en el segundo espacio', async () => {
    await rejects(svc(session({ userId: ADMIN, role: 'admin' })).costs('2026-11'), 403);
    const sup = svc(session({ userId: SUPER, role: 'admin', superadmin: true }));
    await rejects(sup.costs('noviembre'), 422);
    // El ejemplo son los últimos 40 días: el mes en curso.
    const { ready, report } = await sup.costs(new Date().toISOString().slice(0, 7));
    expect(ready).toBe(true);
    expect(report.tenants.length).toBeGreaterThanOrEqual(2);
    expect(report.tenants[0].variable).toBeGreaterThan(report.tenants[1].variable);
    expect(report.tenants[0].byFeature.map((f) => f.feature)).toEqual(expect.arrayContaining(['crm.notes', 'crm.research']));
  });

  test('delegación: nombre válido, sin repetir (409), y el gerente tiene que ser del equipo comercial de ESTE espacio', async () => {
    const admin = svc(session({ userId: ADMIN, role: 'admin' }));
    await rejects(admin.saveDelegation({ name: '' }), 422);
    const id = await admin.saveDelegation({ name: 'Levante', managerId: REP });
    await rejects(admin.saveDelegation({ name: 'levante' }), 409);
    await rejects(admin.saveDelegation({ name: 'Norte', managerId: ALT_REP }), 422);   // comercial de otro espacio
    await rejects(admin.saveDelegation({ name: 'Norte', managerId: ADMIN }), 422);     // un admin no es gerente de delegación
    const chart = await admin.chart();
    expect(chart.delegations.map((d) => [d.name, d.manager?.userId])).toEqual([['Levante', REP]]);
    // El gerente de la delegación pasa a gerente (= trigger delegation_manager_sync).
    expect(await demoAdminDb().membershipRole(REP, ENJOY)).toBe('lead');
    await rejects(admin.moveMember(ALT_REP, id), 404);
  });

  test('otro espacio no ve ni toca las delegaciones de este', async () => {
    const id = await svc(session({ userId: ADMIN, role: 'admin' })).saveDelegation({ name: 'Levante' });
    const alt = svc(session({ userId: ALT_REP, role: 'admin', tenantId: ALT }));
    expect((await alt.chart()).delegations).toEqual([]);
    await rejects(alt.saveDelegation({ name: 'Robada' }, id), 403);   // = RLS: «permission denied»
    await alt.deleteDelegation(id);   // no es suya: no pasa nada
    expect((await svc(session({ userId: ADMIN, role: 'admin' })).chart()).delegations.map((d) => d.id)).toEqual([id]);
  });
});
