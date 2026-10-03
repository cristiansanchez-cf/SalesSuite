/**
 * Contrato del servicio de la consola. Se ejecuta contra la BD demo (service.test.ts) y contra
 * Postgres + PostgREST + RLS reales (service.supabase.test.ts) para garantizar el mismo comportamiento.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import type { AdminDb, AssetStore, Identity } from './db';
import { AdminError, createAdminService } from './service';
import { createTenantAdminService } from './tenant-service';
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
  identity(): Identity;
  /** Tenant público por slug (RPC resolve_tenant o repo demo): para comprobar cambios de marca. */
  publicTenant(slug: string): Promise<{ name: string; brand: Record<string, unknown>; themeTokens: Record<string, unknown> } | null>;
}

const fakeAssets = (): AssetStore & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, async upload(t, f, kind) { calls.push(`${t}/${kind}`); return { url: `https://cdn.example.com/${t}/${kind}-${f.name}` }; } };
};

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
      // La demo añade propuestas de ejemplo para la analítica (docs/ANALYTICS.md): lo que importa es que no se cuele otro tenant.
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.some((d) => d.id === '00000000-0000-4000-8000-000000d05504')).toBe(false);
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
      // El comercial no escribe precios (docs/COMMISSIONS.md §Tarifas); un admin sí puede ajustar a medida.
      await rejects(s.apply(id, { op: 'setPrice', itemId: st.items[0].id, priceOverride: 250 }), 403);
      st = await svc(USERS.admin).apply(id, { op: 'setPrice', itemId: st.items[0].id, priceOverride: 250 });
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
      await rejects(svc(USERS.rep).apply(await svc(USERS.rep).createDossier({ title: 'R' }), { op: 'update', patch: { priceMode: 'total' } }), 403);
      const s = svc(USERS.admin);
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
      // El comercial no hereda precios a mano: salen del catálogo o de una tarifa.
      expect(st.items.some((i) => i.priceOverride != null)).toBe(false);
      expect(st.canEdit).toBe(true);
      const byAdmin = await svc(USERS.admin).getState(await svc(USERS.admin).createDossier({ title: 'Copia admin', fromDossierId: SALA_X }));
      expect(byAdmin.items.find((i) => i.priceOverride === 250)).toBeTruthy();
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

    test('editar módulos actualiza la fecha de edición del dossier', async () => {
      const s = svc(USERS.rep);
      const id = await s.createDossier({ title: 'T' });
      const before = (await s.getState(id)).dossier.updatedAt!;
      await new Promise((r) => setTimeout(r, 20));
      const after = (await s.apply(id, { op: 'addItem', moduleVersionId: V.pricing })).dossier.updatedAt!;
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });

    test('defensa en profundidad: sesión falsificada con otro tenant la frena la RLS', async () => {
      if (!E.enforcesRls) return;
      // Usuario de ALT con sesión que dice ser admin de ENJOY: el servicio no lo detecta, la RLS sí.
      const forged = svc(USERS.altRep, { tenantId: ENJOY, role: 'admin' });
      await rejects(forged.getState(SALA_X), 404);
      expect((await forged.listDossiers()).length).toBe(0);
    });
  });

  describe(`gestión del tenant · ${name}`, () => {
    let E: ContractEnv;
    const tsvc = (u: U, assets: AssetStore = fakeAssets()) =>
      createTenantAdminService(E.dbFor(u.id), session(u), { identity: E.identity(), assets });

    beforeEach(async () => {
      E = env();
      await E.reset();
    });

    test('solo admins', async () => {
      await rejects(tsvc(USERS.rep).listMembers(), 403);
      await rejects(tsvc(USERS.rep).listCatalog(), 403);
      await rejects(tsvc(USERS.rep).saveSettings({}), 403);
    });

    test('equipo: invitar, promover, no quedarse sin admin, quitar', async () => {
      const t = tsvc(USERS.admin);
      expect((await t.listMembers()).map((m) => m.role)).toEqual(['admin', 'rep']);
      const r = await t.invite({ email: 'Nuevo@Enjoy.test', role: 'rep' }, 'https://x/admin/auth/confirm');
      expect(r.invited).toBe(true);
      const members = await t.listMembers();
      const nuevo = members.find((m) => m.email === 'nuevo@enjoy.test')!;
      expect(nuevo.role).toBe('rep');
      await rejects(t.invite({ email: 'nuevo@enjoy.test', role: 'rep' }, 'x'), 409);
      await rejects(t.invite({ email: 'no-es-email', role: 'rep' }, 'x'), 422);

      // usuario existente de otro tenant: se añade sin re-invitar
      const r2 = await t.invite({ email: USERS.altRep.email, role: 'rep' }, 'x');
      expect(r2.invited).toBe(false);

      await rejects(t.setRole(USERS.admin.id, 'rep'), 409);
      await rejects(t.removeMember(USERS.admin.id), 409);
      await t.setRole(nuevo.userId, 'admin');
      await t.setRole(USERS.admin.id, 'rep');  // ahora sí: queda otro admin
      expect((await t.listMembers()).find((m) => m.userId === USERS.admin.id)?.role).toBe('rep');
      // el antiguo admin ya no puede gestionar (el rol de la sesión se recalcula en cada petición)
      const newRole = await E.dbFor(USERS.admin.id).membershipRole(USERS.admin.id, ENJOY);
      expect(newRole).toBe('rep');
      await rejects(createTenantAdminService(E.dbFor(USERS.admin.id), session(USERS.admin, { role: newRole! }), { identity: E.identity(), assets: fakeAssets() }).listMembers(), 403);
      const t2 = createTenantAdminService(E.dbFor(nuevo.userId), { userId: nuevo.userId, email: 'nuevo@enjoy.test', displayName: null, tenantId: ENJOY, role: 'admin' }, { identity: E.identity(), assets: fakeAssets() });
      await t2.removeMember(USERS.rep.id);
      expect((await t2.listMembers()).some((m) => m.userId === USERS.rep.id)).toBe(false);
    });

    test('catálogo: crear módulo, publicar, nueva versión, archivar', async () => {
      const t = tsvc(USERS.admin);
      const { moduleId, versionId } = await t.createModule({ key: 'hero-locales', blockType: 'hero-pitch', name: 'Hero · Locales', description: '' });
      await rejects(t.createModule({ key: 'hero-locales', blockType: 'hero-pitch', name: 'dup' }), 409);
      await rejects(t.createModule({ key: 'X Y', blockType: 'hero-pitch', name: 'mal' }), 422);
      await rejects(t.createModule({ key: 'ok-key', blockType: 'no-existe', name: 'mal' }), 422);

      let cat = await t.listCatalog();
      let mod = cat.find((m) => m.id === moduleId)!;
      expect(mod.versions[0]).toMatchObject({ version: 1, status: 'draft', error: null });

      // el borrador no aparece en el catálogo del builder
      const builder = createAdminService(E.dbFor(USERS.rep.id), session(USERS.rep));
      const dossierId = await builder.createDossier({ title: 'T' });
      expect((await builder.getState(dossierId)).catalog.some((c) => c.moduleId === moduleId)).toBe(false);

      const e = await rejects(t.saveDraft(versionId, { defaultProps: { title: '' }, defaultPrice: null, currency: 'EUR' }), 422);
      expect(e.details?.join()).toMatch(/title/);
      await t.saveDraft(versionId, { defaultProps: { title: 'Tu local, {company}' }, defaultPrice: 99, currency: 'EUR' });
      await t.publish(versionId);
      expect((await builder.getState(dossierId)).catalog.find((c) => c.moduleId === moduleId)?.version).toBe(1);
      await rejects(t.saveDraft(versionId, { defaultProps: { title: 'x' }, defaultPrice: null, currency: 'EUR' }), 409);

      // usar v1 en un dossier publicado y crear v2
      let st = await builder.apply(dossierId, { op: 'addItem', moduleVersionId: versionId });
      await builder.apply(dossierId, { op: 'setStatus', status: 'published' });
      st = await builder.apply(dossierId, { op: 'createLink' });
      const token = st.links[0].token;

      const v2 = await t.newDraft(moduleId);
      expect(await t.newDraft(moduleId)).toBe(v2);  // reutiliza el borrador
      await t.saveDraft(v2, { defaultProps: { title: 'Versión 2' }, defaultPrice: 120, currency: 'EUR' });
      await t.publish(v2);
      cat = await t.listCatalog();
      mod = cat.find((m) => m.id === moduleId)!;
      expect(mod.versions.map((v) => [v.version, v.status, v.usage])).toEqual([[2, 'published', 0], [1, 'published', 1]]);
      st = await builder.getState(dossierId);
      expect(st.items[0].upgradeTo?.version).toBe(2);

      // archivar v1: fuera del catálogo, pero el dossier publicado sigue renderizando
      await t.archive(versionId);
      await rejects(t.publish(versionId), 409);
      expect((await E.publicGet(token, ENJOY))?.items.map((i) => i.blockType)).toEqual(['hero-pitch']);

      const preview = await t.previewVersion(v2, 'es-ES');
      expect(preview.items[0].defaultProps).toEqual({ title: 'Versión 2' });

      await t.updateModule(moduleId, { name: 'Hero · Locales (nuevo)' });
      expect((await t.listCatalog()).some((m) => m.name === 'Hero · Locales (nuevo)')).toBe(true);
    });

    test('marca y tema: validados y visibles en público', async () => {
      const t = tsvc(USERS.admin);
      const cur = await t.getSettings();
      expect(cur.slug).toBe('enjoy');
      await rejects(t.saveSettings({ name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: { colors: { primary: 'red' } }, brand: {} }), 422);
      await rejects(t.saveSettings({ name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: {}, brand: { logoUrl: 'javascript:alert(1)' } }), 422);
      await t.saveSettings({
        name: 'Enjoy the Club', defaultLocale: 'es-ES',
        themeTokens: { colors: { primary: '#ff0088' } },
        brand: { logoUrl: 'https://cdn.example.com/logo.svg', contact: { whatsapp: '34600111222' } },
      });
      const pub = await E.publicTenant('enjoy');
      expect(pub?.brand).toMatchObject({ logoUrl: 'https://cdn.example.com/logo.svg', contact: { whatsapp: '34600111222' } });
      expect(pub?.themeTokens).toMatchObject({ colors: { primary: '#ff0088' } });
    });

    test('subida de assets: tipos y tamaño', async () => {
      const assets = fakeAssets();
      const t = tsvc(USERS.admin, assets);
      const url = await t.uploadAsset({ name: 'logo.svg', type: 'image/svg+xml', bytes: new Uint8Array([60]) }, 'logo');
      expect(url).toContain(`${ENJOY}/logo`);
      await rejects(t.uploadAsset({ name: 'x', type: 'image/png', bytes: new Uint8Array([1]) }, 'virus'), 422);
      await rejects(t.uploadAsset({ name: 'x', type: 'image/png', bytes: new Uint8Array(5 * 1024 * 1024 + 1) }, 'logo'), 422);
      await rejects(t.uploadAsset({ name: 'x', type: 'image/png', bytes: new Uint8Array(0) }, 'logo'), 422);
      expect(assets.calls).toEqual([`${ENJOY}/logo`]);
    });

    test('defensa en profundidad: sesión falsificada como admin no gestiona el tenant', async () => {
      if (!E.enforcesRls) return;
      // rep de Enjoy con sesión que dice ser admin: el servicio lo deja pasar, la RLS no.
      const forged = createTenantAdminService(E.dbFor(USERS.rep.id), session(USERS.rep, { role: 'admin' }), { identity: E.identity(), assets: fakeAssets() });
      await rejects(forged.saveSettings({ name: 'Hack', defaultLocale: 'es-ES', themeTokens: {}, brand: {} }), 403);
      await rejects(forged.setRole(USERS.rep.id, 'admin'), 403);
      await expect(forged.createModule({ key: 'hack', blockType: 'hero-pitch', name: 'Hack' })).rejects.toThrow();
      expect((await E.publicTenant('enjoy'))?.name).toBe('Enjoy the Club');
    });
  });
}
