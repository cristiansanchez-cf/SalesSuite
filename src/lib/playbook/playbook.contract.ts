/** Contrato del playbook: se ejecuta contra la BD demo y contra Postgres + PostgREST + RLS. */
import { beforeEach, describe, expect, test } from 'vitest';
import type { AdminDb } from '../admin/db';
import { AdminError, createAdminService } from '../admin/service';
import type { AdminSession, Role } from '../admin/types';
import type { PlaybookDb } from './db';
import { createPlaybookService } from './service';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ALT = '00000000-0000-4000-8000-000000000a01';
const EXP = '00000000-0000-4000-8000-00000000e102';
const SALA_X = '00000000-0000-4000-8000-000000d05501';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', tenant: ENJOY, role: 'rep' as Role },
  admin: { id: '22222222-2222-4222-8222-222222222222', tenant: ENJOY, role: 'admin' as Role },
  altRep: { id: '33333333-3333-4333-8333-333333333333', tenant: ALT, role: 'rep' as Role },
};

export interface PlaybookEnv {
  reset(): Promise<void>;
  adminDbFor(userId: string): AdminDb;
  playbookDbFor(userId: string): PlaybookDb;
  evidenceDbFor(userId: string): import('../evidence/db').EvidenceDb;
  enforcesRls: boolean;
}

async function rejects(p: Promise<unknown>, status: number) {
  const e = await p.then(() => null, (err) => err);
  expect(e, `esperaba AdminError ${status}, llegó ${e}`).toBeInstanceOf(AdminError);
  expect((e as AdminError).status).toBe(status);
  return e as AdminError;
}

