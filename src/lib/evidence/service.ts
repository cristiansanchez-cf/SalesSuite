/**
 * Qué ha funcionado (docs/EVIDENCE.md): evidencia de cierres reales en lugar de «me gusta».
 * Un «me gusta» dice que algo suena bien; un cierre documentado dice que FUNCIONÓ, con quién y en qué situación.
 *  - Cualquiera que vende documenta sus cierres (ganados o perdidos) en dos minutos.
 *  - Las jugadas se ordenan por cuántas veces se usaron en cierres ganados frente a perdidos.
 *  - «En situaciones parecidas funcionó…»: se comparan sector, actores y las facetas que define el tenant.
 * Cuando haya CRM (WhatsApp/n8n), los cierres se rellenarán solos con la interacción registrada.
 */
import type { AdminDb } from '../admin/db';
import { can } from '../admin/permissions';
import { AdminError, type AdminService } from '../admin/service';
import type { AdminSession, BuilderState } from '../admin/types';
import type { PlaybookDb } from '../playbook/db';
import type { z } from 'zod';
import type { EvidenceDb } from './db';
import { facetInputSchema, queryInputSchema, storyInputSchema } from './schema';
import { cleanSituation, compare, mergeSituation, winRate } from './similarity';
import type { Facet, PlayEvidence, PlayRecommendation, SituationQuery, StoryMatch, WinStory } from './types';

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}

/** Evidencia por jugada a partir de cierres compartidos. */
export function evidenceByPlay(stories: WinStory[]): Map<string, PlayEvidence> {
  const m = new Map<string, PlayEvidence>();
  for (const s of stories) {
    if (s.status !== 'shared') continue;
    for (const id of s.playIds) {
      const e = m.get(id) ?? { used: 0, won: 0, lost: 0 };
      e.used++;
      if (s.outcome === 'won') e.won++; else e.lost++;
      m.set(id, e);
    }
  }
  return m;
}

