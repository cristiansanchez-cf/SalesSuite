/**
 * Playbook de ventas (docs/PLAYBOOK.md). Mismo patrón que la consola: reglas aquí, datos en PlaybookDb/AdminDb
 * (RLS en Supabase como segunda barrera).
 *  - Cualquier miembro: aprender, compartir trucos, proponer mejoras, votar, ver el guion de sus dossiers.
 *  - Admin (CEO / líder de ventas): editar lo oficial, revisar la bandeja, ver métricas, exportar.
 */
import type { AdminDb } from '../admin/db';
import { latestByModule, AdminError, type AdminService } from '../admin/service';
import type { AdminSession, CatalogVersion } from '../admin/types';
import type { PlaybookDb } from './db';
import { changeInputSchema, playInputSchema, tipInputSchema, voteSchema } from './schema';
import { buildTalkTrack, type TalkTrack } from './talk-track';
import {
  KIND_ORDER, KIND_LABEL, OBJECTION_LABEL, STAGE_LABEL,
  type Contribution, type ContributionView, type Feedback, type Play, type PlayKind, type PlayView, type Score, type TargetType,
} from './types';
import type { z } from 'zod';

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}

export interface TopicModule { moduleId: string; name: string; description: string | null; blockType: string; versionId: string }

export interface LearnIndex {
  general: { playCount: number; learned: boolean };
  modules: Array<TopicModule & { playCount: number; tipCount: number; learned: boolean }>;
  progress: { done: number; total: number };
  news: Array<{ playId: string; title: string; topic: string; topicName: string; note: string | null; at: string }>;
  newTips: number;
}

export interface TopicView {
  topic: string;
  name: string;
  module: TopicModule | null;
  sections: Array<{ kind: PlayKind; label: string; plays: PlayView[] }>;
  tips: ContributionView[];
  myOpen: ContributionView[];
  learned: boolean;
}

