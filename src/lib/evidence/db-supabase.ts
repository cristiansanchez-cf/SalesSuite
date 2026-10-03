import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvidenceDb } from './db';
import type { Facet, WinStory } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}
const STORY_COLS = 'id, dossier_id, author_id, outcome, segment_id, persona_ids, situation, play_ids, what_worked, what_failed, key_stage, objection, title, status, created_at';
const toFacet = (r: Row): Facet => ({
  id: r.id, key: r.key, label: r.label, question: r.question, icon: r.icon, scope: r.scope, multi: r.multi, weight: r.weight,
  options: r.options ?? [], position: Number(r.position), status: r.status,
});
const toStory = (r: Row): WinStory => ({
  id: r.id, dossierId: r.dossier_id, authorId: r.author_id, outcome: r.outcome, segmentId: r.segment_id, personaIds: r.persona_ids ?? [],
  situation: r.situation ?? {}, playIds: r.play_ids ?? [], whatWorked: r.what_worked, whatFailed: r.what_failed, keyStage: r.key_stage,
  objection: r.objection, title: r.title, status: r.status, createdAt: r.created_at,
});

/** `sb` con la sesión del usuario: la RLS decide qué cierres ve y cuáles puede escribir. */
export function supabaseEvidenceDb(sb: SupabaseClient): EvidenceDb {
  return {
    async listFacets(t) { return (check(await sb.from('situation_facet').select('*').eq('tenant_id', t)) ?? []).map(toFacet); },
    async saveFacet(t, f) {
      const row = {
        tenant_id: t, key: f.key, label: f.label, question: f.question, icon: f.icon, scope: f.scope, multi: f.multi, weight: f.weight,
        options: f.options, position: f.position, status: f.status,
      };
      const res = f.id
        ? check(await sb.from('situation_facet').update(row).eq('id', f.id).select('id'))
        : check(await sb.from('situation_facet').insert(row).select('id'));
      if (!res?.length) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return res[0].id as string;
    },
    async listStories(t) { return (check(await sb.from('win_story').select(STORY_COLS).eq('tenant_id', t)) ?? []).map(toStory); },
    async saveStory(t, w) {
      const row = {
        tenant_id: t, dossier_id: w.dossierId, author_id: w.authorId, outcome: w.outcome, segment_id: w.segmentId, persona_ids: w.personaIds,
        situation: w.situation, play_ids: w.playIds, what_worked: w.whatWorked, what_failed: w.whatFailed, key_stage: w.keyStage,
        objection: w.objection, title: w.title, status: w.status,
      };
      let id = w.id;
      if (!id && w.dossierId) id = (check(await sb.from('win_story').select('id').eq('dossier_id', w.dossierId).maybeSingle()) as Row | null)?.id;
      const res = id
        ? check(await sb.from('win_story').update(row).eq('id', id).select('id'))
        : check(await sb.from('win_story').insert(row).select('id'));
      if (!res?.length) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
      return res[0].id as string;
    },
    async setStoryStatus(id, status) {
      const rows = check(await sb.from('win_story').update({ status }).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
  };
}
