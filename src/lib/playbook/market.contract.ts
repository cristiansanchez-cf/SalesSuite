/** Contrato del mapa de mercado, cuenta del dossier, seguimiento y contexto para el Cerebro (demo y Supabase). */
import { beforeEach, describe, expect, test } from 'vitest';
import { AdminError, createAdminService } from '../admin/service';
import type { AdminSession, Role } from '../admin/types';
import { createPlaybookService } from './service';
import type { PlaybookEnv } from './playbook.contract';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const EXP = '00000000-0000-4000-8000-00000000e102';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', tenant: ENJOY, role: 'rep' as Role },
  admin: { id: '22222222-2222-4222-8222-222222222222', tenant: ENJOY, role: 'admin' as Role },
  altRep: { id: '33333333-3333-4333-8333-333333333333', tenant: ALT, role: 'rep' as Role },
};

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

export function marketContract(name: string, env: () => PlaybookEnv) {
  describe(`mercado · ${name}`, () => {
    let E: PlaybookEnv;
    const sess = (u: (typeof U)[keyof typeof U], over: Partial<AdminSession> = {}): AdminSession =>
      ({ userId: u.id, email: `${u.id}@x`, displayName: null, tenantId: u.tenant, role: u.role, ...over });
    const ctx = (u: (typeof U)[keyof typeof U], over: Partial<AdminSession> = {}) => {
      const s = sess(u, over);
      const adb = E.adminDbFor(u.id);
      const admin = createAdminService(adb, s);
      return { admin, pb: createPlaybookService(E.playbookDbFor(u.id), adb, s, { admin }) };
    };

    beforeEach(async () => {
      E = env();
      await E.reset();
    });

    test('mapa: sectores con cliente ideal, actores con papel y encaje de módulos', async () => {
      const m = await ctx(U.rep).pb.market();
      expect(m.map((x) => x.key)).toEqual(['bodas', 'ocio-nocturno', 'conciertos', 'festivales']);
      const noche = m.find((x) => x.key === 'ocio-nocturno')!;
      expect(noche.icp).toContain('Aforo 300+');
      expect(noche.personas.map((p) => [p.key, p.role])).toEqual([
        ['propietario-local', 'decisor'], ['rrpp-marketing', 'campeon'], ['dj-residente', 'guardian'], ['marca-bebidas', 'pagador'],
      ]);
      const dj = noche.personas.find((p) => p.key === 'dj-residente')!;
      expect(dj.canBlock).toMatch(/sabotea/);
      expect(dj.angles[0]).toMatchObject({ moduleId: EXP, moduleName: 'Tabs · Experiencias' });
      expect(noche.modules[0]).toMatchObject({ moduleId: EXP, priority: 1 });

      const v = await ctx(U.rep).pb.segmentView('ocio-nocturno');
      expect(v.byPersona['dj-residente'].map((p) => p.key)).toEqual(['noche-obj-dj']);
      await rejects(ctx(U.rep).pb.segmentView('no-existe'), 404);

      const fit = await ctx(U.rep).pb.moduleFit(EXP);
      expect(fit.map((x) => x.segment.key)).toEqual(['bodas', 'ocio-nocturno', 'conciertos', 'festivales']);
      expect(fit.find((x) => x.segment.key === 'festivales')!.angles.map((a) => a.persona)).toContain('Responsable de patrocinios');
    });

    test('otro tenant no ve el mapa de Enjoy', async () => {
      expect(await ctx(U.altRep).pb.market()).toEqual([]);
    });

    test('solo el líder edita el mapa; validaciones', async () => {
      await rejects(ctx(U.rep).pb.saveSegment({ key: 'empresas', name: 'Eventos de empresa' }), 403);
      const { pb } = ctx(U.admin);
      const sid = await pb.saveSegment({ key: 'empresas', name: 'Eventos de empresa', icp: 'Empresas de 200+ empleados', buyingProcess: 'RR. HH. propone, dirección aprueba' });
      await rejects(pb.saveSegment({ key: 'empresas', name: 'Duplicado' }), 409);
      await rejects(pb.saveSegment({ key: 'Mal Clave', name: 'x' }), 422);
      const pid = await pb.savePersona({ segmentId: sid, key: 'rrhh', name: 'Responsable de RR. HH.', role: 'campeon', goals: 'Cohesión del equipo', objections: ['tiempo'] });
      await rejects(pb.savePersona({ segmentId: sid, key: 'x-y', name: 'x', role: 'jefe' }), 422);
      await pb.setPersonaAngle(pid, EXP, 'Dinámica de equipo medible');
      await pb.setModuleFit(sid, EXP, 'Cenas de empresa', 1);
      const seg = (await pb.market()).find((x) => x.key === 'empresas')!;
      expect(seg.personas[0]).toMatchObject({ key: 'rrhh', role: 'campeon', objections: ['tiempo'] });
      expect(seg.personas[0].angles[0].angle).toBe('Dinámica de equipo medible');
      expect(seg.modules[0]).toMatchObject({ fit: 'Cenas de empresa', priority: 1 });
      await pb.setPersonaAngle(pid, EXP, '');
      await pb.setModuleFit(sid, EXP, null, null);
      await pb.saveSegment({ key: 'empresas', name: 'Eventos corporativos' }, sid);
      const seg2 = (await pb.market()).find((x) => x.key === 'empresas')!;
      expect(seg2).toMatchObject({ name: 'Eventos corporativos', modules: [] });
      expect(seg2.personas[0].angles).toEqual([]);
      await pb.deletePersona(pid);
      expect((await pb.market()).find((x) => x.key === 'empresas')!.personas).toEqual([]);
    });

    test('cuenta del dossier: sector, contactos con postura y próximo paso', async () => {
      const { admin, pb } = ctx(U.rep);
      const id = await admin.createDossier({ title: 'Club Noche', prospectCompany: 'Club Noche' });
      const seg = (await pb.market()).find((x) => x.key === 'ocio-nocturno')!;
      const dj = seg.personas.find((p) => p.key === 'dj-residente')!;
      let st = await admin.apply(id, { op: 'setSegment', segmentId: seg.id });
      expect(st.dossier.segmentId).toBe(seg.id);
      st = await admin.apply(id, { op: 'addContact', contact: { name: 'Álex', personaId: dj.id, stance: 'bloqueador', notes: 'Muy celoso de su sesión' } });
      st = await admin.apply(id, { op: 'addContact', contact: { name: 'Sonia (dueña)', personaId: seg.personas[0].id, stance: 'aliado', email: 'sonia@example.com' } });
      expect(st.contacts.map((c) => [c.name, c.stance])).toEqual([['Álex', 'bloqueador'], ['Sonia (dueña)', 'aliado']]);
      st = await admin.apply(id, { op: 'updateContact', contactId: st.contacts[0].id, contact: { stance: 'neutral' } });
      expect(st.contacts[0].stance).toBe('neutral');
      await rejects(admin.apply(id, { op: 'addContact', contact: { name: 'x', personaId: '00000000-0000-4000-8000-00000000ffff' } }), 404);
      await rejects(admin.apply(id, { op: 'setSegment', segmentId: '00000000-0000-4000-8000-00000000ffff' }), 404);

      const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
      st = await admin.apply(id, { op: 'setNextStep', text: 'Demo con Álex antes de la sesión', at });
      expect(st.dossier).toMatchObject({ nextStep: 'Demo con Álex antes de la sesión' });
      expect(new Date(st.dossier.nextStepAt!).getTime()).toBe(new Date(at).getTime());
      await rejects(admin.apply(id, { op: 'setNextStep', text: null, at }), 422);
      expect((await admin.listDossiers()).find((d) => d.id === id)?.nextStep).toBe('Demo con Álex antes de la sesión');

      st = await admin.apply(id, { op: 'removeContact', contactId: st.contacts[1].id });
      expect(st.contacts.length).toBe(1);
      // otro comercial no edita la cuenta de Sala X
      await rejects(admin.apply(SALA_X, { op: 'addContact', contact: { name: 'x' } }), 403);
    });

    test('guion con «Con quién hablas» y jugadas filtradas por sector y actor', async () => {
      const t = await ctx(U.rep).pb.talkTrack(SALA_X);
      const cuenta = t.sections.find((s) => s.id === 'cuenta')!;
      expect(cuenta.blocks.filter((b) => b.title).map((b) => b.title)).toEqual([
        'Laura (novia) · Novios · 🟢 Aliado', 'Marta (coordinadora Sala X) · Coordinador/a de la finca · ⚪ Neutral', 'DJ Toni · DJ de la boda · 🔴 Bloqueador',
      ]);
      const toni = cuenta.blocks[2];
      expect(toni.tone).toBe('risk');
      expect(toni.facts?.find((f) => f.label === 'Riesgo')?.text).toMatch(/No cede pantalla/);
      expect(cuenta.blocks.at(-1)?.note).toMatch(/Gerente de la finca/);  // decisor sin mapear
      const all = t.sections.flatMap((s) => s.blocks.flatMap((b) => b.lines.map((l) => l.title)));
      expect(all).not.toContain('DJ residente: "Esto me corta la sesión"');  // jugada de ocio nocturno
      expect(all).not.toContain('Que lo pague el patrocinador');            // jugada de festivales
    });

    test('contexto para el Cerebro: contacto real de la cuenta', async () => {
      const st = await ctx(U.rep).admin.getState(SALA_X);
      const toni = st.contacts.find((c) => c.name === 'DJ Toni')!;
      const c = await ctx(U.rep).pb.contextBrief({ dossierId: SALA_X, contactId: toni.id, messageType: 'primer_contacto', channel: 'whatsapp' }, { publicOrigin: 'https://pitch.enjoytheclub.es' });
      expect(c.brief).toContain('SECTOR: Bodas');
      expect(c.brief).toContain('DESTINATARIO: DJ Toni (DJ de la boda)');
      expect(c.brief).toContain('Postura actual: Bloqueador');
      expect(c.brief).toContain('Cómo puede tumbarlo: No cede pantalla');
      expect(c.brief).toContain('Tabs · Experiencias: Le da momentos para animar');
      expect(c.brief).toContain('Precio: 700');
      expect(c.brief).toMatch(/Enlace a la propuesta: https:\/\/pitch\.enjoytheclub\.es\/d\//);
      expect(c.cerebro).toMatchObject({ etapa: 'Primer contacto', objecion: null });
      expect(c.prompt).toMatch(/buscar_tecnica/);
      expect(c.prompt).toContain('por WhatsApp');
    });

    test('contexto sin dossier: «tipo DJ de ocio nocturno, objeción»', async () => {
      const seg = (await ctx(U.rep).pb.market()).find((x) => x.key === 'ocio-nocturno')!;
      const dj = seg.personas.find((p) => p.key === 'dj-residente')!;
      await rejects(ctx(U.rep).pb.contextBrief({ personaId: dj.id, messageType: 'objecion' }), 422);
      const c = await ctx(U.rep).pb.contextBrief({ personaId: dj.id, messageType: 'objecion', objection: 'desconfianza', channel: 'llamada', notes: 'Dice que ya lo probó otra empresa y falló' });
      expect(c.brief).toContain('SECTOR: Locales de ocio nocturno');
      expect(c.brief).toContain('DJ residente: "Esto me corta la sesión"');  // jugada dirigida a ese actor
      expect(c.brief).toContain('LO QUE SÉ DE ESTE CASO: Dice que ya lo probó');
      expect(c.cerebro).toMatchObject({ etapa: 'Objeciones', objecion: 'Desconfianza' });
      expect(c.plays[0].title).toBe('DJ residente: "Esto me corta la sesión"');
      await rejects(ctx(U.altRep).pb.contextBrief({ personaId: dj.id }), 404);
    });

    test('exportación incluye el mapa de mercado', async () => {
      const x = await ctx(U.admin).pb.exportCards();
      expect(x.mercado.map((m) => m.clave)).toEqual(['bodas', 'ocio-nocturno', 'conciertos', 'festivales']);
      expect(x.mercado[1].actores.find((a) => a.clave === 'dj-residente')).toMatchObject({ papel: 'guardian', objeciones: ['Desconfianza'] });
    });

    test('defensa en profundidad: sesión falsificada de admin no edita el mapa', async () => {
      if (!E.enforcesRls) return;
      const forged = ctx(U.rep, { role: 'admin' }).pb;
      await expect(forged.saveSegment({ key: 'hack', name: 'Hack' })).rejects.toThrow();
      expect((await ctx(U.rep).pb.market()).some((x) => x.key === 'hack')).toBe(false);
    });
  });
}
