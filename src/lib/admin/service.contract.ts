/**
 * Contrato del servicio de la consola. Se ejecuta contra la BD demo (service.test.ts) y contra
 * Postgres + PostgREST + RLS reales (service.supabase.test.ts) para garantizar el mismo comportamiento.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import type { AdminDb } from './db';
import { AdminError, createAdminService } from './service';
import type { AdminSession, Role } from './types';

export const ENJOY = '00000000-0000-4000-8000-000000000e01';
export const ALT = '00000000-0000-4000-8000-000000000a01';
export const USERS = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test', tenant: ENJOY, role: 'rep' as Role },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test', tenant: ENJOY, role: 'admin' as Role },
  altRep: { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test', tenant: ALT, role: 'rep' as Role },
};
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const V = {
  heroV1: '00000000-0000-4000-8000-0000000e1011',
  heroV2: '00000000-0000-4000-8000-0000000e1012',
  tabsExp: '00000000-0000-4000-8000-0000000e1021',
  tabsLocales: '00000000-0000-4000-8000-0000000e1031',
  pricing: '00000000-0000-4000-8000-0000000e1041',
  altHero: '00000000-0000-4000-8000-0000000a1011',
};

export interface ContractEnv {
  reset(): Promise<void>;
  dbFor(userId: string): AdminDb;
  /** Lectura pública por token (RPC real o repo demo). */
  publicGet(token: string, tenantId: string): Promise<{ items: Array<{ blockType: string }> } | null>;
  /** true si la BD aplica RLS (Supabase): habilita tests de defensa en profundidad. */
  enforcesRls: boolean;
}

type U = (typeof USERS)[keyof typeof USERS];
const session = (u: U, over: Partial<AdminSession> = {}): AdminSession => ({
  userId: u.id, email: u.email, displayName: null, tenantId: u.tenant, role: u.role, ...over,
});

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

