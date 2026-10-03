import { randomUUID } from 'node:crypto';
import { demoDb, type ContributionRow, type DemoDb, type PlayRow } from '../data/store';
import type { PlaybookDb } from './db';
import type { Contribution, Play, TechniqueRef } from './types';

export const rowToPlay = (r: PlayRow): Play => ({
  id: r.id, tenantId: r.tenant_id, moduleId: r.module_id, key: r.key, kind: r.kind as Play['kind'],
  stage: r.stage as Play['stage'], objection: r.objection as Play['objection'], segments: r.segments ?? [],
  title: r.title, body: r.body, whenToUse: r.when_to_use, whyItWorks: r.why_it_works,
  techniqueRefs: (r.technique_refs ?? []) as TechniqueRef[], position: Number(r.position), status: r.status as Play['status'],
  version: r.version, authorId: r.author_id, updatedBy: r.updated_by ?? null, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null,
});

const rowToContribution = (r: ContributionRow): Contribution => ({
  id: r.id, type: r.type as Contribution['type'], playId: r.play_id, moduleId: r.module_id, kind: r.kind as Contribution['kind'],
  title: r.title, body: r.body, status: r.status as Contribution['status'], authorId: r.author_id,
  reviewNote: r.review_note, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, createdAt: r.created_at,
});

/** Demo: sin RLS; el servicio aplica los permisos (y los tests de contrato lo verifican contra Supabase). */
export function demoPlaybookDb(getDb: () => DemoDb = demoDb): PlaybookDb {
  const db = getDb;
  const now = () => new Date().toISOString();
  return {
    async listPlays(t) { return db().play.filter((p) => p.tenant_id === t).map(rowToPlay); },
    async insertPlay(t, p) {
      const id = randomUUID();
      db().play.push({
        id, tenant_id: t, module_id: p.moduleId, key: p.key, kind: p.kind, stage: p.stage, objection: p.objection, segments: p.segments,
        title: p.title, body: p.body, when_to_use: p.whenToUse, why_it_works: p.whyItWorks, technique_refs: p.techniqueRefs,
        position: p.position, status: p.status, version: p.version ?? 1, author_id: p.authorId, updated_by: p.updatedBy, created_at: now(), updated_at: now(),
      });
      return id;
    },
    async updatePlay(id, p) {
      const r = db().play.find((x) => x.id === id);
      if (!r) return false;
      const map: Record<string, keyof PlayRow> = {
        moduleId: 'module_id', key: 'key', kind: 'kind', stage: 'stage', objection: 'objection', segments: 'segments', title: 'title', body: 'body',
        whenToUse: 'when_to_use', whyItWorks: 'why_it_works', techniqueRefs: 'technique_refs', position: 'position', status: 'status',
        version: 'version', authorId: 'author_id', updatedBy: 'updated_by',
      };
      for (const [k, v] of Object.entries(p)) if (v !== undefined && map[k]) (r as unknown as Record<string, unknown>)[map[k]] = v;
      r.updated_at = now();
      return true;
    },

    async listRevisions(t, o = {}) {
      return db().play_revision
        .filter((r) => r.tenant_id === t && (!o.playId || r.play_id === o.playId) && (!o.since || r.created_at > o.since))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, o.limit ?? 500)
        .map((r) => ({ id: r.id, playId: r.play_id, version: r.version, snapshot: r.snapshot, changeNote: r.change_note, changedBy: r.changed_by, contributionId: r.contribution_id, createdAt: r.created_at }));
    },
    async insertRevision(t, r) {
      db().play_revision.push({ id: randomUUID(), tenant_id: t, play_id: r.playId, version: r.version, snapshot: r.snapshot, change_note: r.changeNote, changed_by: r.changedBy, contribution_id: r.contributionId, created_at: now() });
    },

    async listContributions(t) { return db().play_contribution.filter((c) => c.tenant_id === t).map(rowToContribution); },
    async insertContribution(t, c) {
      const id = randomUUID();
      db().play_contribution.push({
        id, tenant_id: t, type: c.type, play_id: c.playId, module_id: c.moduleId, kind: c.kind, title: c.title, body: c.body,
        status: c.status, author_id: c.authorId, review_note: null, reviewed_by: null, reviewed_at: null, created_at: now(),
      });
      return id;
    },
    async updateContribution(id, p) {
      const c = db().play_contribution.find((x) => x.id === id);
      if (!c) return false;
      if (p.status !== undefined) c.status = p.status;
      if (p.reviewNote !== undefined) c.review_note = p.reviewNote;
      if (p.reviewedBy !== undefined) c.reviewed_by = p.reviewedBy;
      if (p.reviewedAt !== undefined) c.reviewed_at = p.reviewedAt;
      return true;
    },
    async deleteContribution(id) {
      const before = db().play_contribution.length;
      db().play_contribution = db().play_contribution.filter((c) => c.id !== id);
      return db().play_contribution.length < before;
    },

    async listFeedback(t) {
      return db().play_feedback.filter((f) => f.tenant_id === t).map((f) => ({
        userId: f.user_id, targetType: f.target_type as 'play' | 'contribution', targetId: f.target_id, verdict: f.verdict as 'worked' | 'didnt',
        note: f.note, dossierId: f.dossier_id, updatedAt: f.updated_at,
      }));
    },
    async upsertFeedback(t, f) {
      const s = db();
      s.play_feedback = s.play_feedback.filter((x) => !(x.user_id === f.userId && x.target_type === f.targetType && x.target_id === f.targetId));
      s.play_feedback.push({ tenant_id: t, user_id: f.userId, target_type: f.targetType, target_id: f.targetId, verdict: f.verdict, note: f.note, dossier_id: f.dossierId, updated_at: now() });
    },
    async deleteFeedback(userId, targetType, targetId) {
      const s = db();
      s.play_feedback = s.play_feedback.filter((x) => !(x.user_id === userId && x.target_type === targetType && x.target_id === targetId));
    },

    async listProgress(t) { return db().learning_progress.filter((p) => p.tenant_id === t).map((p) => ({ userId: p.user_id, topic: p.topic, completedAt: p.completed_at })); },
    async setProgress(t, u, topic, done) {
      const s = db();
      s.learning_progress = s.learning_progress.filter((p) => !(p.tenant_id === t && p.user_id === u && p.topic === topic));
      if (done) s.learning_progress.push({ tenant_id: t, user_id: u, topic, completed_at: now() });
    },

    async getSeen(t, u) { return db().playbook_seen.find((x) => x.tenant_id === t && x.user_id === u)?.seen_at ?? null; },
    async setSeen(t, u, at) {
      const s = db();
      s.playbook_seen = s.playbook_seen.filter((x) => !(x.tenant_id === t && x.user_id === u));
      s.playbook_seen.push({ tenant_id: t, user_id: u, seen_at: at });
    },
  };
}