export function playbookContract(name: string, env: () => PlaybookEnv) {
  describe(`playbook · ${name}`, () => {
    let E: PlaybookEnv;
    const sess = (u: (typeof U)[keyof typeof U], over: Partial<AdminSession> = {}): AdminSession =>
      ({ userId: u.id, email: `${u.id}@x`, displayName: null, tenantId: u.tenant, role: u.role, ...over });
    const svc = (u: (typeof U)[keyof typeof U], over: Partial<AdminSession> = {}) => {
      const s = sess(u, over);
      const adb = E.adminDbFor(u.id);
      return createPlaybookService(E.playbookDbFor(u.id), adb, s, { admin: createAdminService(adb, s), evidence: E.evidenceDbFor(u.id) });
    };
    const playId = async (key: string) => (await svc(U.admin).listAll()).plays.find((p) => p.key === key)!.id;

    beforeEach(async () => {
      E = env();
      await E.reset();
    });

    test('aprende: índice, ficha general y referencias al Cerebro', async () => {
      const idx = await svc(U.rep).learnIndex();
      expect(idx.general.playCount).toBe(11);
      const exp = idx.modules.find((m) => m.moduleId === EXP)!;
      expect(exp.playCount).toBe(9);
      // Recorrido del producto (tenant.tour) + 4 sectores + cómo se vende + cada módulo.
      expect(idx.tour.steps.length).toBeGreaterThanOrEqual(4);
      expect(idx.progress).toEqual({ done: 0, total: 1 + 4 + 1 + idx.modules.length });

      const g = await svc(U.rep).topic('general');
      expect(g.sections[0].kind).toBe('pitch');
      const caro = g.sections.find((x) => x.kind === 'objection')!.plays.find((p) => p.title.includes('caro'))!;
      expect(caro.techniqueRefs.map((r) => r.id)).toEqual([707, 342]);
      expect(caro.objection).toBe('precio');

      await svc(U.rep).markLearned('general', true);
      await svc(U.rep).markLearned(EXP, true);
      expect((await svc(U.rep).learnIndex()).progress.done).toBe(2);
      await svc(U.rep).markLearned(EXP, false);
      expect((await svc(U.rep).learnIndex()).progress.done).toBe(1);
      await rejects(svc(U.rep).markLearned('00000000-0000-4000-8000-00000000ffff', true), 404);

      // Recorrido y sectores cuentan; un sector que no existe, no.
      await svc(U.rep).markLearned('tour', true);
      await svc(U.rep).markLearned('sector:bodas', true);
      const after = await svc(U.rep).learnIndex();
      expect(after.tour.learned).toBe(true);
      expect(after.sectorsLearned).toEqual(['bodas']);
      expect(after.progress.done).toBe(3);
      expect((await svc(U.rep).segmentView('bodas')).learned).toBe(true);
      await rejects(svc(U.rep).markLearned('sector:no-existe', true), 404);
    });

    test('otro tenant no ve el playbook de Enjoy', async () => {
      await rejects(svc(U.altRep).topic(EXP), 404);
      expect((await svc(U.altRep).learnIndex()).general.playCount).toBe(0);
    });

    test('equipo: truco visible al momento; el líder lo asciende u oculta', async () => {
      const tipId = await svc(U.rep).shareTip({ moduleId: EXP, title: 'Llevo el móvil cargado con un vídeo', body: 'Cuando no hay wifi, enseño el vídeo.' });
      const seen = await svc(U.admin).topic(EXP);
      expect(seen.tips.some((t) => t.id === tipId)).toBe(true);
      await rejects(svc(U.rep).shareTip({ moduleId: EXP, title: '', body: 'x' }), 422);

      await svc(U.admin).review(tipId, 'promote');
      const after = await svc(U.rep).topic(EXP);
      expect(after.tips.some((t) => t.id === tipId)).toBe(true);  // queda como "aceptado"
      expect(after.sections.flatMap((x) => x.plays).some((p) => p.title === 'Llevo el móvil cargado con un vídeo')).toBe(true);

      const tip2 = await svc(U.rep).shareTip({ moduleId: EXP, title: 'Ruido', body: 'No aporta' });
      await svc(U.admin).review(tip2, 'hide', 'Duplicado');
      expect((await svc(U.rep).topic(EXP)).tips.some((t) => t.id === tip2)).toBe(false);
    });

    test('mejora propuesta → bandeja → aceptada con crédito, versión y novedad', async () => {
      const pid = await playId('empresa-obj-precio');
      await svc(U.rep).markSeen();
      const cid = await svc(U.rep).proposeChange({ playId: pid, title: 'Añadir coste por invitado', body: 'Nuevo texto con **coste por invitado**.' });
      await rejects(svc(U.rep).proposeChange({ playId: pid, title: 'x', body: (await svc(U.rep).topic('general')).sections.flatMap((s) => s.plays).find((p) => p.id === pid)!.body }), 422);

      expect((await svc(U.rep).topic('general')).myOpen.map((c) => c.id)).toContain(cid);
      expect((await svc(U.rep).topic('general')).tips.some((t) => t.id === cid)).toBe(false);  // pendiente no es público
      const inbox = await svc(U.admin).inbox();
      expect(inbox.pending.find((c) => c.id === cid)?.current?.id).toBe(pid);

      await svc(U.admin).review(cid, 'accept');
      const play = (await svc(U.rep).topic('general')).sections.flatMap((s) => s.plays).find((p) => p.id === pid)!;
      expect(play.body).toBe('Nuevo texto con **coste por invitado**.');
      expect(play.version).toBe(2);
      const news = (await svc(U.rep).learnIndex()).news;
      expect(news[0]).toMatchObject({ playId: pid, topic: 'general' });
      expect(news[0].note).toMatch(/Añadir coste por invitado/);
      await svc(U.rep).markSeen();
      expect((await svc(U.rep).learnIndex()).news).toEqual([]);
    });

    test('rechazo exige motivo y el autor lo ve', async () => {
      const pid = await playId('exp-pitch');
      const cid = await svc(U.rep).proposeChange({ playId: pid, title: 'Más corto', body: 'Versión corta.' });
      await rejects(svc(U.admin).review(cid, 'reject'), 422);
      await svc(U.admin).review(cid, 'reject', 'Preferimos mantener el ejemplo del móvil');
      const mine = (await svc(U.rep).topic(EXP)).myOpen.find((c) => c.id === cid)!;
      expect(mine).toMatchObject({ status: 'rejected', reviewNote: 'Preferimos mantener el ejemplo del móvil' });
    });

    test('evidencia: cada jugada muestra en cuántos cierres reales se usó y cuántos ganó (no «me gusta»)', async () => {
      const plays = (await svc(U.rep).listAllVisible());
      const ev = (k: string) => plays.find((p) => p.key === k)!.evidence;
      expect(ev('exp-pitch')).toEqual({ used: 1, won: 1, lost: 0 });
      expect(ev('loc-pitch')).toEqual({ used: 2, won: 1, lost: 1 });
      expect(ev('noche-pitch-propietario')).toEqual({ used: 2, won: 2, lost: 0 });
      expect(ev('empresa-pitch')).toEqual({ used: 0, won: 0, lost: 0 });
    });

    test('guion de venta del dossier Sala X: orden, personalización, precio y objeciones', async () => {
      const t = await svc(U.rep).talkTrack(SALA_X);
      const apertura = t.sections.find((s) => s.id === 'apertura')!.blocks[0].lines;
      expect(apertura[0].text).toContain('Hola Laura');
      expect(apertura[0].text).toContain('de Sala X');
      const pres = t.sections.find((s) => s.id === 'presentacion')!.blocks.map((b) => b.title);
      expect(pres).toEqual(['1. Portada para bodas', '2. Enjoy para tu sala', '3. Experiencias en directo', '4. Precio de la propuesta']);
      expect(t.uncovered).toEqual(['Portada para bodas']);
      expect(t.sections.find((s) => s.id === 'precio')!.blocks[0].note?.replace(/\s/g, ' ')).toMatch(/700 €/);
      const obj = t.sections.find((s) => s.id === 'objeciones')!.blocks[0].lines.map((l) => l.title);
      expect(obj).toEqual(expect.arrayContaining(['"Es caro"', '"Ya trabajamos con un DJ que hace cosas parecidas"', '"Mis invitados son mayores, no van a participar"']));
      await rejects(svc(U.altRep).talkTrack(SALA_X), 404);
    });

    test('lo oficial solo lo edita el líder; editar crea versión', async () => {
      await rejects(svc(U.rep).createPlay({ moduleId: null, kind: 'tip', title: 'x' }), 403);
      await rejects(svc(U.rep).inbox(), 403);
      await rejects(svc(U.rep).metrics(), 403);
      await rejects(svc(U.rep).exportCards(), 403);
      const id = await svc(U.admin).createPlay({ moduleId: EXP, kind: 'proof', title: 'Caso Finca X', body: '180 invitados, 95 % participación', stage: 'pitch_demo',
        techniqueRefs: [{ source: 'cerebro', id: 707, title: 'Ficha', creator: 'Alfonso y Cristian' }] });
      await rejects(svc(U.admin).createPlay({ moduleId: EXP, kind: 'proof', title: 'x', stage: 'inventada' }), 422);
      const all = await svc(U.admin).listAll();
      const p = all.plays.find((x) => x.id === id)!;
      await svc(U.admin).updatePlay(id, { ...p, body: 'Actualizado' }, 'Dato corregido');
      await svc(U.admin).setPlayStatus(id, 'archived');
      expect((await svc(U.rep).topic(EXP)).sections.flatMap((s) => s.plays).some((x) => x.id === id)).toBe(false);
      expect((await svc(U.admin).listAll()).plays.find((x) => x.id === id)).toMatchObject({ status: 'archived', version: 3, body: 'Actualizado' });
    });

    test('métricas, resultado de dossiers y exportación con formato de ficha', async () => {
      const pid = await playId('noche-pitch-propietario');
      await svc(U.rep).markLearned('general', true);
      const admin = createAdminService(E.adminDbFor(U.admin.id), sess(U.admin));
      await admin.apply(SALA_X, { op: 'setOutcome', outcome: 'won', note: 'Firmado' });
      expect((await admin.getState(SALA_X)).dossier.outcome).toBe('won');

      const m = await svc(U.admin).metrics();
      expect(m.best[0].id).toBe(pid);
      expect(m.outcomes.won).toBe(1);
      expect(m.uncoveredModules).toContain('Portada para bodas');
      expect(m.team.find((x) => x.role === 'rep')?.done).toBe(1);

      const x = await svc(U.admin).exportCards();
      expect(x.formato).toBe('salessuite.playbook/v1');
      const caro = x.jugadas.find((j) => j.tecnica === '"Es caro"')!;
      expect(caro).toMatchObject({ etapa: 'Objeciones', objecion: 'Precio', modulo: null });
      expect(caro.referencias_cerebro[0].id).toBe(707);
    });

    test('defensa en profundidad: rep con sesión de admin falsificada no escribe lo oficial', async () => {
      if (!E.enforcesRls) return;
      const forged = svc(U.rep, { role: 'admin' });
      await expect(forged.createPlay({ moduleId: null, kind: 'tip', title: 'Hack' })).rejects.toThrow();
      const pid = await playId('exp-pitch');
      const cur = (await svc(U.admin).listAll()).plays.find((p) => p.id === pid)!;
      await rejects(forged.updatePlay(pid, { ...cur, title: 'Hack' }, 'x'), 403);  // la RLS deja leer lo oficial pero no escribir
      await expect(forged.inbox()).resolves.toMatchObject({ pending: [] });     // y no ve pendientes ajenos
    });
  });
}