export function serviceContract(name: string, env: () => ContractEnv) {
  describe(`servicio admin · ${name}`, () => {
    let E: ContractEnv;
    const svc = (u: U, over?: Partial<AdminSession>) => createAdminService(E.dbFor(u.id), session(u, over));

    beforeEach(async () => {
      E = env();
      await E.reset();
    });

    test('lista solo dossiers del tenant del Host', async () => {
      const list = await svc(USERS.rep).listDossiers();
      expect(list.map((d) => d.tenantId).every((t) => t === ENJOY)).toBe(true);
      expect(list.length).toBe(3);
      const sala = list.find((d) => d.id === SALA_X)!;
      expect(sala.itemCount).toBe(4);
      expect(sala.activeLinks).toBe(1); // 1 activo + 1 expirado
    });

    test('flujo §13: crear, 4 módulos, mover #3 arriba, ocultar, per_module + override, publicar, enlace', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'Sala X 2027', prospectCompany: 'Sala X' });
      let st = await s.getState(id);
      expect(st.canEdit).toBe(true);
      expect(st.publishBlockers).toContain('Añade al menos un módulo visible');
      await rejects(s.apply(id, { op: 'setStatus', status: 'published' }), 409);

      for (const v of [V.heroV2, V.tabsExp, V.tabsLocales, V.pricing]) st = await s.apply(id, { op: 'addItem', moduleVersionId: v });
      expect(st.items.map((i) => i.moduleVersionId)).toEqual([V.heroV2, V.tabsExp, V.tabsLocales, V.pricing]);

      st = await s.apply(id, { op: 'move', itemId: st.items[2].id, toIndex: 0 });
      expect(st.items.map((i) => i.moduleVersionId)).toEqual([V.tabsLocales, V.heroV2, V.tabsExp, V.pricing]);

      st = await s.apply(id, { op: 'setVisible', itemId: st.items[1].id, visible: false });
      st = await s.apply(id, { op: 'update', patch: { priceMode: 'per_module' } });
      st = await s.apply(id, { op: 'setPrice', itemId: st.items[0].id, priceOverride: 250 });
      expect(st.items[0].price?.amount).toBe(250);
      expect(st.items[2].price?.amount).toBe(450);
      expect(st.total?.amount).toBe(700);

      st = await s.apply(id, { op: 'setStatus', status: 'published' });
      expect(st.dossier.status).toBe('published');
      expect(st.dossier.publishedAt).not.toBeNull();
      st = await s.apply(id, { op: 'createLink' });
      const link = st.links[0];
      expect(link.state).toBe('active');
      expect(link.token.length).toBeGreaterThanOrEqual(32);

      const pub = await E.publicGet(link.token, ENJOY);
      expect(pub?.items.map((i) => i.blockType)).toEqual(['tabs-showcase', 'tabs-showcase', 'pricing-card']);
      expect(await E.publicGet(link.token, ALT)).toBeNull();

      st = await s.apply(id, { op: 'revokeLink', linkId: link.id });
      expect(st.links[0].state).toBe('revoked');
      expect(await E.publicGet(link.token, ENJOY)).toBeNull();
    });

    test('rep no edita dossiers ajenos; admin sí', async () => {
      const st = await svc(USERS.rep).getState(SALA_X);
      expect(st.canEdit).toBe(false);
      await rejects(svc(USERS.rep).apply(SALA_X, { op: 'update', patch: { title: 'hack' } }), 403);
      const ok = await svc(USERS.admin).apply(SALA_X, { op: 'update', patch: { title: 'Editado por admin' } });
      expect(ok.dossier.title).toBe('Editado por admin');
    });

    test('otro tenant: 404 aunque conozca el id', async () => {
      await rejects(svc(USERS.altRep).getState(SALA_X), 404);
      await rejects(svc(USERS.altRep).apply(SALA_X, { op: 'update', patch: { title: 'x' } }), 404);
    });

    test('no se pueden añadir versiones de otro tenant ni no publicadas', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      await rejects(s.apply(id, { op: 'addItem', moduleVersionId: V.altHero }), 422);
      await rejects(s.apply(id, { op: 'addItem', moduleVersionId: '00000000-0000-4000-8000-00000000ffff' }), 422);
    });

    test('personalización validada contra el schema del módulo', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T', prospectCompany: 'Finca' });
      let st = await s.apply(id, { op: 'addItem', moduleVersionId: V.heroV1 });
      const item = st.items[0].id;
      const e = await rejects(s.apply(id, { op: 'setProps', itemId: item, propOverrides: { ctas: [{ label: 'x', href: 'javascript:alert(1)' }] } }), 422);
      expect(e.details?.[0]).toMatch(/href/);
      st = await s.apply(id, { op: 'setProps', itemId: item, propOverrides: { title: 'Hola {company}' } });
      expect(st.items[0].propOverrides).toEqual({ title: 'Hola {company}' });
      expect(st.items[0].error).toBeNull();
    });

    test('actualizar a la última versión del módulo', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      let st = await s.apply(id, { op: 'addItem', moduleVersionId: V.heroV1 });
      expect(st.items[0].upgradeTo?.version).toBe(2);
      st = await s.apply(id, { op: 'upgradeItem', itemId: st.items[0].id });
      expect(st.items[0].version).toBe(2);
      expect(st.items[0].upgradeTo).toBeNull();
      await rejects(s.apply(id, { op: 'upgradeItem', itemId: st.items[0].id }), 409);
    });

    test('precio total obligatorio para publicar en modo total', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      await s.apply(id, { op: 'addItem', moduleVersionId: V.pricing });
      await s.apply(id, { op: 'update', patch: { priceMode: 'total' } });
      const e = await rejects(s.apply(id, { op: 'setStatus', status: 'published' }), 409);
      expect(e.details?.join()).toMatch(/precio total/);
      const st = await s.apply(id, { op: 'update', patch: { totalPrice: 1990.5 } });
      expect(st.total?.amount).toBe(1990.5);
      expect((await s.apply(id, { op: 'setStatus', status: 'published' })).dossier.status).toBe('published');
    });

    test('borrar: solo si no está publicado', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      await s.apply(id, { op: 'addItem', moduleVersionId: V.pricing });
      await s.apply(id, { op: 'setStatus', status: 'published' });
      await rejects(s.deleteDossier(id), 409);
      await s.apply(id, { op: 'setStatus', status: 'archived' });
      await s.deleteDossier(id);
      await rejects(s.getState(id), 404);
    });

    test('crear desde plantilla copia módulos, precios y modo', async () => {
      const id = await svc(USERS.rep).createDossier({ title: 'Copia', fromDossierId: SALA_X });
      const st = await svc(USERS.rep).getState(id);
      expect(st.dossier.authorId).toBe(USERS.rep.id);
      expect(st.dossier.priceMode).toBe('per_module');
      expect(st.items.length).toBe(5);
      expect(st.items.filter((i) => !i.visible).length).toBe(1);
      expect(st.items.find((i) => i.priceOverride === 250)).toBeTruthy();
      expect(st.canEdit).toBe(true);
    });

    test('reordenar muchas veces en el mismo hueco mantiene el orden (rebalanceo)', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      let st = await s.apply(id, { op: 'addItem', moduleVersionId: V.heroV1 });
      st = await s.apply(id, { op: 'addItem', moduleVersionId: V.tabsExp });
      st = await s.apply(id, { op: 'addItem', moduleVersionId: V.pricing });
      for (let k = 0; k < 45; k++) {
        // alterna el último y el penúltimo dentro del hueco entre #0 y #1
        st = await s.apply(id, { op: 'move', itemId: st.items[2].id, toIndex: 1 });
      }
      const pos = st.items.map((i) => i.position);
      expect([...pos].sort((a, b) => a - b)).toEqual(pos);
      expect(new Set(pos).size).toBe(3);
    });

    test('defensa en profundidad: sesión falsificada con otro tenant la frena la RLS', async () => {
      if (!E.enforcesRls) return;
      // Usuario de ALT con sesión que dice ser admin de ENJOY: el servicio no lo detecta, la RLS sí.
      const forged = svc(USERS.altRep, { tenantId: ENJOY, role: 'admin' });
      await rejects(forged.getState(SALA_X), 404);
      expect((await forged.listDossiers()).length).toBe(0);
    });
  });
}
