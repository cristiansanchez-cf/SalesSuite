/**
 * Contrato de colaboradores (docs/PARTNERS.md): mismo comportamiento en demo y en Postgres + PostgREST + RLS.
 * Usa buildAdminContext: el mismo cableado que el middleware en producción.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext, type AuthResult } from '../admin/auth';
import type { AdminDb, Identity } from '../admin/db';
import { AdminError } from '../admin/service';
import type { PlaybookDb } from '../playbook/db';
import type { TenantContext } from '../types';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const DJ = { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' };
const ADMIN = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' };
const REP = { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' };
const ACC = { luna: '00000000-0000-4000-8000-0000009a0001', neon: '00000000-0000-4000-8000-0000009a0002', terraza: '00000000-0000-4000-8000-0000009a0003' };
const MOD = { hero: '00000000-0000-4000-8000-00000000e101', exp: '00000000-0000-4000-8000-00000000e102', locales: '00000000-0000-4000-8000-00000000e103' };
const V = { heroV1: '00000000-0000-4000-8000-0000000e1011', tabsExp: '00000000-0000-4000-8000-0000000e1021', tabsLocales: '00000000-0000-4000-8000-0000000e1031' };
const TENANT: TenantContext = { id: ENJOY, slug: 'enjoy', name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never };

export interface PartnerEnv {
  reset(): Promise<void>;
  adminDbFor(userId: string): AdminDb;
  /** AdminDb del colaborador (en Supabase: catálogo e items por RPC). */
  partnerDbFor(userId: string): AdminDb;
  playbookDbFor(userId: string): PlaybookDb;
  identity(): Identity;
  publicGet(token: string, tenantId: string): Promise<{ priceMode: string; items: Array<{ moduleKey: string; priceOverride: number | null; defaultPrice: number | null }> } | null>;
  enforcesRls: boolean;
}

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

