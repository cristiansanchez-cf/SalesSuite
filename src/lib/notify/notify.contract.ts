/** Contrato de avisos: igual en demo y en Postgres + PostgREST + RLS (triggers incluidos). */
import { beforeEach, describe, expect, test } from 'vitest';
import { buildAdminContext } from '../admin/auth';
import type { AdminDb } from '../admin/db';
import type { EvidenceDb } from '../evidence/db';
import type { PlaybookDb } from '../playbook/db';
import type { TenantContext } from '../types';
import type { NotifyDb, NotifyJobDb } from './db';
import { runNotificationJob } from './job';
import type { Email, Mailer } from './mailer';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const U = {
  rep: { id: '11111111-1111-4111-8111-111111111111', email: 'rep@enjoy.test' },
  admin: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@enjoy.test' },
  other: { id: '33333333-3333-4333-8333-333333333333', email: 'rep@retheme.test' },
  dj: { id: '55555555-5555-4555-8555-555555555555', email: 'dj@enjoy.test' },
};
const MOD_EXP = '00000000-0000-4000-8000-00000000e102';
const tenant: TenantContext = { id: ENJOY, slug: 'enjoy', name: 'Enjoy', defaultLocale: 'es-ES', themeTokens: {} as never, brand: {} as never };

export interface NotifyEnv {
  reset(): Promise<void>;
  adminDbFor(userId: string): AdminDb;
  partnerDbFor(userId: string): AdminDb;
  playbookDbFor(userId: string): PlaybookDb;
  evidenceDbFor(userId: string): EvidenceDb;
  notifyDbFor(userId: string): NotifyDb;
  jobDb(): NotifyJobDb;
}

