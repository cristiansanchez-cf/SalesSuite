import { randomUUID } from 'node:crypto';
import { demoDb, type DemoDb, type SituationFacetRow, type WinStoryRow } from '../data/store';
import type { EvidenceDb } from './db';
import type { Facet, WinStory } from './types';
import { demoEmitStory } from '../notify/db-demo';

const toFacet = (r: SituationFacetRow): Facet => ({
  id: r.id, key: r.key, label: r.label, question: r.question, icon: r.icon, scope: r.scope, multi: r.multi, weight: r.weight,
  options: structuredClone(r.options ?? []), position: Number(r.position), status: (r.status ?? 'official') as Facet['status'],
});
const toStory = (r: WinStoryRow): WinStory => ({
  id: r.id, dossierId: r.dossier_id ?? null, authorId: r.author_id ?? null, outcome: r.outcome, segmentId: r.segment_id, personaIds: [...r.persona_ids],
  situation: structuredClone(r.situation ?? {}), playIds: [...r.play_ids], whatWorked: r.what_worked, whatFailed: r.what_failed,
  keyStage: r.key_stage as WinStory['keyStage'], objection: r.objection as WinStory['objection'], title: r.title, status: r.status, createdAt: r.created_at ?? '',
});

/** Demo: sin RLS; las reglas las aplica el servicio (y el contrato lo verifica contra Supabase). */
export function demoEvidenceDb(getDb: () => DemoDb = demoDb): EvidenceDb {
  const db = getDb;
  return {
    async listFacets(t) { return db().situation_facet.filter((x) => x.tenant_id === t).map(toFacet); },
    async saveFacet(t, f) {
      const s = db();
      if (s.situation_facet.some((x) => x.tenant_id === t && x.key === f.key && x.id !== f.id)) throw new Error('duplicate key: situation_facet (tenant_id, key)');
      const row: SituationFacetRow = {
        id: f.id ?? randomUUID(), tenant_id: t, key: f.key, label: f.label, question: f.question, icon: f.icon, scope: f.scope, multi: f.multi,
        weight: f.weight, options: structuredClone(f.options), position: f.position, status: f.status,
      };
      s.situation_facet = [...s.situation_facet.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async listStories(t) { return db().win_story.filter((x) => x.tenant_id === t).map(toStory); },
    async saveStory(t, w) {
      const s = db();
      const now = new Date().toISOString();
      const cur = s.win_story.find((x) => x.id === w.id || (w.dossierId && x.dossier_id === w.dossierId));
      const row: WinStoryRow = {
        id: cur?.id ?? randomUUID(), tenant_id: t, dossier_id: w.dossierId, author_id: w.authorId, outcome: w.outcome, segment_id: w.segmentId,
        persona_ids: [...w.personaIds], situation: structuredClone(w.situation), play_ids: [...w.playIds], what_worked: w.whatWorked, what_failed: w.whatFailed,
        key_stage: w.keyStage, objection: w.objection, title: w.title, status: w.status, created_at: cur?.created_at ?? now, updated_at: now,
      };
      // Misma regla que el check de Postgres.
      if (row.outcome === 'won' && !row.what_worked?.trim()) throw new Error('violates check constraint: win_story what_worked');
      s.win_story = [...s.win_story.filter((x) => x.id !== row.id), row];
      if (!cur) demoEmitStory(row);
      return row.id;
    },
    async setStoryStatus(id, status) {
      const r = db().win_story.find((x) => x.id === id);
      if (!r) return false;
      r.status = status;
      return true;
    },
  };
}
