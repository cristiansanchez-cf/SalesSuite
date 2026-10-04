import type { SupabaseClient } from '@supabase/supabase-js';
import { parseProposal } from '../proposal/preset';
import type { PlaybookDb } from './db';
import type { Contribution, Play, TechniqueRef } from './types';
import type { Persona, Segment } from './market';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}

const PLAY_COLS = 'id, tenant_id, module_id, key, kind, stage, objection, segments, personas, audience, about, pinned, title, body, when_to_use, why_it_works, technique_refs, position, status, version, author_id, updated_by, created_at, updated_at';

const toPlay = (r: Row): Play => ({
  id: r.id, tenantId: r.tenant_id, moduleId: r.module_id, key: r.key, kind: r.kind, stage: r.stage, objection: r.objection,
  segments: r.segments ?? [], personas: r.personas ?? [], audience: r.audience ?? 'all', about: r.about ?? false, pinned: r.pinned ?? null, title: r.title, body: r.body, whenToUse: r.when_to_use, whyItWorks: r.why_it_works,
  techniqueRefs: (r.technique_refs ?? []) as TechniqueRef[], position: Number(r.position), status: r.status, version: r.version,
  authorId: r.author_id, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const toContribution = (r: Row): Contribution => ({
  id: r.id, type: r.type, playId: r.play_id, moduleId: r.module_id, kind: r.kind, title: r.title, body: r.body, status: r.status,
  authorId: r.author_id, reviewNote: r.review_note, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, createdAt: r.created_at,
});

const PLAY_FIELDS: Record<string, string> = {
  moduleId: 'module_id', key: 'key', kind: 'kind', stage: 'stage', objection: 'objection', segments: 'segments', personas: 'personas', audience: 'audience', about: 'about', pinned: 'pinned', title: 'title', body: 'body',
  whenToUse: 'when_to_use', whyItWorks: 'why_it_works', techniqueRefs: 'technique_refs', position: 'position', status: 'status',
  version: 'version', authorId: 'author_id', updatedBy: 'updated_by',
};
const toRow = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined && PLAY_FIELDS[k]).map(([k, v]) => [PLAY_FIELDS[k], v]));

const toSegment = (r: Row): Segment => ({
  id: r.id, key: r.key, name: r.name, description: r.description, valueProp: r.value_prop, icp: r.icp, disqualifiers: r.disqualifiers,
  buyingProcess: r.buying_process, dealSize: r.deal_size, salesCycle: r.sales_cycle, position: Number(r.position), status: r.status, icon: r.icon ?? null,
  image: r.image ?? null, notice: r.notice ?? null, proposal: parseProposal(r.proposal),
});
const toPersona = (r: Row): Persona => ({
  id: r.id, segmentId: r.segment_id, key: r.key, name: r.name, role: r.role, goals: r.goals, pains: r.pains, kpis: r.kpis,
  objections: r.objections ?? [], howToApproach: r.how_to_approach, avoid: r.avoid, canHelp: r.can_help, canBlock: r.can_block, position: Number(r.position),
});