export function partnerContract(name: string, env: () => PartnerEnv) {
  describe(`colaboradores · ${name}`, () => {
    let E: PartnerEnv;
    const login = async (u: { id: string; email: string }): Promise<AuthResult> => buildAdminContext(
      E.adminDbFor(u.id), { id: u.id, email: u.email, name: null }, TENANT, 'demo',
      { identity: E.identity(), assets: { async upload() { throw new Error('x'); } }, supabase: null, playbookDb: E.playbookDbFor(u.id), partnerDb: () => E.partnerDbFor(u.id) },
    );
    const ctx = async (u: { id: string; email: string }) => {
      const r = await login(u);
      if (r.kind !== 'ok') throw new Error(`login ${u.email}: ${r.kind}`);
      return r.admin;
    };

    beforeEach(async () => {
      E = env();
      await E.reset();
    });

    test('sesión de colaborador: perfil, cuentas y nada del equipo', async () => {
      const dj = await ctx(DJ);
      expect(dj.session.role).toBe('partner');
      expect(dj.session.partner?.accounts.map((a) => a.name)).toEqual(['Sala Luna', 'Club Neón', 'Terraza Sur']);
      expect(await dj.service.listDossiers()).toEqual([]);
      await rejects(dj.service.getState(SALA_X), 404);
      await rejects(dj.tenantAdmin.listMembers(), 403);
      await rejects(dj.tenantAdmin.listPartners(), 403);
    });

    test('crea propuestas solo desde sus cuentas; precio por política y sin tarifa', async () => {
      const dj = await ctx(DJ);
      await rejects(dj.service.createDossier({ title: 'Sin cuenta' }), 422);
      const id = await dj.service.createDossier({ title: 'Neón 2027', partnerAccountId: ACC.neon });
      let st = await dj.service.getState(id);
      expect(st.pricesLocked).toBe(true);
      expect(st.dossier.priceMode).toBe('per_module');
      expect(st.dossier.segmentId).toBe('00000000-0000-4000-8000-0000005e0002');
      expect(st.partnerAccount).toMatchObject({ name: 'Club Neón', pricePolicy: 'adjusted', priceAdjustPct: null });
      expect(st.catalog.map((c) => c.moduleId).sort()).toEqual([MOD.exp, MOD.locales]);
      expect(st.catalog.every((c) => c.defaultPrice === null)).toBe(true);

      st = await dj.service.apply(id, { op: 'addItem', moduleVersionId: V.tabsExp });
      expect(st.items[0].priceOverride).toBe(405);   // 450 € −10 %
      expect(st.items[0].defaultPrice).toBeNull();
      expect(st.items[0].price?.amount).toBe(405);
      await rejects(dj.service.apply(id, { op: 'addItem', moduleVersionId: V.heroV1 }), 422);   // módulo no permitido
      await rejects(dj.service.apply(id, { op: 'setPrice', itemId: st.items[0].id, priceOverride: 1 }), 403);
      await rejects(dj.service.apply(id, { op: 'update', patch: { priceMode: 'none' } }), 403);
      st = await dj.service.apply(id, { op: 'update', patch: { title: 'Neón · Verano' } });
      expect(st.dossier.title).toBe('Neón · Verano');

      // Publica y envía: el cliente ve 405 €.
      await dj.service.apply(id, { op: 'setStatus', status: 'published' });
      st = await dj.service.apply(id, { op: 'createLink' });
      const pub = await E.publicGet(st.links[0].token, ENJOY);
      expect(pub?.items[0].priceOverride).toBe(405);

      // Sala Luna: sin precios.
      const luna = await dj.service.createDossier({ title: 'Luna', partnerAccountId: ACC.luna });
      const sl = await dj.service.apply(luna, { op: 'addItem', moduleVersionId: V.tabsLocales });
      expect(sl.dossier.priceMode).toBe('none');
      expect(sl.items[0].priceOverride).toBeNull();
      expect(sl.total).toBeNull();

      // El equipo interno ve sus propuestas; un rep no ve sus cuentas.
      const rep = await ctx(REP);
      expect((await rep.service.listDossiers()).some((d) => d.id === id)).toBe(true);
      expect((await rep.service.getState(id)).partnerAccount).toBeNull();
    });

    test('el admin decide el precio de cada cuenta y se aplica a lo ya enviado', async () => {
      const dj = await ctx(DJ);
      const id = await dj.service.createDossier({ title: 'Neón', partnerAccountId: ACC.neon });
      await dj.service.apply(id, { op: 'addItem', moduleVersionId: V.tabsExp });
      const admin = await ctx(ADMIN);
      expect((await admin.service.getState(id)).partnerAccount).toMatchObject({ name: 'Club Neón', priceAdjustPct: -10 });

      await admin.tenantAdmin.savePartnerAccount(DJ.id, { name: 'Club Neón', segmentId: '00000000-0000-4000-8000-0000005e0002', pricePolicy: 'list', priceAdjustPct: 0 }, ACC.neon);
      expect((await admin.service.getState(id)).items[0].priceOverride).toBe(450);
      await admin.tenantAdmin.savePartnerAccount(DJ.id, { name: 'Club Neón', pricePolicy: 'adjusted', priceAdjustPct: 20 }, ACC.neon);
      expect((await admin.service.getState(id)).items[0].priceOverride).toBe(540);
      await admin.tenantAdmin.savePartnerAccount(DJ.id, { name: 'Club Neón', pricePolicy: 'hidden' }, ACC.neon);
      const st = await admin.service.getState(id);
      expect(st.dossier.priceMode).toBe('none');
      expect(st.items[0].priceOverride).toBeNull();
      await rejects(admin.tenantAdmin.savePartnerAccount(DJ.id, { name: 'x', pricePolicy: 'adjusted', priceAdjustPct: -95 }), 422);

      // Nueva cuenta → la ve el colaborador al volver a entrar.
      await admin.tenantAdmin.savePartnerAccount(DJ.id, { name: 'Bar Nuevo', pricePolicy: 'list' });
      expect((await ctx(DJ)).session.partner?.accounts.map((a) => a.name)).toContain('Bar Nuevo');
    });

    test('playbook guiado: sus módulos, sin monetización, sin aportar, con audiencia', async () => {
      const dj = await ctx(DJ);
      const idx = await dj.playbook.learnIndex();
      expect(idx.modules.map((m) => m.moduleId).sort()).toEqual([MOD.exp, MOD.locales]);
      const exp = await dj.playbook.topic(MOD.exp);
      expect(exp.sections.map((x) => x.kind)).not.toContain('monetization');
      await rejects(dj.playbook.topic(MOD.hero), 404);
      await rejects(dj.playbook.shareTip({ moduleId: MOD.exp, title: 't', body: 'b' }), 403);
      const mk = await dj.playbook.market();
      expect(mk.map((x) => x.key)).toEqual(['ocio-nocturno']);
      expect(mk[0].modules.every((m) => [MOD.exp, MOD.locales].includes(m.moduleId))).toBe(true);
      const general = (await dj.playbook.topic('general')).sections.flatMap((x) => x.plays);

      // Jugada solo para el equipo → desaparece; solo para colaboradores → la ve él, no un rep.
      const admin = await ctx(ADMIN);
      const all = await admin.playbook.listAll();
      const pitch = all.plays.find((p) => p.key === 'empresa-pitch')!;
      await admin.playbook.updatePlay(pitch.id, { ...pitch, audience: 'team' }, 'Solo equipo');
      const general2 = (await (await ctx(DJ)).playbook.topic('general')).sections.flatMap((x) => x.plays);
      expect(general2.length).toBe(general.length - 1);
      const forPartners = await admin.playbook.createPlay({ moduleId: null, kind: 'tip', title: 'Cómo presentarte como DJ', body: 'x', audience: 'partners' });
      expect((await (await ctx(DJ)).playbook.topic('general')).sections.flatMap((x) => x.plays).some((p) => p.id === forPartners)).toBe(true);
      // (los reps la ven también: 'partners' es contenido extra para colaboradores, no secreto)

      // Trucos del equipo: solo si el admin lo permite.
      const rep = await ctx(REP);
      await rep.playbook.shareTip({ moduleId: MOD.exp, title: 'Truco interno', body: 'cuerpo' });
      expect((await (await ctx(DJ)).playbook.topic(MOD.exp)).tips).toEqual([]);
      await admin.tenantAdmin.updatePartner(DJ.id, { moduleIds: [MOD.exp, MOD.locales], seeTeamTips: true });
      expect((await (await ctx(DJ)).playbook.topic(MOD.exp)).tips.map((t) => t.title)).toEqual(['Truco interno']);
    });

    test('invitar, caducar y no cambiar de rol', async () => {
      const admin = await ctx(ADMIN);
      const { userId } = await admin.tenantAdmin.invitePartner({ email: 'Monitor@Buceo.test', moduleIds: [MOD.exp], expiresAt: '' }, 'https://x/admin');
      const list = await admin.tenantAdmin.listPartners();
      expect(list.map((p) => p.email)).toEqual(expect.arrayContaining(['dj@enjoy.test', 'monitor@buceo.test']));
      await rejects(admin.tenantAdmin.invitePartner({ email: 'dj@enjoy.test', moduleIds: [] }, 'https://x'), 409);
      await rejects(admin.tenantAdmin.invitePartner({ email: 'otro@x.test', moduleIds: ['00000000-0000-4000-8000-0000000000ff'] }, 'https://x'), 404);
      await rejects(admin.tenantAdmin.setRole(userId, 'rep'), 409);
      const fresh = await ctx({ id: userId, email: 'monitor@buceo.test' });
      expect(fresh.session.partner?.accounts).toEqual([]);

      await admin.tenantAdmin.updatePartner(DJ.id, { moduleIds: [MOD.exp], expiresAt: '2020-01-01' });
      const r = await login(DJ);
      expect(r).toMatchObject({ kind: 'forbidden', reason: 'partner-expired' });
      await admin.tenantAdmin.updatePartner(DJ.id, { moduleIds: [MOD.exp], expiresAt: '' });
      expect((await login(DJ)).kind).toBe('ok');

      await admin.tenantAdmin.removeMember(DJ.id);
      expect((await login(DJ)).kind).toBe('forbidden');
    });

    test('defensa en profundidad: la BD repite las reglas aunque el servicio no las aplicara', async () => {
      if (!E.enforcesRls) return;
      // AdminDb "crudo" del colaborador (sin el filtro de la app): la RLS/RPC es la que filtra.
      const raw = E.partnerDbFor(DJ.id);
      expect(await raw.listDossiers(ENJOY)).toEqual([]);
      expect((await raw.listCatalog(ENJOY)).every((c) => c.defaultPrice === null)).toBe(true);
      expect(await raw.listPartnerProfiles(ENJOY)).toHaveLength(1);
      const d = await raw.insertDossier({ tenantId: ENJOY, authorId: DJ.id, title: 'x', prospectName: null, prospectCompany: null, locale: 'es-ES', priceMode: 'total', totalPrice: 1, currency: 'EUR', partnerAccountId: ACC.terraza });
      expect(d.priceMode).toBe('per_module');
      expect(d.totalPrice).toBeNull();
      await raw.insertItem({ dossierId: d.id, moduleVersionId: V.tabsLocales, position: 1, priceOverride: 1 });
      expect((await raw.listItems([d.id]))[0].priceOverride).toBe(300);
      await expect(raw.insertItem({ dossierId: d.id, moduleVersionId: V.heroV1, position: 2 })).rejects.toThrow();
      expect(await raw.upsertPartnerProfile({ tenantId: ENJOY, userId: DJ.id, moduleIds: [MOD.hero], seeTeamTips: true, welcomeNote: null, expiresAt: null }).catch(() => false)).toBe(false);
    expect((await raw.getPartnerProfile(ENJOY, DJ.id))?.moduleIds).not.toContain(MOD.hero);
    });
  });
}