export function createEvidenceService(edb: EvidenceDb, pdb: PlaybookDb, adb: AdminDb, s: AdminSession, deps: { admin: AdminService }) {
  const isAdmin = can(s.role).managePlaybook;
  const requireAdmin = () => { if (!isAdmin) throw new AdminError(403, 'Solo el líder (admin) configura las situaciones'); };

  async function facets(opts: { all?: boolean } = {}): Promise<Facet[]> {
    const list = await edb.listFacets(s.tenantId);
    return list.filter((f) => (opts.all && isAdmin) || f.status === 'official').sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
  }

  async function saveFacet(input: unknown, id?: string): Promise<string> {
    requireAdmin();
    const v = parse(facetInputSchema, input);
    const all = await edb.listFacets(s.tenantId);
    const cur = id ? all.find((f) => f.id === id) : undefined;
    if (id && !cur) throw new AdminError(404, 'Faceta no encontrada');
    if (all.some((f) => f.key === v.key && f.id !== id)) throw new AdminError(409, `Ya existe una faceta con la clave «${v.key}»`);
    return edb.saveFacet(s.tenantId, {
      id, key: cur?.key ?? v.key, label: v.label, question: v.question ?? null, icon: v.icon ?? null, scope: v.scope, multi: v.multi,
      weight: v.weight, options: v.options, status: v.status, position: cur?.position ?? Math.max(0, ...all.map((f) => f.position)) + 1024,
    });
  }

  async function names() {
    const [segments, personas, fs] = await Promise.all([pdb.listSegments(s.tenantId), pdb.listPersonas(s.tenantId), facets()]);
    const seg = new Map(segments.map((x) => [x.id, x.name]));
    const per = new Map(personas.map((x) => [x.id, x.name]));
    return { segment: (id: string) => seg.get(id) ?? null, persona: (id: string) => per.get(id) ?? null, facets: fs, segments, personas };
  }

  /** Situación de un dossier: sector, actores mapeados y facetas de la cuenta + rasgos de sus personas. */
  function queryOf(state: BuilderState, fs: Facet[]): SituationQuery {
    return {
      segmentId: state.dossier.segmentId,
      personaIds: [...new Set(state.contacts.map((c) => c.personaId).filter((x): x is string => !!x))],
      situation: cleanSituation(mergeSituation(state.dossier.situation, ...state.contacts.map((c) => c.traits ?? {})), fs, { keepAll: true }),
    };
  }

  async function visibleStories(): Promise<WinStory[]> {
    return (await edb.listStories(s.tenantId)).filter((x) => x.status === 'shared' || isAdmin || x.authorId === s.userId);
  }

  /** «En situaciones parecidas funcionó…»: cierres ordenados por parecido y jugadas que más ganan en ellos. */
  async function recommend(input: unknown, opts: { excludeDossierId?: string | null; limit?: number } = {}) {
    const v = parse(queryInputSchema, input);
    const n = await names();
    const q: SituationQuery = { segmentId: v.segmentId ?? null, personaIds: v.personaIds, situation: cleanSituation(v.situation, n.facets, { keepAll: true }) };
    const described = !!q.segmentId || q.personaIds.length > 0 || Object.keys(q.situation).length > 0;
    const [stories, plays] = await Promise.all([visibleStories(), pdb.listPlays(s.tenantId)]);
    const authorIds = [...new Set(stories.map((x) => x.authorId).filter((x): x is string => !!x))];
    const authors = await adb.userNames(authorIds);
    const pool = stories.filter((x) => x.status === 'shared' && (!opts.excludeDossierId || x.dossierId !== opts.excludeDossierId) && (!v.outcome || x.outcome === v.outcome));
    const matches: StoryMatch[] = pool
      .map((story) => ({
        story, ...compare(q, story, n),
        authorName: story.authorId ? authors.get(story.authorId) ?? null : null,
        segmentName: story.segmentId ? n.segment(story.segmentId) : null,
      }))
      .filter((m) => !described || m.score > 0)
      // Orden determinista: parecido, a igualdad lo ganado antes, luego lo más reciente y el id.
      .sort((a, b) => b.score - a.score || Number(b.story.outcome === 'won') - Number(a.story.outcome === 'won')
        || b.story.createdAt.localeCompare(a.story.createdAt) || a.story.id.localeCompare(b.story.id));

    const official = new Map(plays.filter((p) => p.status === 'official').map((p) => [p.id, p]));
    const rec = new Map<string, PlayRecommendation>();
    for (const m of matches) {
      for (const pid of m.story.playIds) {
        const p = official.get(pid);
        if (!p) continue;
        const r = rec.get(pid) ?? { playId: pid, title: p.title, moduleId: p.moduleId, wonIn: 0, lostIn: 0, score: 0 };
        const w = Math.max(1, m.score);
        if (m.story.outcome === 'won') { r.wonIn++; r.score += w; } else { r.lostIn++; r.score -= w / 2; }
        rec.set(pid, r);
      }
    }
    const playRecs = [...rec.values()].filter((r) => r.wonIn > 0)
      .sort((a, b) => b.score - a.score || b.wonIn - a.wonIn || a.title.localeCompare(b.title));
    const limit = opts.limit ?? 20;
    return {
      query: q,
      described,
      stories: matches.slice(0, limit),
      total: matches.length,
      won: matches.filter((m) => m.story.outcome === 'won').length,
      plays: playRecs.slice(0, 8),
      facets: n.facets,
    };
  }

  async function forDossier(dossierId: string, opts: { limit?: number } = {}) {
    const [state, fs] = await Promise.all([deps.admin.getState(dossierId), facets()]);
    const q = queryOf(state, fs);
    return recommend(q, { excludeDossierId: dossierId, limit: opts.limit ?? 5 });
  }

  /** Lo necesario para documentar el cierre de un dossier, con todo lo que ya se sabe prerrellenado. */
  async function debrief(dossierId: string) {
    const state = await deps.admin.getState(dossierId);
    if (!state.canEdit) throw new AdminError(403, 'Solo quien lleva la cuenta (o un admin) documenta su cierre');
    const [n, plays, stories] = await Promise.all([names(), pdb.listPlays(s.tenantId), edb.listStories(s.tenantId)]);
    const existing = stories.find((x) => x.dossierId === dossierId) ?? null;
    const q = queryOf(state, n.facets);
    const modules = new Set(state.items.filter((i) => i.visible).map((i) => i.moduleId));
    const candidates = plays.filter((p) => p.status === 'official' && (p.moduleId === null || modules.has(p.moduleId)))
      .sort((a, b) => (a.moduleId ? 1 : 0) - (b.moduleId ? 1 : 0) || a.position - b.position);
    return {
      state,
      existing,
      defaults: existing ?? {
        outcome: state.dossier.outcome === 'lost' ? 'lost' as const : 'won' as const,
        segmentId: q.segmentId, personaIds: q.personaIds, situation: q.situation, playIds: [] as string[],
        whatWorked: null, whatFailed: null, keyStage: null, objection: null,
      },
      facets: n.facets,
      segments: n.segments.filter((x) => x.status === 'official'),
      personas: n.personas,
      plays: candidates,
    };
  }

  async function recordStory(dossierId: string, input: unknown): Promise<string> {
    const v = parse(storyInputSchema, input);
    const d = await debrief(dossierId);
    if (v.outcome === 'won' && !v.whatWorked) throw new AdminError(422, 'Cuenta qué funcionó: es lo que aprenderá el resto del equipo');
    if (v.outcome === 'lost' && !v.whatFailed && !v.whatWorked) throw new AdminError(422, 'Cuenta qué no funcionó: un cierre perdido también enseña');
    if (v.segmentId && !d.segments.some((x) => x.id === v.segmentId)) throw new AdminError(404, 'Sector no encontrado');
    if (v.personaIds.some((p) => !d.personas.some((x) => x.id === p))) throw new AdminError(404, 'Actor no encontrado');
    const playable = new Set((await pdb.listPlays(s.tenantId)).filter((p) => p.status === 'official').map((p) => p.id));
    if (v.playIds.some((p) => !playable.has(p))) throw new AdminError(404, 'Jugada no encontrada');
    const dossier = d.state.dossier;
    const id = await edb.saveStory(s.tenantId, {
      id: d.existing?.id, dossierId, authorId: d.existing?.authorId ?? s.userId, outcome: v.outcome, segmentId: v.segmentId ?? null,
      personaIds: v.personaIds, situation: cleanSituation(v.situation, d.facets), playIds: [...new Set(v.playIds)],
      whatWorked: v.whatWorked ?? null, whatFailed: v.whatFailed ?? null, keyStage: v.keyStage ?? null, objection: v.objection ?? null,
      title: (dossier.prospectCompany || dossier.title).slice(0, 160), status: 'shared',
    });
    if (dossier.outcome !== v.outcome) await deps.admin.apply(dossierId, { op: 'setOutcome', outcome: v.outcome });
    return id;
  }

  async function storyForDossier(dossierId: string): Promise<WinStory | null> {
    return (await edb.listStories(s.tenantId)).find((x) => x.dossierId === dossierId) ?? null;
  }

  async function setStoryHidden(id: string, hidden: boolean) {
    requireAdmin();
    if (!(await edb.listStories(s.tenantId)).some((x) => x.id === id)) throw new AdminError(404, 'Cierre no encontrado');
    if (!(await edb.setStoryStatus(id, hidden ? 'hidden' : 'shared'))) throw new AdminError(403, 'Sin permiso para esta operación');
  }

  /** Jugadas por evidencia: ganadas/usadas, con tasa suavizada para no exagerar con pocos casos. */
  async function ranking() {
    const [stories, plays] = await Promise.all([visibleStories(), pdb.listPlays(s.tenantId)]);
    const ev = evidenceByPlay(stories);
    return plays.filter((p) => p.status === 'official' && ev.has(p.id))
      .map((p) => ({ play: p, ...ev.get(p.id)!, rate: winRate(ev.get(p.id)!.won, ev.get(p.id)!.used) }))
      .sort((a, b) => b.rate - a.rate || b.won - a.won || a.play.title.localeCompare(b.play.title));
  }

  return { facets, saveFacet, recommend, forDossier, debrief, recordStory, storyForDossier, setStoryHidden, ranking, queryOf };
}

export type EvidenceService = ReturnType<typeof createEvidenceService>;