/** `sb` con la sesión del usuario: la RLS decide qué ve y qué puede escribir. */
export function supabasePlaybookDb(sb: SupabaseClient): PlaybookDb {
  return {
    async listPlays(t) { return (check(await sb.from('play').select(PLAY_COLS).eq('tenant_id', t)) ?? []).map(toPlay); },
    async insertPlay(t, p) {
      const r = check(await sb.from('play').insert({ tenant_id: t, ...toRow(p as unknown as Record<string, unknown>) }).select('id').single());
      if (!r) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return r.id as string;
    },
    async updatePlay(id, p) {
      const rows = check(await sb.from('play').update(toRow(p as Record<string, unknown>)).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    async listRevisions(t, o = {}) {
      let q = sb.from('play_revision').select('id, play_id, version, snapshot, change_note, changed_by, contribution_id, created_at').eq('tenant_id', t);
      if (o.playId) q = q.eq('play_id', o.playId);
      if (o.since) q = q.gt('created_at', o.since);
      const rows = check(await q.order('created_at', { ascending: false }).limit(o.limit ?? 500)) ?? [];
      return rows.map((r: Row) => ({ id: r.id, playId: r.play_id, version: r.version, snapshot: r.snapshot, changeNote: r.change_note, changedBy: r.changed_by, contributionId: r.contribution_id, createdAt: r.created_at }));
    },
    async insertRevision(t, r) {
      check(await sb.from('play_revision').insert({ tenant_id: t, play_id: r.playId, version: r.version, snapshot: r.snapshot, change_note: r.changeNote, changed_by: r.changedBy, contribution_id: r.contributionId }));
    },

    async listContributions(t) {
      return (check(await sb.from('play_contribution').select('*').eq('tenant_id', t)) ?? []).map(toContribution);
    },
    async insertContribution(t, c) {
      const r = check(await sb.from('play_contribution').insert({
        tenant_id: t, type: c.type, play_id: c.playId, module_id: c.moduleId, kind: c.kind, title: c.title, body: c.body, status: c.status, author_id: c.authorId,
      }).select('id').single());
      if (!r) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return r.id as string;
    },
    async updateContribution(id, p) {
      const patch: Row = {};
      if (p.status !== undefined) patch.status = p.status;
      if (p.reviewNote !== undefined) patch.review_note = p.reviewNote;
      if (p.reviewedBy !== undefined) patch.reviewed_by = p.reviewedBy;
      if (p.reviewedAt !== undefined) patch.reviewed_at = p.reviewedAt;
      const rows = check(await sb.from('play_contribution').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async deleteContribution(id) {
      const rows = check(await sb.from('play_contribution').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    async listFeedback(t) {
      const rows = check(await sb.from('play_feedback').select('user_id, target_type, target_id, verdict, note, dossier_id, updated_at').eq('tenant_id', t)) ?? [];
      return rows.map((f: Row) => ({ userId: f.user_id, targetType: f.target_type, targetId: f.target_id, verdict: f.verdict, note: f.note, dossierId: f.dossier_id, updatedAt: f.updated_at }));
    },
    async upsertFeedback(t, f) {
      check(await sb.from('play_feedback').upsert({
        tenant_id: t, user_id: f.userId, target_type: f.targetType, target_id: f.targetId, verdict: f.verdict, note: f.note, dossier_id: f.dossierId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,target_type,target_id' }));
    },
    async deleteFeedback(userId, targetType, targetId) {
      check(await sb.from('play_feedback').delete().eq('user_id', userId).eq('target_type', targetType).eq('target_id', targetId));
    },

    async listProgress(t) {
      const rows = check(await sb.from('learning_progress').select('user_id, topic, completed_at').eq('tenant_id', t)) ?? [];
      return rows.map((p: Row) => ({ userId: p.user_id, topic: p.topic, completedAt: p.completed_at }));
    },
    async setProgress(t, u, topic, done) {
      if (done) check(await sb.from('learning_progress').upsert({ tenant_id: t, user_id: u, topic }, { onConflict: 'tenant_id,user_id,topic' }));
      else check(await sb.from('learning_progress').delete().eq('tenant_id', t).eq('user_id', u).eq('topic', topic));
    },

    async getSeen(t, u) {
      const r = check(await sb.from('playbook_seen').select('seen_at').eq('tenant_id', t).eq('user_id', u).maybeSingle());
      return (r?.seen_at as string) ?? null;
    },
    async setSeen(t, u, at) {
      check(await sb.from('playbook_seen').upsert({ tenant_id: t, user_id: u, seen_at: at }, { onConflict: 'tenant_id,user_id' }));
    },

    async listSegments(t) { return (check(await sb.from('segment').select('*').eq('tenant_id', t)) ?? []).map(toSegment); },
    async saveSegment(t, r) {
      const row = {
        tenant_id: t, key: r.key, name: r.name, description: r.description, value_prop: r.valueProp, icp: r.icp, disqualifiers: r.disqualifiers,
        buying_process: r.buyingProcess, deal_size: r.dealSize, sales_cycle: r.salesCycle, position: r.position, status: r.status, icon: r.icon,
      };
      const res = r.id
        ? check(await sb.from('segment').update(row).eq('id', r.id).select('id'))
        : check(await sb.from('segment').insert(row).select('id'));
      if (!res?.length) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return res[0].id as string;
    },
    async listPersonas(t) { return (check(await sb.from('persona').select('*').eq('tenant_id', t)) ?? []).map(toPersona); },
    async savePersona(t, r) {
      const row = {
        tenant_id: t, segment_id: r.segmentId, key: r.key, name: r.name, role: r.role, goals: r.goals, pains: r.pains, kpis: r.kpis,
        objections: r.objections, how_to_approach: r.howToApproach, avoid: r.avoid, can_help: r.canHelp, can_block: r.canBlock, position: r.position,
      };
      const res = r.id
        ? check(await sb.from('persona').update(row).eq('id', r.id).select('id'))
        : check(await sb.from('persona').insert(row).select('id'));
      if (!res?.length) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return res[0].id as string;
    },
    async deletePersona(id) {
      const rows = check(await sb.from('persona').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async listSegmentModules(t) {
      const rows = check(await sb.from('segment_module').select('segment_id, module_id, fit, priority').eq('tenant_id', t)) ?? [];
      return rows.map((x: Row) => ({ segmentId: x.segment_id, moduleId: x.module_id, fit: x.fit, priority: x.priority }));
    },
    async setSegmentModule(t, r) {
      if ('remove' in r) { check(await sb.from('segment_module').delete().eq('segment_id', r.segmentId).eq('module_id', r.moduleId)); return; }
      check(await sb.from('segment_module').upsert({ tenant_id: t, segment_id: r.segmentId, module_id: r.moduleId, fit: r.fit, priority: r.priority }, { onConflict: 'segment_id,module_id' }));
    },
    async listPersonaModules(t) {
      const rows = check(await sb.from('persona_module').select('persona_id, module_id, angle').eq('tenant_id', t)) ?? [];
      return rows.map((x: Row) => ({ personaId: x.persona_id, moduleId: x.module_id, angle: x.angle }));
    },
    async setPersonaModule(t, r) {
      if ('remove' in r) { check(await sb.from('persona_module').delete().eq('persona_id', r.personaId).eq('module_id', r.moduleId)); return; }
      check(await sb.from('persona_module').upsert({ tenant_id: t, persona_id: r.personaId, module_id: r.moduleId, angle: r.angle }, { onConflict: 'persona_id,module_id' }));
    },
  };
}