export function notifyContract(name: string, env: () => NotifyEnv) {
  describe(`avisos · ${name}`, () => {
    let E: NotifyEnv;
    const ctx = async (u: { id: string; email: string }) => {
      const r = await buildAdminContext(E.adminDbFor(u.id), { id: u.id, email: u.email, name: null }, tenant, 'demo', {
        identity: null, assets: { async upload() { throw new Error('x'); } }, supabase: null,
        playbookDb: E.playbookDbFor(u.id), evidenceDb: E.evidenceDbFor(u.id), partnerDb: () => E.partnerDbFor(u.id), notifyDb: E.notifyDbFor(u.id),
      });
      if (r.kind !== 'ok') throw new Error(`login ${u.email}: ${r.kind}`);
      return r.admin;
    };
    beforeEach(async () => { E = env(); await E.reset(); });

    test('un aporte pendiente avisa a quien revisa y se resuelve al revisarlo', async () => {
      const dj = await ctx(U.dj);
      await dj.playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Pide la canción del cumpleañero', body: 'Funciona siempre.' });
      const admin = await ctx(U.admin);
      let feed = await admin.notifications.feed();
      expect(feed.open).toBe(1);
      expect(feed.items[0]).toMatchObject({ kind: 'contribution_pending', severity: 'action', open: true, href: '/admin/playbook?tab=inbox' });
      expect(feed.items[0].title).toContain('propone un truco');
      expect(feed.items[0].detail).toBe('«Pide la canción del cumpleañero»');
      // Quien lo envía y el resto del equipo no reciben nada.
      expect((await dj.notifications.feed()).items).toHaveLength(0);
      expect((await (await ctx(U.rep)).notifications.feed()).items).toHaveLength(0);

      // Leerlo no lo cierra (pide una acción); revisarlo, sí.
      await admin.notifications.open(feed.items[0].id);
      expect((await admin.notifications.feed()).open).toBe(1);
      const pending = (await admin.playbook.inbox()).pending.find((c) => c.title === 'Pide la canción del cumpleañero')!;
      await admin.playbook.review(pending.id, 'accept');
      feed = await admin.notifications.feed();
      expect(feed.open).toBe(0);
      expect(feed.items[0].resolvedAt).not.toBeNull();
    });

    test('un colaborador que trae a otro: el admin sabe quién invitó a quién', async () => {
      const admin = await ctx(U.admin);
      const p = await admin.tenantAdmin.partner(U.dj.id);
      await admin.tenantAdmin.updatePartner(U.dj.id, { moduleIds: p.profile!.moduleIds, seeTeamTips: false, welcomeNote: '', expiresAt: '', canInvite: true });
      await E.partnerDbFor(U.dj.id).partnerInvitePartner(ENJOY, U.dj.id, U.other.id);
      const feed = await admin.notifications.feed();
      const n = feed.items.find((x) => x.kind === 'partner_referred')!;
      expect(n).toMatchObject({ severity: 'action', open: true, href: `/admin/team/partners/${U.other.id}` });
      expect(n.title).toContain('invitado por');
      // Se da por atendido al abrirlo.
      expect(await admin.notifications.open(n.id)).toBe(`/admin/team/partners/${U.other.id}`);
      expect((await admin.notifications.feed()).items.find((x) => x.kind === 'partner_referred')!.open).toBe(false);
    });

    test('descartar, marcar todo y preferencia de email', async () => {
      const dj = await ctx(U.dj);
      await dj.playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Uno', body: 'x' });
      await dj.playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Dos', body: 'x' });
      const admin = await ctx(U.admin);
      const feed = await admin.notifications.feed();
      expect(feed.items).toHaveLength(2);
      expect(await admin.notifications.dismiss(feed.items[0].id)).toBe(true);
      expect((await admin.notifications.feed()).items).toHaveLength(1);
      expect(await (await ctx(U.rep)).notifications.dismiss(feed.items[1].id)).toBe(false);  // no es suyo
      await admin.notifications.markAllRead();
      expect((await admin.notifications.feed()).items.every((n) => n.readAt)).toBe(true);
      expect(await admin.notifications.emailPref()).toBe(true);
      await admin.notifications.setEmailPref(false);
      expect(await admin.notifications.emailPref()).toBe(false);
    });

    test('email: lo que pide acción, agrupado y una sola vez; el resumen repite lo abierto', async () => {
      const dj = await ctx(U.dj);
      await dj.playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Truco A', body: 'x' });
      await dj.playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Truco B', body: 'x' });
      const sent: Email[] = [];
      const mailer: Mailer = { async send(e) { sent.push(e); } };
      const later = new Date(Date.now() + 10 * 60_000);
      const job = (now: Date, digest: 'skip' | 'force' = 'skip') => runNotificationJob(E.jobDb(), mailer, { now, fallbackOrigin: 'https://ventas.test', digest });

      expect((await job(new Date(), 'skip')).immediate).toBe(0);  // aún dentro del margen para agrupar
      expect((await job(later)).immediate).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: 'admin@enjoy.test', tag: 'immediate' });
      expect(sent[0].subject).toContain('2 cosas esperan tu respuesta');
      expect(sent[0].html).toContain('Truco A');
      expect(sent[0].text).toMatch(/https:\/\/[a-z0-9.-]+\/admin\/notifications\/[0-9a-f-]{36}/);  // dominio principal del espacio
      expect((await job(later)).immediate).toBe(0);  // nunca dos veces

      // Tres días después sigue abierto → el resumen lo recuerda.
      const r = await job(new Date(Date.now() + 3 * 86_400_000), 'force');
      expect(r.digests).toBe(1);
      expect(sent[1]).toMatchObject({ to: 'admin@enjoy.test', tag: 'digest' });
      expect(sent[1].html).toContain('ya lo has visto, pero te lo recuerdo');
      expect((await job(new Date(Date.now() + 3 * 86_400_000), 'force')).digests).toBe(0);  // uno por semana
    });

    test('quien desactiva los emails solo ve la campana', async () => {
      const admin = await ctx(U.admin);
      await admin.notifications.setEmailPref(false);
      await (await ctx(U.dj)).playbook.shareTip({ moduleId: MOD_EXP, kind: 'tip', title: 'Sin email', body: 'x' });
      const sent: Email[] = [];
      const r = await runNotificationJob(E.jobDb(), { async send(e) { sent.push(e); } }, { now: new Date(Date.now() + 10 * 60_000), fallbackOrigin: 'https://x', digest: 'force' });
      expect(sent).toHaveLength(0);
      expect(r.skipped).toBe(1);
      expect((await admin.notifications.feed()).open).toBe(1);
    });
  });
}
