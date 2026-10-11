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
import type { CrmDb } from '../crm/db';
import { createCrmService } from '../crm/service';
import { fixtureResearch } from '../crm/research';
import { fixturePlaces } from '../crm/places';
import { fixtureWebsite } from '../crm/website';
import { fixtureNotes } from '../crm/notes';
import { fixtureZoneNames, REVIEW_TAG } from '../crm/zones-normalize';
import { NO_ZONE } from './service';

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
  crmDbFor(userId: string): CrmDb;
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
        notifyDb: E.notifyDbFor(u.id), accountsDb: (id) => E.accountsDbFor(id), crmDb: (id) => E.crmDbFor(id),
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
    test('CRM: el admin define campos; quien trabaja la cuenta rellena su ficha; la lista filtra por campo', async () => {
      const { vlc } = await territory();
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      await rejects(rep.accounts.saveField({ label: 'Mío', type: 'text' }), 403);
      const pantalla = await admin.accounts.saveField({ label: '¿Tiene pantalla?', type: 'checkbox', inList: true, filterable: true });
      await admin.accounts.saveField({ label: 'Noches', type: 'multi_select', options: 'Viernes\nSábado', filterable: true });
      await admin.accounts.saveField({ label: 'Aforo', type: 'number' });
      const keys = (await rep.accounts.crmFields()).map((f) => f.key);
      expect(keys).toEqual(['tiene-pantalla', 'noches', 'aforo']);

      const sol = await rep.accounts.create({ name: 'Club Sol', zoneId: vlc });
      const luna = await rep.accounts.create({ name: 'Sala Luna', zoneId: vlc });
      await rep.accounts.setFields(sol, { 'tiene-pantalla': true, noches: ['viernes', 'sabado'], aforo: '450' });
      await rejects(rep.accounts.setFields(luna, { aforo: 'muchos' }), 422);
      expect((await rep.accounts.get(sol)).account.fields).toEqual({ 'tiene-pantalla': true, noches: ['viernes', 'sabado'], aforo: 450 });
      // Vaciar borra; lo que no llega se conserva.
      await rep.accounts.setFields(sol, { noches: [] });
      expect((await rep.accounts.get(sol)).account.fields).toEqual({ 'tiene-pantalla': true, aforo: 450 });

      const conPantalla = await rep.accounts.list({ scope: 'all', fields: { 'tiene-pantalla': 'yes' } });
      expect(conPantalla.items.map((a) => a.name)).toEqual(['Club Sol']);
      const sin = await rep.accounts.list({ scope: 'all', fields: { 'tiene-pantalla': 'no' } });
      expect(sin.items.map((a) => a.name)).toEqual(['Sala Luna']);

      // Renombrar no toca los datos; archivar no los borra.
      await admin.accounts.saveField({ label: 'Pantalla propia', type: 'checkbox', inList: true }, pantalla);
      expect((await rep.accounts.crmFields()).find((f) => f.id === pantalla)?.key).toBe('tiene-pantalla');
      await admin.accounts.archiveField(pantalla, true);
      expect((await rep.accounts.crmFields()).map((f) => f.key)).not.toContain('tiene-pantalla');
      expect((await rep.accounts.get(sol)).account.fields['tiene-pantalla']).toBe(true);
      await admin.accounts.moveField((await admin.accounts.crmFields()).find((f) => f.key === 'aforo')!.id, -1);
      expect((await admin.accounts.crmFields()).map((f) => f.key)).toEqual(['aforo', 'noches']);
    });
    test('CRM fase 2: personas en varias empresas, grupos de un nivel, alta rápida y bandeja', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      // Alta rápida: la persona y «¿dónde?» con una empresa nueva al vuelo.
      const bruno = await rep.crm.quickAdd({ name: 'Bruno', company: 'La Brecha', role: 'Fundador', email: 'BRUNO@brecha.test', tag: 'FBD' });
      expect(bruno.accountId).toBeTruthy();
      const again = await rep.crm.quickAdd({ name: 'Eva', company: 'la brecha', role: 'Sala' });
      expect(again.accountId).toBe(bruno.accountId);  // misma empresa, no un duplicado
      await rep.crm.quickAdd({ name: 'Sin Sitio' });
      await rep.crm.link(bruno.id, { company: 'Club Faro', role: 'DJ' });
      const p = await rep.crm.person(bruno.id);
      expect(p.person).toMatchObject({ email: 'bruno@brecha.test', tags: ['fbd'], ownerId: U.rep.id });
      expect(p.person.companies.map((c) => `${c.name}:${c.role}`).sort()).toEqual(['Club Faro:DJ', 'La Brecha:Fundador']);
      const all = await rep.crm.people();
      expect(all.tray).toBe(1);
      expect((await rep.crm.people({ company: 'none' })).items.map((x) => x.name)).toEqual(['Sin Sitio']);
      expect((await rep.crm.people({ tag: 'fbd' })).items.map((x) => x.name)).toEqual(['Bruno']);
      expect((await rep.crm.similar('bruno')).map((x) => x.name)).toEqual(['Bruno']);

      // Grupo de un nivel: el comercial agrupa sus empresas; un grupo no entra en otro.
      const faro = p.person.companies.find((c) => c.name === 'Club Faro')!.accountId;
      const g = await rep.crm.moveToGroup([bruno.accountId!, faro], { groupName: 'Grupo Costa' });
      expect(g.moved).toBe(2);
      const brecha = await rep.crm.company(bruno.accountId!);
      expect(brecha.group?.name).toBe('Grupo Costa');
      expect(brecha.people.map((x) => x.name).sort()).toEqual(['Bruno', 'Eva']);
      expect((await rep.crm.company(g.groupId!)).locales.map((a) => a.name).sort()).toEqual(['Club Faro', 'La Brecha']);
      const otro = await admin.accounts.create({ name: 'Holding' });
      await rejects(admin.crm.moveToGroup([g.groupId!], { groupId: otro }), 422);
      await rejects(admin.crm.moveToGroup([otro], { groupId: bruno.accountId! }), 422);

      // Permisos: el comercial no borra personas ni importa.
      await rejects(rep.crm.deletePerson(bruno.id), 403);
      await rejects(rep.crm.importStart('x.csv', 'Nombre\nA', 'account'), 403);
      await admin.crm.deletePerson(again.id);
      expect((await rep.crm.company(bruno.accountId!)).people.map((x) => x.name)).toEqual(['Bruno']);
    });

    test('CRM fase 2: importar empresas y personas, fusionar con lo que hay y deshacer', async () => {
      const admin = await ctx(U.admin);
      const es = await admin.accounts.saveZone({ name: 'España', kind: 'country' });
      await admin.accounts.saveZone({ name: 'Valencia', parentId: es });
      const viejo = await admin.accounts.create({ name: 'Beat DJ', notes: 'Ya hablamos' });

      // Empresas: duplicados fuera, estado como etapa, tipos unificados, ciudad nueva como zona, lista propia.
      const csv = 'Nombre,Ciudad,Estado Lead,Tipo,Precio desde €,Email\n'
        + 'Luz y Ritmo,Valencia,🆕 Sin contactar,DJ/AV,"€1,200.00",hola@luz.test\n'
        + 'Luz y Ritmo,Valencia,🆕 Sin contactar,DJ/AV,"€1,200.00",hola@luz.test\n'
        + 'Sonido Sur,Sevilla,✅ Interesado,DJ / AV,€300.00,correo-raro\n'
        + 'Beat DJ,Málaga,🆕 Sin contactar,DJ,€250.00,\n';
      const imp = await admin.crm.importStart('proveedores.csv', csv, 'account');
      const draft = await admin.crm.importDraft(imp);
      expect(draft.rowCount).toBe(4);
      const { plan, mapping } = await admin.crm.importPreview(imp);
      expect(plan.stats).toMatchObject({ duplicates: 1, accountsCreated: 2, accountsMerged: 1, toNotes: 1 });
      await admin.crm.importPreview(imp, { ...mapping, tag: 'proveedores-bodas', options: { 'Estado Lead': ['Sin contactar', 'Interesado', 'Acuerdo cerrado'] } });
      const st = await admin.crm.importRun(imp);
      expect(st).toMatchObject({ accountsCreated: 2, accountsMerged: 1, zonesCreated: 2, fieldsCreated: 3 });
      expect((await admin.accounts.list({ scope: 'all' })).items.find((a) => a.name === 'Luz y Ritmo')?.email).toBe('hola@luz.test');
      await rejects(admin.crm.importRun(imp), 409);
      const fields = await admin.accounts.crmFields();
      const estado = fields.find((f) => f.key === 'estado-lead')!;
      expect(estado).toMatchObject({ isStage: true, tags: ['proveedores-bodas'], target: 'account' });
      expect(estado.options.map((o) => o.label)).toEqual(['Sin contactar', 'Interesado', 'Acuerdo cerrado']);
      const list = (await admin.accounts.list({ scope: 'all' })).items;
      const luz = list.find((a) => a.name === 'Luz y Ritmo')!;
      expect(luz).toMatchObject({ tags: ['proveedores-bodas'], fields: { 'precio-desde': 1200, tipo: 'dj-av', 'estado-lead': 'sin-contactar' } });
      expect(luz.zonePath).toBe('España › Valencia');
      expect(list.find((a) => a.name === 'Sonido Sur')!.notes).toBe('Email: correo-raro');
      const beat = list.find((a) => a.id === viejo)!;
      expect(beat).toMatchObject({ notes: 'Ya hablamos', tags: ['proveedores-bodas'], fields: { 'precio-desde': 250 } });
      expect(beat.zonePath).toContain('Málaga');

      // Personas: una persona en una empresa que ya existe; los cargos en «Empresa» no crean empresas.
      const people = 'Name,Empresa/Local,Rol,Ciudad,Status\nBruno,Luz y Ritmo,Owner,Valencia,No comenzado\nCarla,CEO,,Valencia,Investigado\nDani,Nueva Sala,Artist,Valencia,Hablando\n';
      const imp2 = await admin.crm.importStart('fbd.csv', people, 'contact');
      const pv = await admin.crm.importPreview(imp2);
      await admin.crm.importPreview(imp2, { ...pv.mapping, tag: 'fbd' });
      expect(await admin.crm.importRun(imp2)).toMatchObject({ contactsCreated: 3, accountsCreated: 1, accountsMerged: 1, links: 2, noCompany: 1 });
      const ps = (await admin.crm.people({ tag: 'fbd' })).items;
      expect(ps.find((x) => x.name === 'Carla')!.companies).toEqual([]);
      expect(ps.find((x) => x.name === 'Bruno')!.companies.map((c) => `${c.name}:${c.role}`)).toEqual(['Luz y Ritmo:Owner']);
      expect(ps.find((x) => x.name === 'Bruno')!.fields).toMatchObject({ status: 'no-comenzado' });

      // Deshacer: lo creado se va, lo fusionado vuelve a como estaba, los campos nuevos se archivan.
      expect(await admin.crm.importUndo(imp2)).toMatchObject({ people: 3, companies: 1 });
      expect((await admin.crm.people()).items).toHaveLength(0);
      expect(await admin.crm.importUndo(imp)).toMatchObject({ companies: 2 });
      const after = (await admin.accounts.list({ scope: 'all' })).items;
      expect(after.map((a) => a.name)).toEqual(['Beat DJ']);
      expect(after[0]).toMatchObject({ notes: 'Ya hablamos', tags: [], fields: {}, zoneId: null });
      expect((await admin.accounts.crmFields()).map((f) => f.key)).toEqual([]);
      expect((await admin.accounts.territory()).zones.map((z) => z.name).sort()).toEqual(['España', 'Valencia']);
      await rejects(admin.crm.importUndo(imp), 409);
    });
    test('CRM fase 3: contacto de la empresa, interacciones, regla de los 3 intentos y «Hoy»', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      const marta = await rep.crm.quickAdd({ name: 'Marta', company: 'Club Hoy', role: 'Gerente', phone: '+34 600 000 001' });
      const acc = marta.accountId!;
      await rep.crm.setCompanyContact(acc, { instagram: '@clubhoy', email: 'HOLA@clubhoy.test', website: 'clubhoy.test' });
      const a = (await rep.accounts.get(acc)).account;
      expect(a).toMatchObject({ instagram: 'https://www.instagram.com/clubhoy/', email: 'hola@clubhoy.test', website: 'https://clubhoy.test' });

      // Primer contacto: sin respuesta → la app propone otra vía con la misma persona en 2 días.
      const s1 = await rep.crm.logActivity(acc, { contactId: marta.id, channel: 'instagram', outcome: 'no_reply', note: 'Mensaje por IG' });
      expect(s1).toMatchObject({ contactId: marta.id, channel: 'whatsapp', reason: 'retry', attempt: 2 });
      await rep.crm.logActivity(acc, { contactId: marta.id, channel: 'whatsapp', outcome: 'no_reply' });
      const s3 = await rep.crm.logActivity(acc, { contactId: marta.id, channel: 'phone', outcome: 'no_reply' });
      expect(s3).toMatchObject({ channel: 'visit', reason: 'visit' });  // una sola persona: tras 3 sin respuesta, en persona
      const tl = await rep.crm.timeline(acc);
      expect(tl.items.map((x) => x.channel)).toEqual(['phone', 'whatsapp', 'instagram']);
      expect(tl.next).toMatchObject({ channel: 'visit', contactId: marta.id });

      // Una nota de investigación no cuenta como intento ni cambia el próximo paso.
      expect(await rep.crm.logActivity(acc, { channel: 'other', outcome: 'note', note: 'Padre e hija, negocio familiar' })).toBeNull();

      // El próximo paso lo puede fijar el comercial; «Hoy» lo enseña con su contexto.
      await rep.crm.setNextStep(acc, { at: new Date(Date.now() - 86_400_000).toISOString(), channel: 'whatsapp', contactId: marta.id, step: 'Proponer cita el jueves' });
      const today = await rep.crm.today();
      expect(today.counts.overdue).toBe(1);
      expect(today.items[0]).toMatchObject({ name: 'Club Hoy', bucket: 'overdue', nextStep: 'Proponer cita el jueves', contactName: 'Marta', contactPhone: '+34 600 000 001' });
      expect(today.items[0].last?.outcome).toBe('note');
      expect((await admin.crm.today()).items).toHaveLength(0);           // «Hoy» es de quien la lleva
      await rep.crm.setNextStep(acc, null);
      expect((await rep.crm.today()).items).toHaveLength(0);

      // Arreglo: el Instagram del local guardado en la persona pasa a la empresa.
      const p = await rep.crm.quickAdd({ name: 'Bruno', company: 'Sala Luna Llena', instagram: 'https://www.instagram.com/salalunallena/' });
      const prev = await admin.crm.instagramToCompanies(false);
      expect(prev.count).toBe(1);
      await admin.crm.instagramToCompanies(true);
      expect((await rep.accounts.get(p.accountId!)).account.instagram).toBe('https://www.instagram.com/salalunallena/');
      expect((await rep.crm.person(p.id)).person.instagram).toBeNull();
      await rejects(rep.crm.instagramToCompanies(false), 403);
    });
    test('CRM prioridad: cualificar con un clic sin reservar, pesos del admin y «se enfría» primero en «Hoy»', async () => {
      const admin = await ctx(U.admin);
      const rep = await ctx(U.rep);
      const libre = await admin.accounts.create({ name: 'Sala Prioridad' });
      // Cualificar una empresa libre no la reserva; pulsar lo mismo otra vez lo desmarca.
      await rep.crm.qualify(libre, 'kind:venue');
      await rep.crm.qualify(libre, 'nights:4+');
      await rep.crm.qualify(libre, 'decider:onsite');
      await rep.crm.qualify(libre, 'screens:yes');
      await rep.crm.qualify(libre, 'screens:yes');
      let a = (await rep.accounts.get(libre)).account;
      expect(a.qualification).toEqual({ kind: 'venue', nights: '4+', decider: 'onsite' });
      expect(a.ownerId).toBeNull();
      await rep.crm.qualify(libre, 'validate:true');
      expect((await rep.accounts.get(libre)).account.qualification.validate).toBe(true);
      await rejects(rep.crm.qualify(libre, 'nights:9'), 422);

      // Una empresa de otro: el comercial no la cualifica.
      const ajena = await admin.accounts.create({ name: 'Sala Ajena' });
      await admin.accounts.assign(ajena, E.rep2.id);
      await rejects(rep.crm.qualify(ajena, 'nights:2'), 403);

      // Pesos: solo admin y deben sumar 100.
      expect(await rep.crm.weights()).toEqual({ recurrence: 30, decider: 25, screens: 20, dynamics: 15, scale: 10 });
      await rejects(rep.crm.saveWeights({ recurrence: 40, decider: 25, screens: 15, dynamics: 10, scale: 10 }), 403);
      await rejects(admin.crm.saveWeights({ recurrence: 50, decider: 25, screens: 15, dynamics: 10, scale: 10 }), 422);
      await admin.crm.saveWeights({ recurrence: 40, decider: 25, screens: 15, dynamics: 10, scale: 10 });
      expect((await rep.crm.weights()).recurrence).toBe(40);

      // Contestó hace una semana y no hemos hecho nada: se enfría y sale el primero en «Hoy».
      const mia = await rep.crm.quickAdd({ name: 'Lucía', company: 'Club Frío' });
      await rep.crm.logActivity(mia.accountId!, { contactId: mia.id, channel: 'whatsapp', outcome: 'interested', happenedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() },
        { at: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) });
      const hoy = await rep.crm.today();
      expect(hoy.items[0]).toMatchObject({ name: 'Club Frío', bucket: 'cooling' });
      expect(hoy.items[0].cooling).toBeGreaterThanOrEqual(3);
      expect((await rep.crm.cooling([mia.accountId!])).get(mia.accountId!)).toBeGreaterThanOrEqual(3);
      await rep.crm.logActivity(mia.accountId!, { contactId: mia.id, channel: 'whatsapp', outcome: 'no_reply' });
      expect((await rep.crm.cooling([mia.accountId!])).size).toBe(0);
    });

    test('CRM investigación con IA: propuestas con fuente; aceptar rellena huecos sin reservar; la de otro no', async () => {
      const admin = await ctx(U.admin);
      const repCtx = await ctx(U.rep);
      const rep = createCrmService(E.crmDbFor(U.rep.id), E.accountsDbFor(U.rep.id), E.adminDbFor(U.rep.id), repCtx.session, { places: null, routes: null, research: fixtureResearch() });
      const libre = await admin.accounts.create({ name: 'Sala IA' });
      const r = await rep.aiRun(libre, { sector: null, seller: 'Enjoy' });
      expect(r.suggestions.map((x) => (x.kind === 'person' ? 'person' : x.key))).toEqual(['nights', 'screens', 'email', 'person']);
      const sid = (k: string) => r.suggestions.find((x) => (x.kind === 'person' ? 'person' : x.key) === k)!.id;
      await rep.aiDecide(libre, sid('email'), true);
      await rep.aiDecide(libre, sid('nights'), true);
      await rep.aiDecide(libre, sid('screens'), false);
      const a = (await repCtx.accounts.get(libre)).account;
      expect(a).toMatchObject({ email: 'hola@ejemplo.test', ownerId: null });
      expect(a.qualification).toEqual({ nights: '3' });
      expect(a.aiResearchAt).toBeTruthy();
      expect((await rep.aiResearch(libre))?.suggestions.map((x) => x.status)).toEqual(['accepted', 'dismissed', 'accepted', 'open']);
      await rejects(rep.aiRun(libre, { sector: null, seller: 'Enjoy' }), 409);

      const ajena = await admin.accounts.create({ name: 'Sala IA Ajena' });
      await admin.accounts.assign(ajena, E.rep2.id);
      await rejects(rep.aiRun(ajena, { sector: null, seller: 'Enjoy' }), 403);
    });

    test('CRM ordenar ciudades: en bloque solo admin; nota y «revisar»; deshacer; borrar vacías sin tocar lo asignado', async () => {
      const t = await territory();
      const admCtx = t.admin;
      const adm = createCrmService(E.crmDbFor(U.admin.id), E.accountsDbFor(U.admin.id), E.adminDbFor(U.admin.id), admCtx.session, { places: null, routes: null, research: null, zoneNames: fixtureZoneNames() });
      const req = await admCtx.accounts.saveZone({ name: 'Requena (Valencia)', parentId: t.es });
      const bad = await admCtx.accounts.saveZone({ name: 'Barcelona creo que no es correcto, que están en Valencia', parentId: t.es });
      await admCtx.accounts.saveZone({ name: '28039', parentId: t.es });
      const a1 = await admCtx.accounts.create({ name: 'Sala Requena', zoneId: req, notes: 'Tiene DJ.' });
      const a2 = await admCtx.accounts.create({ name: 'Sala Dudosa', zoneId: bad });
      const o = await adm.zonesOverview();
      expect(o.raws).toEqual(expect.arrayContaining(['Requena (Valencia)', 'Barcelona creo que no es correcto, que están en Valencia']));
      const classes = await adm.zonesClassify(o.raws);
      const r = await adm.zonesApply(classes);
      expect(r.moved).toBe(2);
      const s1 = (await admCtx.accounts.get(a1)).account;
      expect(s1.zonePath).toBe('España › Comunidad Valenciana › Valencia › Requena');
      expect(s1.notes).toBe('Tiene DJ.\nCiudad en el Notion: Requena (Valencia)');
      const s2 = (await admCtx.accounts.get(a2)).account;
      expect(s2.zoneId).toBe(t.vlc);
      expect(s2.tags).toContain(REVIEW_TAG);
      // Lo ya ordenado no vuelve a salir como pendiente; sí lo que queda por revisar y lo que no tiene ciudad.
      const sin = await admCtx.accounts.create({ name: 'Sala Sin Ciudad' });
      const o2 = await adm.zonesOverview();
      expect(o2.raws).not.toContain('Requena');
      expect(o2.raws).not.toContain('Valencia');
      expect(o2.review).toBeGreaterThanOrEqual(1);
      expect(o2.noCity).toBeGreaterThanOrEqual(1);
      const noZone = (await admCtx.accounts.list({ scope: 'all', zoneId: NO_ZONE })).items.map((x) => x.id);
      expect(noZone).toContain(sin);
      expect(noZone).not.toContain(a1);

      // Un comercial no ordena en bloque.
      const repCtx = await ctx(U.rep);
      const rep = createCrmService(E.crmDbFor(U.rep.id), E.accountsDbFor(U.rep.id), E.adminDbFor(U.rep.id), repCtx.session, { zoneNames: fixtureZoneNames() });
      await rejects(rep.zonesOverview(), 403);

      const last = (await adm.zonesOverview()).last!;
      await adm.zonesUndo(last.id);
      expect((await admCtx.accounts.get(a1)).account).toMatchObject({ zoneId: req, notes: 'Tiene DJ.' });
      expect((await admCtx.accounts.get(a2)).account.tags).not.toContain(REVIEW_TAG);

      await adm.zonesApply(classes);
      expect(await adm.zonesCleanup()).toBeGreaterThanOrEqual(3);  // «Requena (Valencia)», la dudosa y «28039»
      const names = (await admCtx.accounts.territory()).zones.map((z) => z.name);
      expect(names).not.toContain('28039');
      expect(names).toEqual(expect.arrayContaining(['Comunidad Valenciana', 'Madrid', 'Requena']));  // asignadas o con empresas: se quedan
    });

    test('CRM fase 4: Google cambia o quita lo suyo (lo de a mano se queda); tipo y descartar; el punto de la ciudad', async () => {
      const t = await territory();
      const rep = await ctx(U.rep);
      const a = await t.admin.accounts.create({ name: 'Sala Fase 4', zoneId: t.vlc });   // libre: el comercial puede
      const db = E.accountsDbFor(U.rep.id);
      await db.research(a, { placeId: 'p1', phone: '+34 600 000 001', website: 'https://mal.es', address: null, mapsUrl: null, hours: null, lat: 39.4, lng: -0.3, status: 'OPERATIONAL', rating: 4.2, instagram: 'https://www.instagram.com/mal/' });
      let x = (await t.admin.accounts.get(a)).account;
      expect(x).toMatchObject({ phone: '+34 600 000 001', placeRating: 4.2, instagram: 'https://www.instagram.com/mal/' });
      expect(x.placeFilled).toMatchObject({ phone: '+34 600 000 001', instagram: 'https://www.instagram.com/mal/' });
      await t.admin.accounts.update(a, { name: 'Sala Fase 4', zoneId: t.vlc, address: 'Calle a mano 1' });
      await db.research(a, { placeId: 'p2', phone: '+34 600 000 002', website: 'https://bien.es', address: 'Calle de Google', mapsUrl: null, hours: null, lat: null, lng: null, status: null, replace: true });
      x = (await t.admin.accounts.get(a)).account;
      expect(x).toMatchObject({ placeId: 'p2', phone: '+34 600 000 002', website: 'https://bien.es', instagram: null, address: 'Calle a mano 1' });
      await db.research(a, { placeId: '', phone: null, website: null, address: null, mapsUrl: null, hours: null, lat: null, lng: null, status: null, replace: true });
      x = (await t.admin.accounts.get(a)).account;
      expect(x).toMatchObject({ placeId: null, phone: null, website: null, address: 'Calle a mano 1' });

      // Tipo y descartar: el comercial en una libre sí; en la de otro, no.
      await db.classify(a, 'dj', 'partner', 'Posible alianza');
      x = (await t.admin.accounts.get(a)).account;
      expect(x).toMatchObject({ kind: 'dj', discardReason: 'partner', discardNote: 'Posible alianza' });
      expect((await rep.accounts.list({ scope: 'all' })).items.map((i) => i.id)).not.toContain(a);
      expect((await rep.accounts.list({ scope: 'all', view: 'discarded' })).items.map((i) => i.id)).toContain(a);
      await db.classify(a, null, null, null);
      expect((await t.admin.accounts.get(a)).account.discardedAt).toBeNull();
      const ajena = await t.admin.accounts.create({ name: 'Sala Ajena 4', zoneId: t.vlc });
      await t.admin.accounts.assign(ajena, E.rep2.id);
      await expect(db.classify(ajena, 'dj', null, null)).rejects.toBeTruthy();
      await expect(db.classifyMany(ENJOY, [{ id: a, kind: 'dj', reason: null, note: null }])).rejects.toBeTruthy();   // en bloque, solo admin

      // El punto de una ciudad: solo admin, y no se pierde al renombrarla.
      expect(await db.setZoneLocation(t.vlc, 39.47, -0.37)).toBe(false);
      expect(await E.accountsDbFor(U.admin.id).setZoneLocation(t.vlc, 39.47, -0.37)).toBe(true);
      await t.admin.accounts.saveZone({ name: 'València', parentId: t.cv }, t.vlc);
      expect((await t.admin.accounts.territory()).zones.find((z) => z.id === t.vlc)).toMatchObject({ name: 'València', lat: 39.47, lng: -0.37 });
    });

    test('Buscar clientes (§19): buscar en una zona, importar sin duplicar, con su web y redes; el comercial se las queda', async () => {
      const t = await territory();
      const opts = { places: fixturePlaces(), website: fixtureWebsite(), routes: null, research: null };
      const adm = createCrmService(E.crmDbFor(U.admin.id), E.accountsDbFor(U.admin.id), E.adminDbFor(U.admin.id), t.admin.session, opts);
      const ya = await t.admin.accounts.create({ name: 'Discoteca Luna', zoneId: t.vlc });
      const id = await adm.prospectSearch({ what: 'discotecas', zoneId: t.vlc });
      let got = await adm.prospectGet(id);
      expect(got.sweep).toMatchObject({ query: 'discotecas', zoneId: t.vlc, found: 12 });
      expect(got.sweep.zoneLabel).toContain('Valencia');
      const st = Object.fromEntries(got.candidates.map((c) => [c.name, c.state]));
      expect(st).toMatchObject({ 'Discoteca Sol': 'new', 'Discoteca Luna': 'maybe', 'Discoteca Duna': 'closed' });
      expect(got.candidates.find((c) => c.name === 'Discoteca Luna')?.accountId).toBe(ya);

      const pick = got.candidates.filter((c) => c.name === 'Discoteca Sol' || c.name === 'Discoteca Mar').map((c) => c.placeId);
      const r = await adm.prospectImport(id, pick, 'me');
      expect(r).toMatchObject({ created: 2, have: 0, failed: 0 });
      const sol = (await t.admin.accounts.get(r.ids[pick[0]])).account;
      expect(sol).toMatchObject({ name: 'Discoteca Sol', placeId: pick[0], zoneId: t.vlc, ownerId: U.admin.id, website: 'https://discotecasol.test/', instagram: 'https://www.instagram.com/discotecasol/', email: 'hola@discotecasol.test', tags: ['discotecas'] });
      expect(sol.placeFilled).toMatchObject({ website: 'https://discotecasol.test/' });
      // «Es la misma»: la ficha de Google se une a la que ya tenías (sin crear otra).
      const luna = got.candidates.find((c) => c.name === 'Discoteca Luna')!;
      expect(await adm.prospectLink(id, luna.placeId, ya)).toEqual({ accountId: ya });
      expect((await t.admin.accounts.get(ya)).account).toMatchObject({ placeId: luna.placeId, website: 'https://discotecaluna.test/', instagram: 'https://www.instagram.com/discotecaluna/', zoneId: t.vlc });
      // Otra vez lo mismo: no se duplica.
      expect(await adm.prospectImport(id, pick, 'me')).toMatchObject({ created: 0, have: 2 });
      got = await adm.prospectGet(id);
      expect(got.candidates.filter((c) => c.state === 'have').map((c) => c.placeId).sort()).toEqual([...pick, luna.placeId].sort());
      expect((await adm.prospectList()).find((w) => w.id === id)).toMatchObject({ found: 12, importedCount: 3 });

      // El comercial ve las búsquedas del espacio; lo que importa es suyo aunque pida otra cosa.
      const repCtx = await ctx(U.rep);
      const rep = createCrmService(E.crmDbFor(U.rep.id), E.accountsDbFor(U.rep.id), E.adminDbFor(U.rep.id), repCtx.session, opts);
      expect((await rep.prospectList()).map((w) => w.id)).toContain(id);
      const one = got.candidates.find((c) => c.name === 'Discoteca Faro')!.placeId;
      const r2 = await rep.prospectImport(id, [one], '');
      expect(r2.created).toBe(1);
      expect((await t.admin.accounts.get(r2.ids[one])).account.ownerId).toBe(U.rep.id);
      await rejects(rep.prospectGet('00000000-0000-4000-8000-00000000dead'), 404);
    });

    test('Apuntar con IA (§20): separa por sitio, busca la empresa y guarda nota, cualificación y próximo paso al confirmar', async () => {
      const t = await territory();
      const repCtx = await ctx(U.rep);
      const rep = createCrmService(E.crmDbFor(U.rep.id), E.accountsDbFor(U.rep.id), E.adminDbFor(U.rep.id), repCtx.session, { notes: fixtureNotes(), places: null, research: null });
      const gecko = await t.admin.accounts.create({ name: 'Gecko Valencia', zoneId: t.vlc });
      await t.admin.accounts.assign(gecko, U.rep.id);   // como al importarla desde «Buscar clientes»
      const items = await rep.notesSplit('GHECKO - dos pantallas pequeñas, mirar redes\nNEGRITO BAR: sin pantalla, buena música', { seller: 'Enjoy' });
      expect(items.map((x) => x.venue)).toEqual(['GHECKO', 'NEGRITO BAR']);
      expect(items[0].candidates[0]).toMatchObject({ id: gecko, name: 'Gecko Valencia' });
      expect(items[0].candidates[0].score).toBeGreaterThanOrEqual(0.8);
      const r = await rep.notesApply([
        { accountId: gecko, note: items[0].note, channel: 'visit', outcome: 'note', day: '2026-10-10', qualification: { screens: 'yes', kind: 'venue' }, nextStep: 'Mirar sus redes', nextDays: 2 },
        { create: 'Negrito Bar', note: items[1].note, channel: 'visit', outcome: 'note', qualification: { screens: 'no', decider: 'nadie' } },
      ]);
      expect(r.map((x) => x.ok)).toEqual([true, true]);
      const g = (await t.admin.accounts.get(gecko)).account;
      expect(g.qualification).toMatchObject({ screens: 'yes', kind: 'venue' });
      expect(g.nextStep).toBe('Mirar sus redes');
      const tl = await rep.timeline(gecko);
      expect(tl.items.some((x) => x.channel === 'visit' && (x.note ?? '').includes('dos pantallas'))).toBe(true);
      const neg = (await t.admin.accounts.get(r[1].accountId!)).account;
      expect(neg).toMatchObject({ name: 'Negrito Bar', ownerId: U.rep.id });
      expect(neg.qualification).toEqual({ screens: 'no' });
      // En la de otro, no: se dice cuál ha fallado y las demás se guardan.
      const ajena = await t.admin.accounts.create({ name: 'Slavia', zoneId: t.vlc });
      await t.admin.accounts.assign(ajena, E.rep2.id);
      const r2 = await rep.notesApply([{ accountId: ajena, note: 'Casi vacío', channel: 'visit', outcome: 'note', qualification: { screens: 'yes' } }, { accountId: gecko, note: 'Otra visita', channel: 'visit', outcome: 'note', qualification: {} }]);
      expect(r2.map((x) => x.ok)).toEqual([false, true]);
    });

    test('CRM terminar ciudades: juntar con pueblos y asignaciones; renombrar encima de otra = juntar; tipo y mover', async () => {
      const t = await territory();
      const admCtx = t.admin;
      const adm = createCrmService(E.crmDbFor(U.admin.id), E.accountsDbFor(U.admin.id), E.adminDbFor(U.admin.id), admCtx.session, { places: null, routes: null, research: null });
      const cat = await admCtx.accounts.saveZone({ name: 'Cataluña', kind: 'region', parentId: t.es });
      const ger = await admCtx.accounts.saveZone({ name: 'Gerona', kind: 'province', parentId: cat });
      const gir = await admCtx.accounts.saveZone({ name: 'Girona', kind: 'province', parentId: cat });
      const aro = await admCtx.accounts.saveZone({ name: 'Castillo de Aro', parentId: ger });
      await admCtx.accounts.saveZone({ name: 'Lloret', parentId: ger });
      await admCtx.accounts.saveZone({ name: 'Lloret', parentId: gir });
      const a1 = await admCtx.accounts.create({ name: 'Sala Gerona', zoneId: ger });
      await admCtx.accounts.setAssignments(U.rep.id, [t.cv, ger]);

      expect(await adm.zonesFix([{ op: 'merge', id: ger, target: gir }])).toEqual({ applied: 1 });
      const z = (await admCtx.accounts.territory()).zones;
      expect(z.some((x) => x.id === ger)).toBe(false);
      expect(z.find((x) => x.id === aro)?.parentId).toBe(gir);
      expect(z.filter((x) => x.name === 'Lloret')).toHaveLength(1);
      expect((await admCtx.accounts.get(a1)).account.zoneId).toBe(gir);
      expect((await admCtx.accounts.territory()).assignments.filter((x) => x.userId === U.rep.id).map((x) => x.zoneId).sort()).toEqual([t.cv, gir].sort());

      await adm.zonesFix([{ op: 'rename', id: aro, name: 'LLORET' }]);
      expect((await admCtx.accounts.territory()).zones.some((x) => x.id === aro)).toBe(false);
      await adm.zonesFix([{ op: 'kind', id: t.es, kind: 'region' }, { op: 'move', id: gir, target: null }]);
      const z2 = (await admCtx.accounts.territory()).zones;
      expect(z2.find((x) => x.id === t.es)?.kind).toBe('region');
      expect(z2.find((x) => x.id === gir)?.parentId).toBeNull();

      // Un comercial no arregla zonas.
      const repCtx = await ctx(U.rep);
      const rep = createCrmService(E.crmDbFor(U.rep.id), E.accountsDbFor(U.rep.id), E.adminDbFor(U.rep.id), repCtx.session, {});
      await rejects(rep.zonesFix([{ op: 'kind', id: gir, kind: 'city' }]), 403);
    });
  });
}
