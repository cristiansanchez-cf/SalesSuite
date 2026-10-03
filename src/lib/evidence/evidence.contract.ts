/** Contrato de «Qué ha funcionado»: igual en demo y en Postgres + PostgREST + RLS. */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext } from '../admin/auth';
import type { AdminDb } from '../admin/db';
import { AdminError } from '../admin/service';
import type { PlaybookDb } from '../playbook/db';
import type { TenantContext } from '../types';
import type { EvidenceDb } from './db';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' },
  altRep: { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test' },
  dj: { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' },
};
const SEG = { bodas: '00000000-0000-4000-8000-0000005e0001', noche: '00000000-0000-4000-8000-0000005e0002' };
const PER = { novios: '00000000-0000-4000-8000-0000009e0001', dj: '00000000-0000-4000-8000-0000009e0008', dueno: '00000000-0000-4000-8000-0000009e0006' };
const TABS_LOCALES = '00000000-0000-4000-8000-0000000e1031';
const tenant = (id: string): TenantContext => ({ id, slug: id === ENJOY ? 'enjoy' : 'alt', name: 'T', defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never });

export interface EvidenceEnv {
  reset(): Promise<void>;
  adminDbFor(userId: string): AdminDb;
  partnerDbFor(userId: string): AdminDb;
  playbookDbFor(userId: string): PlaybookDb;
  evidenceDbFor(userId: string): EvidenceDb;
  enforcesRls: boolean;
}

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

export function evidenceContract(name: string, env: () => EvidenceEnv) {
  describe(`qué ha funcionado · ${name}`, () => {
    let E: EvidenceEnv;
    const ctx = async (u: { id: string; email: string }, t = ENJOY) => {
      const r = await buildAdminContext(E.adminDbFor(u.id), { id: u.id, email: u.email, name: null }, tenant(t), 'demo', {
        identity: null, assets: { async upload() { throw new Error('x'); } }, supabase: null,
        playbookDb: E.playbookDbFor(u.id), evidenceDb: E.evidenceDbFor(u.id), partnerDb: () => E.partnerDbFor(u.id),
      });
      if (r.kind !== 'ok') throw new Error(`login ${u.email}: ${r.kind}`);
      return r.admin;
    };
    const playId = async (key: string) => (await (await ctx(U.admin)).playbook.listAll()).plays.find((p) => p.key === key)!.id;

    beforeEach(async () => { E = env(); await E.reset(); });

    test('situaciones configurables por el líder (nada escrito para un tenant concreto)', async () => {
      const rep = await ctx(U.rep);
      expect((await rep.evidence.facets()).map((f) => f.key)).toEqual(['personalidad', 'region', 'rasgos-local']);
      await rejects(rep.evidence.saveFacet({ label: 'x', options: [{ label: 'a' }] }), 403);
      const admin = await ctx(U.admin);
      await admin.evidence.saveFacet({ label: 'Tipo de centro', question: '¿Qué tipo de centro es?', scope: 'account', multi: false, options: [{ label: 'Familiar' }, { label: 'Para instructores' }] });
      const f = (await admin.evidence.facets()).find((x) => x.key === 'tipo-de-centro')!;
      expect(f.options.map((o) => o.key)).toEqual(['familiar', 'para-instructores']);
      await rejects(admin.evidence.saveFacet({ label: 'Región', options: [{ label: 'Corea' }] }), 409);
      await rejects(admin.evidence.saveFacet({ label: 'Vacía', options: [] }), 422);
      expect((await (await ctx(U.altRep, ALT)).evidence.facets())).toEqual([]);
    });

    test('«en situaciones parecidas funcionó»: parecido explicado y jugadas que ganan', async () => {
      const rep = await ctx(U.rep);
      const r = await rep.evidence.recommend({ segmentId: SEG.noche, personaIds: [PER.dj], situation: { personalidad: ['analitico'], region: ['madrid'] } });
      expect(r.stories[0].story.title).toBe('Club Aurora (ejemplo)');
      expect(r.stories[0].matches.map((m) => m.label)).toEqual(expect.arrayContaining(['Locales de ocio nocturno', 'DJ residente', 'Analítico', 'Madrid']));
      const faro = r.stories.find((m) => m.story.title === 'Sala Faro (ejemplo)')!;
      expect(faro.differs.map((d) => d.label)).toEqual(expect.arrayContaining(['Región: Barcelona', 'Tipo de personalidad: Directo']));
      expect(r.stories.some((m) => m.story.outcome === 'lost')).toBe(true);   // lo que no funcionó también enseña
      expect(r.plays[0].title).toBeTruthy();
      expect(r.plays.map((p) => p.playId)).toContain(await playId('noche-obj-dj'));
      expect(r.plays.every((p) => p.wonIn > 0)).toBe(true);
      // Sin describir nada: todos los cierres, del más reciente al más antiguo.
      const all = await rep.evidence.recommend({});
      expect(all.total).toBe(5);
      expect(all.described).toBe(false);
    });

    test('la situación vive en la cuenta: facetas del dossier + rasgos de sus personas', async () => {
      const admin = await ctx(U.admin);
      const st = await admin.service.apply(SALA_X, { op: 'setSituation', situation: { region: ['madrid'], 'rasgos-local': ['pantalla', 'bodas'], vacia: [] } });
      expect(st.dossier.situation).toEqual({ region: ['madrid'], 'rasgos-local': ['pantalla', 'bodas'] });
      const laura = st.contacts.find((c) => c.name.startsWith('Laura'))!;
      expect(laura.traits).toEqual({ personalidad: ['expresivo'] });
      const r = await admin.evidence.forDossier(SALA_X);
      expect(r.stories[0].story.title).toBe('Finca Olivar (ejemplo)');
      expect(r.query.situation.personalidad).toEqual(expect.arrayContaining(['expresivo', 'analitico']));
    });

    test('documentar un cierre: dos minutos, prerrellenado, y cuenta como evidencia', async () => {
      const rep = await ctx(U.rep);
      const id = await rep.service.createDossier({ title: 'Club Prueba', prospectCompany: 'Club Prueba' });
      await rep.service.apply(id, { op: 'setSegment', segmentId: SEG.noche });
      await rep.service.apply(id, { op: 'addItem', moduleVersionId: TABS_LOCALES });
      await rep.service.apply(id, { op: 'setSituation', situation: { region: ['madrid'], 'rasgos-local': ['dj'] } });
      await rep.service.apply(id, { op: 'addContact', contact: { name: 'DJ Leo', personaId: PER.dj, stance: 'bloqueador', traits: { personalidad: ['analitico'] } } });

      const d = await rep.evidence.debrief(id);
      expect(d.defaults).toMatchObject({ segmentId: SEG.noche, personaIds: [PER.dj], situation: { personalidad: ['analitico'], region: ['madrid'], 'rasgos-local': ['dj'] } });
      expect(d.plays.length).toBeGreaterThan(0);
      const objDj = await playId('noche-obj-dj');
      await rejects(rep.evidence.recordStory(id, { ...d.defaults, outcome: 'won', playIds: [objDj] }), 422);
      const sid = await rep.evidence.recordStory(id, { ...d.defaults, outcome: 'won', playIds: [objDj], whatWorked: 'Le dejé elegir qué peticiones suenan.', keyStage: 'objeciones', objection: 'desconfianza' });
      expect((await rep.service.getState(id)).dossier.outcome).toBe('won');
      expect(await rep.evidence.recordStory(id, { ...d.defaults, outcome: 'won', playIds: [objDj], whatWorked: 'Corregido.' })).toBe(sid);
      expect((await rep.evidence.storyForDossier(id))?.whatWorked).toBe('Corregido.');
      expect((await rep.playbook.listAllVisible()).find((p) => p.id === objDj)!.evidence).toEqual({ used: 2, won: 2, lost: 0 });
      await rejects(rep.evidence.recordStory(SALA_X, { outcome: 'won', whatWorked: 'x' }), 403);   // no es suyo
      await rejects(rep.evidence.recordStory(id, { outcome: 'won', whatWorked: 'x', playIds: ['00000000-0000-4000-8000-0000000000ff'] }), 404);
      expect((await (await ctx(U.altRep, ALT)).evidence.recommend({})).total).toBe(0);

      // El líder puede ocultar un cierre (p. ej. mal documentado): deja de contar.
      const admin = await ctx(U.admin);
      await admin.evidence.setStoryHidden(sid, true);
      expect((await rep.evidence.recommend({})).stories.some((m) => m.story.id === sid)).toBe(false);
      await rejects(rep.evidence.setStoryHidden(sid, false), 403);
    });

    test('colaborador: documenta sus cierres; los del equipo solo si el admin lo permite', async () => {
      const dj = await ctx(U.dj);
      const id = await dj.service.createDossier({ title: 'Neón', partnerAccountId: '00000000-0000-4000-8000-0000009a0002' });
      await dj.service.apply(id, { op: 'addItem', moduleVersionId: TABS_LOCALES });
      await dj.evidence.recordStory(id, { outcome: 'lost', whatFailed: 'El dueño no estaba.' });
      expect((await dj.evidence.recommend({})).total).toBe(1);
      await rejects(dj.evidence.saveFacet({ label: 'x', options: [{ label: 'y' }] }), 403);
      const admin = await ctx(U.admin);
      await admin.tenantAdmin.updatePartner(U.dj.id, { moduleIds: ['00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000e103'], seeTeamTips: true });
      expect((await (await ctx(U.dj)).evidence.recommend({})).total).toBe(6);
      expect((await admin.evidence.recommend({})).total).toBe(6);
    });
  });
}