export function createPlaybookService(pdb: PlaybookDb, adb: AdminDb, s: AdminSession, deps: { admin: AdminService }) {
  const isAdmin = s.role === 'admin';
  const requireAdmin = () => { if (!isAdmin) throw new AdminError(403, 'Solo el líder (admin) puede editar el playbook oficial'); };
  const wrote = (ok: boolean) => { if (!ok) throw new AdminError(403, 'Sin permiso para esta operación'); };
  const now = () => new Date().toISOString();

  function scores(feedback: Feedback[]) {
    const m = new Map<string, Score>();
    for (const f of feedback) {
      const k = `${f.targetType}:${f.targetId}`;
      const sc = m.get(k) ?? { worked: 0, didnt: 0, mine: null };
      if (f.verdict === 'worked') sc.worked++; else sc.didnt++;
      if (f.userId === s.userId) sc.mine = f.verdict;
      m.set(k, sc);
    }
    return (t: TargetType, id: string): Score => m.get(`${t}:${id}`) ?? { worked: 0, didnt: 0, mine: null };
  }

  async function load() {
    const [plays, contributions, feedback, catalog] = await Promise.all([
      pdb.listPlays(s.tenantId), pdb.listContributions(s.tenantId), pdb.listFeedback(s.tenantId), adb.listCatalog(s.tenantId),
    ]);
    const score = scores(feedback);
    const names = await adb.userNames([...new Set(contributions.map((c) => c.authorId))]);
    const playTitle = new Map(plays.map((p) => [p.id, p.title]));
    const pv: PlayView[] = plays.map((p) => ({ ...p, score: score('play', p.id) }));
    const cv: ContributionView[] = contributions.map((c) => ({
      ...c, score: score('contribution', c.id), authorName: names.get(c.authorId) ?? null, playTitle: c.playId ? playTitle.get(c.playId) ?? null : null,
    }));
    const latest = latestByModule(catalog);
    return { plays: pv, contributions: cv, feedback, latest };
  }

  const topicModule = (latest: Map<string, CatalogVersion>, moduleId: string): TopicModule | null => {
    const v = latest.get(moduleId);
    return v ? { moduleId, name: v.moduleName, description: v.description, blockType: v.blockType, versionId: v.versionId } : null;
  };
  const visibleTip = (c: ContributionView) => c.type === 'tip' && (c.status === 'shared' || c.status === 'accepted');
  const official = (p: PlayView) => p.status === 'official';

  // ------------------------------------------------------------ aprender
  async function learnIndex(): Promise<LearnIndex> {
    const [{ plays, contributions, latest }, progress, seenAt] = await Promise.all([
      load(), pdb.listProgress(s.tenantId), pdb.getSeen(s.tenantId, s.userId),
    ]);
    const mine = new Set(progress.filter((p) => p.userId === s.userId).map((p) => p.topic));
    const off = plays.filter(official);
    const modules = [...latest.values()]
      .map((v) => ({
        ...topicModule(latest, v.moduleId)!,
        playCount: off.filter((p) => p.moduleId === v.moduleId).length,
        tipCount: contributions.filter((c) => visibleTip(c) && c.moduleId === v.moduleId).length,
        learned: mine.has(v.moduleId),
      }))
      .sort((a, b) => b.playCount - a.playCount || a.name.localeCompare(b.name));
    const revisions = await pdb.listRevisions(s.tenantId, { since: seenAt, limit: 20 });
    const byId = new Map(off.map((p) => [p.id, p]));
    const news = revisions.filter((r) => byId.has(r.playId)).map((r) => {
      const p = byId.get(r.playId)!;
      return {
        playId: p.id, title: p.title, topic: p.moduleId ?? 'general',
        topicName: p.moduleId ? latest.get(p.moduleId)?.moduleName ?? 'Módulo' : 'General', note: r.changeNote, at: r.createdAt,
      };
    });
    return {
      general: { playCount: off.filter((p) => p.moduleId === null).length, learned: mine.has('general') },
      modules,
      progress: { done: (mine.has('general') ? 1 : 0) + modules.filter((m) => m.learned).length, total: 1 + modules.length },
      news,
      newTips: contributions.filter((c) => visibleTip(c) && (!seenAt || c.createdAt > seenAt) && c.authorId !== s.userId).length,
    };
  }

  async function topic(topicId: string): Promise<TopicView> {
    const { plays, contributions, latest } = await load();
    const isGeneral = topicId === 'general';
    const module = isGeneral ? null : topicModule(latest, topicId);
    if (!isGeneral && !module) throw new AdminError(404, 'Módulo no encontrado en el catálogo');
    const moduleId = isGeneral ? null : topicId;
    const mine = plays.filter((p) => official(p) && p.moduleId === moduleId);
    const playIds = new Set(mine.map((p) => p.id));
    const sections = KIND_ORDER
      .map((k) => ({ kind: k, label: KIND_LABEL[k], plays: mine.filter((p) => p.kind === k).sort((a, b) => a.position - b.position) }))
      .filter((x) => x.plays.length);
    const related = (c: ContributionView) => (c.moduleId === moduleId && (c.playId === null || playIds.has(c.playId))) || (c.playId !== null && playIds.has(c.playId));
    const progress = await pdb.listProgress(s.tenantId);
    return {
      topic: topicId,
      name: module?.name ?? 'Empieza aquí: la empresa',
      module,
      sections,
      tips: contributions.filter((c) => visibleTip(c) && related(c)).sort((a, b) => (b.score.worked - b.score.didnt) - (a.score.worked - a.score.didnt) || b.createdAt.localeCompare(a.createdAt)),
      myOpen: contributions.filter((c) => c.authorId === s.userId && c.status !== 'shared' && related(c)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      learned: progress.some((p) => p.userId === s.userId && p.topic === topicId),
    };
  }

  async function markLearned(topicId: string, done: boolean) {
    if (topicId !== 'general') {
      const { latest } = await load();
      if (!latest.has(topicId)) throw new AdminError(404, 'Módulo no encontrado');
    }
    await pdb.setProgress(s.tenantId, s.userId, topicId, done);
  }

  async function markSeen() { await pdb.setSeen(s.tenantId, s.userId, now()); }

  /** Vista previa del módulo (última versión publicada) para cualquier miembro: "lo que verá el cliente". */
  async function modulePreview(moduleId: string, locale: string) {
    const [modules, versions] = await Promise.all([adb.listModules(s.tenantId), adb.listModuleVersions(s.tenantId)]);
    const m = modules.find((x) => x.id === moduleId && x.isCatalog);
    const v = versions.filter((x) => x.moduleId === moduleId && x.status === 'published').sort((a, b) => b.version - a.version)[0];
    if (!m || !v) throw new AdminError(404, 'Módulo no encontrado');
    return {
      id: `learn-${v.id}`, tenantId: s.tenantId, title: m.name, prospectName: 'Laura', prospectCompany: 'Empresa Ejemplo', locale,
      priceMode: v.defaultPrice != null ? 'per_module' as const : 'none' as const, totalPrice: null, currency: v.currency, themeOverride: null,
      items: [{ id: v.id, position: 1, blockType: m.blockType, moduleKey: m.key, defaultProps: v.defaultProps, propOverrides: {}, defaultPrice: v.defaultPrice, priceOverride: null, currency: v.currency }],
    };
  }

  /** Nº de mejoras pendientes (badge del menú para el líder). */
  async function pendingCount(): Promise<number> {
    if (!isAdmin) return 0;
    return (await pdb.listContributions(s.tenantId)).filter((c) => c.type === 'change' && c.status === 'pending').length;
  }

  // ------------------------------------------------------------ equipo
  async function shareTip(input: unknown): Promise<string> {
    const t = parse(tipInputSchema, input);
    const { latest, plays } = await load();
    if (t.moduleId && !latest.has(t.moduleId)) throw new AdminError(404, 'Módulo no encontrado');
    if (t.playId && !plays.some((p) => p.id === t.playId && official(p))) throw new AdminError(404, 'Jugada no encontrada');
    return pdb.insertContribution(s.tenantId, {
      type: 'tip', playId: t.playId ?? null, moduleId: t.moduleId, kind: t.kind, title: t.title, body: t.body, status: 'shared', authorId: s.userId,
    });
  }

  async function proposeChange(input: unknown): Promise<string> {
    const c = parse(changeInputSchema, input);
    const { plays } = await load();
    const play = plays.find((p) => p.id === c.playId && official(p));
    if (!play) throw new AdminError(404, 'Jugada no encontrada');
    if (c.body.trim() === play.body.trim()) throw new AdminError(422, 'El texto propuesto es igual al actual');
    return pdb.insertContribution(s.tenantId, {
      type: 'change', playId: play.id, moduleId: play.moduleId, kind: play.kind, title: c.title, body: c.body, status: 'pending', authorId: s.userId,
    });
  }

  async function withdraw(contributionId: string) {
    const c = (await pdb.listContributions(s.tenantId)).find((x) => x.id === contributionId);
    if (!c) throw new AdminError(404, 'Aporte no encontrado');
    if (c.authorId !== s.userId && !isAdmin) throw new AdminError(403, 'Solo puedes retirar tus aportes');
    if (!['shared', 'pending'].includes(c.status) && !isAdmin) throw new AdminError(409, 'Ya está revisado');
    wrote(await pdb.deleteContribution(contributionId));
  }

  async function vote(input: unknown) {
    const v = parse(voteSchema, input);
    const { plays, contributions } = await load();
    const exists = v.targetType === 'play'
      ? plays.some((p) => p.id === v.targetId && official(p))
      : contributions.some((c) => c.id === v.targetId && visibleTip(c));
    if (!exists) throw new AdminError(404, 'No encontrado');
    if (v.dossierId) await deps.admin.getState(v.dossierId); // 404 si no es del tenant
    if (v.verdict === null) await pdb.deleteFeedback(s.userId, v.targetType, v.targetId);
    else await pdb.upsertFeedback(s.tenantId, { userId: s.userId, targetType: v.targetType, targetId: v.targetId, verdict: v.verdict, note: v.note ?? null, dossierId: v.dossierId ?? null });
  }

  // ------------------------------------------------------------ guion del dossier
  async function talkTrack(dossierId: string): Promise<TalkTrack> {
    const state = await deps.admin.getState(dossierId);
    const { plays, contributions } = await load();
    return buildTalkTrack(state, plays, contributions);
  }

  // ------------------------------------------------------------ líder (admin)
  const snapshot = (p: Pick<Play, 'title' | 'body' | 'kind' | 'stage' | 'objection' | 'whenToUse' | 'whyItWorks' | 'techniqueRefs' | 'moduleId' | 'status'>) => ({
    title: p.title, body: p.body, kind: p.kind, stage: p.stage, objection: p.objection, whenToUse: p.whenToUse,
    whyItWorks: p.whyItWorks, techniqueRefs: p.techniqueRefs, moduleId: p.moduleId, status: p.status,
  });

  async function listAll() {
    requireAdmin();
    const { plays, latest } = await load();
    return {
      plays: plays.sort((a, b) => (a.moduleId ?? '').localeCompare(b.moduleId ?? '') || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.position - b.position),
      modules: [...latest.values()].map((v) => ({ id: v.moduleId, name: v.moduleName })),
    };
  }

  async function createPlay(input: unknown, note?: string): Promise<string> {
    requireAdmin();
    const p = parse(playInputSchema, input);
    const { plays, latest } = await load();
    if (p.moduleId && !latest.has(p.moduleId)) throw new AdminError(404, 'Módulo no encontrado');
    if (p.key && plays.some((x) => x.key === p.key)) throw new AdminError(409, 'Ya existe una jugada con esa clave');
    const position = Math.max(0, ...plays.filter((x) => x.moduleId === p.moduleId).map((x) => x.position)) + 1024;
    const row = {
      moduleId: p.moduleId, key: p.key ?? null, kind: p.kind, stage: p.stage ?? null, objection: p.objection ?? null, segments: p.segments,
      title: p.title, body: p.body, whenToUse: p.whenToUse ?? null, whyItWorks: p.whyItWorks ?? null, techniqueRefs: p.techniqueRefs,
      position, status: p.status, authorId: s.userId, updatedBy: s.userId,
    };
    const id = await pdb.insertPlay(s.tenantId, row);
    await pdb.insertRevision(s.tenantId, { playId: id, version: 1, snapshot: snapshot(row), changeNote: note ?? 'Creada', changedBy: s.userId, contributionId: null });
    return id;
  }

  async function updatePlay(id: string, input: unknown, note: string | null, contributionId: string | null = null) {
    requireAdmin();
    const p = parse(playInputSchema, input);
    const { plays, latest } = await load();
    const cur = plays.find((x) => x.id === id);
    if (!cur) throw new AdminError(404, 'Jugada no encontrada');
    if (p.moduleId && !latest.has(p.moduleId)) throw new AdminError(404, 'Módulo no encontrado');
    if (p.key && plays.some((x) => x.key === p.key && x.id !== id)) throw new AdminError(409, 'Ya existe una jugada con esa clave');
    const next = {
      moduleId: p.moduleId, key: p.key ?? cur.key, kind: p.kind, stage: p.stage ?? null, objection: p.objection ?? null, segments: p.segments,
      title: p.title, body: p.body, whenToUse: p.whenToUse ?? null, whyItWorks: p.whyItWorks ?? null, techniqueRefs: p.techniqueRefs,
      status: p.status, version: cur.version + 1, updatedBy: s.userId,
    };
    wrote(await pdb.updatePlay(id, next));
    await pdb.insertRevision(s.tenantId, { playId: id, version: next.version, snapshot: snapshot(next), changeNote: note, changedBy: s.userId, contributionId });
  }

  async function setPlayStatus(id: string, status: 'official' | 'archived' | 'draft', note?: string) {
    requireAdmin();
    const cur = (await pdb.listPlays(s.tenantId)).find((x) => x.id === id);
    if (!cur) throw new AdminError(404, 'Jugada no encontrada');
    if (cur.status === status) return;
    wrote(await pdb.updatePlay(id, { status, version: cur.version + 1, updatedBy: s.userId }));
    await pdb.insertRevision(s.tenantId, {
      playId: id, version: cur.version + 1, snapshot: snapshot({ ...cur, status }),
      changeNote: note ?? { official: 'Publicada', archived: 'Archivada', draft: 'Pasada a borrador' }[status], changedBy: s.userId, contributionId: null,
    });
  }

  async function history(playId: string) {
    requireAdmin();
    const revs = await pdb.listRevisions(s.tenantId, { playId, limit: 50 });
    const names = await adb.userNames([...new Set(revs.map((r) => r.changedBy).filter((x): x is string => !!x))]);
    return revs.map((r) => ({ ...r, changedByName: r.changedBy ? names.get(r.changedBy) ?? null : null }));
  }

  async function inbox() {
    requireAdmin();
    const { plays, contributions } = await load();
    const byId = new Map(plays.map((p) => [p.id, p]));
    return {
      pending: contributions.filter((c) => c.type === 'change' && c.status === 'pending')
        .map((c) => ({ ...c, current: c.playId ? byId.get(c.playId) ?? null : null }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      tips: contributions.filter((c) => c.type === 'tip' && c.status === 'shared')
        .sort((a, b) => (b.score.worked - b.score.didnt) - (a.score.worked - a.score.didnt) || b.createdAt.localeCompare(a.createdAt)),
      reviewed: contributions.filter((c) => ['accepted', 'rejected', 'hidden'].includes(c.status))
        .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? '')).slice(0, 20),
    };
  }

  async function review(contributionId: string, action: 'accept' | 'reject' | 'promote' | 'hide', note?: string | null) {
    requireAdmin();
    const { plays, contributions } = await load();
    const c = contributions.find((x) => x.id === contributionId);
    if (!c) throw new AdminError(404, 'Aporte no encontrado');
    const reviewed = { reviewedBy: s.userId, reviewedAt: now(), reviewNote: note?.trim() || null };
    const credit = `${c.authorName ?? 'el equipo'}`;

    if (action === 'accept') {
      if (c.type !== 'change' || c.status !== 'pending') throw new AdminError(409, 'Solo se aceptan mejoras pendientes');
      const play = plays.find((p) => p.id === c.playId);
      if (!play) throw new AdminError(404, 'La jugada ya no existe');
      await updatePlay(play.id, { ...play, body: c.body }, `${c.title} (propuesta de ${credit})`, c.id);
      wrote(await pdb.updateContribution(c.id, { status: 'accepted', ...reviewed }));
    } else if (action === 'reject') {
      if (c.status !== 'pending') throw new AdminError(409, 'Solo se rechazan mejoras pendientes');
      if (!reviewed.reviewNote) throw new AdminError(422, 'Explica el motivo: ayuda a quien lo propuso');
      wrote(await pdb.updateContribution(c.id, { status: 'rejected', ...reviewed }));
    } else if (action === 'promote') {
      if (c.type !== 'tip' || c.status !== 'shared') throw new AdminError(409, 'Solo se ascienden trucos compartidos');
      await createPlay({ moduleId: c.moduleId, kind: c.kind, title: c.title, body: c.body, status: 'official' }, `Truco del equipo de ${credit} ascendido a oficial`);
      wrote(await pdb.updateContribution(c.id, { status: 'accepted', ...reviewed }));
    } else {
      if (c.type !== 'tip' || c.status !== 'shared') throw new AdminError(409, 'Solo se ocultan trucos compartidos');
      wrote(await pdb.updateContribution(c.id, { status: 'hidden', ...reviewed }));
    }
  }

  async function metrics() {
    requireAdmin();
    const [{ plays, contributions, latest }, progress, members, dossiers] = await Promise.all([
      load(), pdb.listProgress(s.tenantId), adb.listMembers(s.tenantId), adb.listDossiers(s.tenantId),
    ]);
    const off = plays.filter(official);
    const votes = (x: { score: Score }) => x.score.worked + x.score.didnt;
    const totalTopics = 1 + latest.size;
    return {
      best: off.filter((p) => p.score.worked > 0).sort((a, b) => (b.score.worked - b.score.didnt) - (a.score.worked - a.score.didnt)).slice(0, 8),
      struggling: off.filter((p) => votes(p) >= 2 && p.score.didnt >= p.score.worked).sort((a, b) => b.score.didnt - a.score.didnt),
      topTips: contributions.filter((c) => c.type === 'tip' && c.status === 'shared' && c.score.worked > 0).sort((a, b) => b.score.worked - a.score.worked).slice(0, 8),
      uncoveredModules: [...latest.values()].filter((v) => !off.some((p) => p.moduleId === v.moduleId)).map((v) => v.moduleName),
      team: members.map((m) => {
        const done = progress.filter((p) => p.userId === m.userId).length;
        return { name: m.displayName || m.email, role: m.role, done, total: totalTopics };
      }).sort((a, b) => b.done - a.done),
      outcomes: {
        open: dossiers.filter((d) => (d.outcome ?? 'open') === 'open' && d.status === 'published').length,
        won: dossiers.filter((d) => d.outcome === 'won').length,
        lost: dossiers.filter((d) => d.outcome === 'lost').length,
      },
    };
  }

  /** Exportación con formato de ficha del Cerebro de Ventas (para ingesta futura). */
  async function exportCards() {
    requireAdmin();
    const { plays, contributions, latest } = await load();
    const card = (x: PlayView) => ({
      id: x.id, origen: 'oficial',
      modulo: x.moduleId ? latest.get(x.moduleId)?.moduleName ?? null : null,
      tipo: KIND_LABEL[x.kind], tecnica: x.title, guion: x.body,
      cuando_usarlo: x.whenToUse, por_que_funciona: x.whyItWorks,
      etapa: x.stage ? STAGE_LABEL[x.stage] : null, objecion: x.objection ? OBJECTION_LABEL[x.objection] : null,
      segmentos: x.segments, referencias_cerebro: x.techniqueRefs,
      evidencia_equipo: { funciono: x.score.worked, no_funciono: x.score.didnt }, version: x.version, actualizada: x.updatedAt,
    });
    return {
      formato: 'salessuite.playbook/v1',
      tenant: s.tenantId,
      generado: now(),
      jugadas: plays.filter(official).map(card),
      aportes_equipo: contributions.filter((c) => c.type === 'tip' && c.status === 'shared').map((c) => ({
        id: c.id, origen: 'equipo', modulo: c.moduleId ? latest.get(c.moduleId)?.moduleName ?? null : null,
        tipo: KIND_LABEL[c.kind], tecnica: c.title, guion: c.body, autor: c.authorName,
        evidencia_equipo: { funciono: c.score.worked, no_funciono: c.score.didnt }, creado: c.createdAt,
      })),
    };
  }

  return {
    isAdmin, learnIndex, topic, modulePreview, pendingCount, markLearned, markSeen, shareTip, proposeChange, withdraw, vote, talkTrack,
    listAll, createPlay, updatePlay, setPlayStatus, history, inbox, review, metrics, exportCards,
  };
}

export type PlaybookService = ReturnType<typeof createPlaybookService>;
export type { Contribution };
