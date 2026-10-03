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
import { changeInputSchema, contextInputSchema, personaInputSchema, playInputSchema, segmentInputSchema, tipInputSchema } from './schema';
import { buildContext, type ContextBrief } from './context';
import type { PersonaView, SegmentView } from './market';
import { buildTalkTrack, type TalkTrack } from './talk-track';
import {
  KIND_ORDER, KIND_LABEL, OBJECTION_LABEL, STAGE_LABEL,
  type Contribution, type ContributionView, type Feedback, type Play, type PlayKind, type PlayView, type Score, type TargetType,
} from './types';
import type { z } from 'zod';
import { can } from '../admin/permissions';
import type { EvidenceDb } from '../evidence/db';
import { evidenceByPlay } from '../evidence/service';

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AdminError(422, 'Datos no válidos', r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`));
  return r.data;
}

/** Primera imagen de producto dentro de las props de un módulo (p. ej. una pestaña con captura). */
export function firstImage(v: unknown): string | null {
  if (typeof v === 'string') return /^(https:\/\/|\/)[^\s"'()]+\.(webp|png|jpe?g|avif)(\?[^\s"'()]*)?$/i.test(v) ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const r = firstImage(x); if (r) return r; } return null; }
  if (v && typeof v === 'object') { for (const x of Object.values(v)) { const r = firstImage(x); if (r) return r; } }
  return null;
}

/** tenant.tour validado (lo escribe el alta del espacio; se lee con cuidado igualmente). */
export function tourOf(raw: unknown): TourStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    if (typeof o.title !== 'string' || !o.title.trim()) return [];
    const image = typeof o.image === 'string' && /^(https:\/\/|\/)[^\s"'()]+$/.test(o.image) ? o.image : null;
    return [{ title: o.title.slice(0, 80), body: typeof o.body === 'string' ? o.body.slice(0, 240) : null, image }];
  });
}

export interface TopicModule { moduleId: string; name: string; description: string | null; blockType: string; versionId: string }

export interface TourStep { title: string; body: string | null; image: string | null }

export interface LearnIndex {
  /** «Lo que vendes, en 1 minuto» (tenant.tour). Vacío = la empresa aún no lo ha preparado. */
  tour: { steps: TourStep[]; learned: boolean };
  general: { playCount: number; learned: boolean };
  /** cover: primera imagen de producto del módulo (para el fondo de su tarjeta). */
  modules: Array<TopicModule & { playCount: number; tipCount: number; learned: boolean; cover: string | null }>;
  /** Sectores que esta persona ya ha repasado (claves). */
  sectorsLearned: string[];
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

export function createPlaybookService(pdb: PlaybookDb, adb: AdminDb, s: AdminSession, deps: { admin: AdminService; evidence?: EvidenceDb }) {
  /** Admin o jefe/a de ventas (src/lib/admin/permissions.ts). */
  const isAdmin = can(s.role).managePlaybook;
  const isPartner = s.role === 'partner';
  const requireAdmin = () => { if (!isAdmin) throw new AdminError(403, 'Solo un admin o el jefe/a de ventas puede editar el playbook oficial'); };
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
    const [plays, contributions, feedback, catalog, stories] = await Promise.all([
      pdb.listPlays(s.tenantId), pdb.listContributions(s.tenantId), pdb.listFeedback(s.tenantId), adb.listCatalog(s.tenantId),
      deps.evidence ? deps.evidence.listStories(s.tenantId) : Promise.resolve([]),
    ]);
    const score = scores(feedback);
    // Evidencia objetiva: cierres ganados/perdidos en los que se usó cada jugada (docs/EVIDENCE.md).
    const ev = evidenceByPlay(stories);
    const names = await adb.userNames([...new Set(contributions.map((c) => c.authorId))]);
    const playTitle = new Map(plays.map((p) => [p.id, p.title]));
    const pv: PlayView[] = plays.map((p) => {
      const e = ev.get(p.id) ?? { used: 0, won: 0, lost: 0 };
      return { ...p, score: { worked: e.won, didnt: e.lost, mine: null }, evidence: e };
    });
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
    const [{ plays, contributions, latest }, progress, seenAt, versions, tenant, segs] = await Promise.all([
      load(), pdb.listProgress(s.tenantId), pdb.getSeen(s.tenantId, s.userId), adb.listModuleVersions(s.tenantId), adb.getTenant(s.tenantId), loadMarket(),
    ]);
    const coverOf = new Map(versions.map((v) => [v.id, firstImage(v.defaultProps)]));
    const mine = new Set(progress.filter((p) => p.userId === s.userId).map((p) => p.topic));
    const off = plays.filter(official);
    const modules = [...latest.values()]
      .map((v) => ({
        ...topicModule(latest, v.moduleId)!,
        playCount: off.filter((p) => p.moduleId === v.moduleId).length,
        tipCount: contributions.filter((c) => visibleTip(c) && c.moduleId === v.moduleId).length,
        learned: mine.has(v.moduleId),
        cover: coverOf.get(v.versionId) ?? null,
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
    const tour = { steps: tourOf(tenant?.tour), learned: mine.has('tour') };
    const sectorKeys = segs.segments.filter((x) => x.status !== 'archived').map((x) => x.key);
    const sectorsLearned = sectorKeys.filter((k) => mine.has(`sector:${k}`));
    return {
      tour,
      general: { playCount: off.filter((p) => p.moduleId === null).length, learned: mine.has('general') },
      modules,
      sectorsLearned,
      // Lo que cuenta: el recorrido (si existe), cada sector, cómo se vende (general) y cada módulo.
      progress: {
        done: (tour.steps.length && tour.learned ? 1 : 0) + sectorsLearned.length + (mine.has('general') ? 1 : 0) + modules.filter((m) => m.learned).length,
        total: (tour.steps.length ? 1 : 0) + sectorKeys.length + 1 + modules.length,
      },
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
    if (topicId.startsWith('sector:')) {
      const { segments } = await loadMarket();
      if (!segments.some((x) => `sector:${x.key}` === topicId)) throw new AdminError(404, 'Sector no encontrado');
    } else if (topicId !== 'general' && topicId !== 'tour') {
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
    return (await pdb.listContributions(s.tenantId)).filter((c) => c.status === 'pending').length;
  }

  // ------------------------------------------------------------ equipo
  async function shareTip(input: unknown): Promise<string> {
    const t = parse(tipInputSchema, input);
    const { latest, plays } = await load();
    if (t.moduleId && !latest.has(t.moduleId)) throw new AdminError(404, 'Módulo no encontrado');
    if (t.playId && !plays.some((p) => p.id === t.playId && official(p))) throw new AdminError(404, 'Jugada no encontrada');
    return pdb.insertContribution(s.tenantId, {
      // Los colaboradores aportan, pero su truco espera a que el admin o el jefe/a de ventas lo apruebe.
      type: 'tip', playId: t.playId ?? null, moduleId: t.moduleId, kind: t.kind, title: t.title, body: t.body, status: isPartner ? 'pending' : 'shared', authorId: s.userId,
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

  // ------------------------------------------------------------ mapa de mercado
  async function loadMarket() {
    const [segments, personas, segMods, perMods, catalog] = await Promise.all([
      pdb.listSegments(s.tenantId), pdb.listPersonas(s.tenantId), pdb.listSegmentModules(s.tenantId),
      pdb.listPersonaModules(s.tenantId), adb.listModules(s.tenantId),
    ]);
    const modName = new Map(catalog.map((m) => [m.id, m.name]));
    const personaViews: PersonaView[] = personas
      .map((p) => ({ ...p, angles: perMods.filter((a) => a.personaId === p.id).map((a) => ({ ...a, moduleName: modName.get(a.moduleId) ?? 'Módulo' })) }))
      .sort((a, b) => a.position - b.position);
    const views: SegmentView[] = segments
      .filter((x) => x.status !== 'archived' || isAdmin)
      .sort((a, b) => a.position - b.position)
      .map((sg) => ({
        ...sg,
        personas: personaViews.filter((p) => p.segmentId === sg.id),
        modules: segMods.filter((m) => m.segmentId === sg.id).map((m) => ({ ...m, moduleName: modName.get(m.moduleId) ?? 'Módulo' }))
          .sort((a, b) => a.priority - b.priority),
      }));
    return { segments: views, personas: personaViews, moduleNames: modName };
  }

  async function market() {
    const m = await loadMarket();
    const { plays } = await load();
    const off = plays.filter(official);
    return m.segments.map((sg) => ({
      ...sg,
      playCount: off.filter((p) => p.segments.includes(sg.key) || p.personas.some((k) => sg.personas.some((x) => x.key === k))).length,
    }));
  }

  async function segmentView(key: string) {
    const { segments } = await loadMarket();
    const sg = segments.find((x) => x.key === key);
    if (!sg) throw new AdminError(404, 'Sector no encontrado');
    const [{ plays, contributions }, progress] = await Promise.all([load(), pdb.listProgress(s.tenantId)]);
    const personaKeys = new Set(sg.personas.map((x) => x.key));
    const forSeg = plays.filter((p) => official(p) && (p.segments.includes(key) || p.personas.some((k) => personaKeys.has(k))));
    return {
      segment: sg,
      learned: progress.some((p) => p.userId === s.userId && p.topic === `sector:${key}`),
      plays: forSeg.sort((a, b) => a.position - b.position),
      byPersona: Object.fromEntries(sg.personas.map((x) => [x.key, forSeg.filter((p) => p.personas.includes(x.key))])),
      tips: contributions.filter((c) => visibleTip(c) && forSeg.some((p) => p.id === c.playId)),
    };
  }

  /** Encaje de un módulo: en qué sectores y qué le aporta a cada actor (ficha de venta del módulo). */
  async function moduleFit(moduleId: string) {
    const { segments } = await loadMarket();
    return segments
      .map((sg) => ({
        segment: { key: sg.key, name: sg.name },
        fit: sg.modules.find((m) => m.moduleId === moduleId) ?? null,
        angles: sg.personas.flatMap((p) => p.angles.filter((a) => a.moduleId === moduleId).map((a) => ({ persona: p.name, role: p.role, angle: a.angle }))),
      }))
      .filter((x) => x.fit || x.angles.length);
  }

  async function saveSegment(input: unknown, id?: string): Promise<string> {
    requireAdmin();
    const v = parse(segmentInputSchema, input);
    const segs = await pdb.listSegments(s.tenantId);
    if (id && !segs.some((x) => x.id === id)) throw new AdminError(404, 'Sector no encontrado');
    if (segs.some((x) => x.key === v.key && x.id !== id)) throw new AdminError(409, 'Ya existe un sector con esa clave');
    const cur = segs.find((x) => x.id === id);
    return pdb.saveSegment(s.tenantId, {
      id, key: v.key, name: v.name, description: v.description ?? null, valueProp: v.valueProp ?? null, icp: v.icp ?? null,
      disqualifiers: v.disqualifiers ?? null, buyingProcess: v.buyingProcess ?? null, dealSize: v.dealSize ?? null, salesCycle: v.salesCycle ?? null,
      position: cur?.position ?? Math.max(0, ...segs.map((x) => x.position)) + 1024, status: v.status,
      icon: v.icon ?? cur?.icon ?? null,
    });
  }

  async function savePersona(input: unknown, id?: string): Promise<string> {
    requireAdmin();
    const v = parse(personaInputSchema, input);
    const [segs, pers] = await Promise.all([pdb.listSegments(s.tenantId), pdb.listPersonas(s.tenantId)]);
    if (!segs.some((x) => x.id === v.segmentId)) throw new AdminError(404, 'Sector no encontrado');
    if (id && !pers.some((x) => x.id === id)) throw new AdminError(404, 'Actor no encontrado');
    if (pers.some((x) => x.key === v.key && x.id !== id)) throw new AdminError(409, 'Ya existe un actor con esa clave');
    const cur = pers.find((x) => x.id === id);
    return pdb.savePersona(s.tenantId, {
      id, segmentId: v.segmentId, key: v.key, name: v.name, role: v.role, goals: v.goals ?? null, pains: v.pains ?? null, kpis: v.kpis ?? null,
      objections: v.objections, howToApproach: v.howToApproach ?? null, avoid: v.avoid ?? null, canHelp: v.canHelp ?? null, canBlock: v.canBlock ?? null,
      position: cur?.position ?? Math.max(0, ...pers.map((x) => x.position)) + 1024,
    });
  }

  async function deletePersona(id: string) {
    requireAdmin();
    wrote(await pdb.deletePersona(id));
  }

  async function setModuleFit(segmentId: string, moduleId: string, fit: string | null, priority: number | null) {
    requireAdmin();
    const [segs, mods] = await Promise.all([pdb.listSegments(s.tenantId), adb.listModules(s.tenantId)]);
    if (!segs.some((x) => x.id === segmentId) || !mods.some((x) => x.id === moduleId)) throw new AdminError(404, 'Sector o módulo no encontrado');
    if (priority === null) await pdb.setSegmentModule(s.tenantId, { segmentId, moduleId, remove: true });
    else {
      if (![1, 2, 3].includes(priority)) throw new AdminError(422, 'Prioridad 1, 2 o 3');
      await pdb.setSegmentModule(s.tenantId, { segmentId, moduleId, fit: fit?.trim().slice(0, 1000) || null, priority });
    }
  }

  async function setPersonaAngle(personaId: string, moduleId: string, angle: string | null) {
    requireAdmin();
    const [pers, mods] = await Promise.all([pdb.listPersonas(s.tenantId), adb.listModules(s.tenantId)]);
    if (!pers.some((x) => x.id === personaId) || !mods.some((x) => x.id === moduleId)) throw new AdminError(404, 'Actor o módulo no encontrado');
    const a = angle?.trim();
    if (!a) await pdb.setPersonaModule(s.tenantId, { personaId, moduleId, remove: true });
    else await pdb.setPersonaModule(s.tenantId, { personaId, moduleId, angle: a.slice(0, 1000) });
  }

  // ------------------------------------------------------------ guion del dossier
  async function account(state: Awaited<ReturnType<AdminService['getState']>>) {
    const m = await loadMarket();
    const segment = m.segments.find((x) => x.id === state.dossier.segmentId) ?? null;
    return {
      segment,
      contacts: state.contacts.map((c) => ({ contact: c, persona: m.personas.find((p) => p.id === c.personaId) ?? null })),
      segmentPersonas: segment?.personas ?? [],
    };
  }

  async function talkTrack(dossierId: string): Promise<TalkTrack> {
    const state = await deps.admin.getState(dossierId);
    const [{ plays, contributions }, acc] = await Promise.all([load(), account(state)]);
    return buildTalkTrack(state, plays, contributions, acc);
  }

  /** Contexto + petición para el Cerebro de Ventas (o Claude/ChatGPT) a partir de lo que ya sabe la app. */
  async function contextBrief(input: unknown, opts: { publicOrigin?: string; evidence?: import('./context').ContextData['evidence']; reading?: import('./context').ContextData['reading'] } = {}): Promise<ContextBrief> {
    const v = parse(contextInputSchema, input);
    if (v.messageType === 'objecion' && !v.objection) throw new AdminError(422, 'Elige qué objeción te han puesto');
    const [m, { plays }] = await Promise.all([loadMarket(), load()]);
    const state = v.dossierId ? await deps.admin.getState(v.dossierId) : null;
    const contact = v.contactId ? state?.contacts.find((c) => c.id === v.contactId) ?? null : null;
    if (v.contactId && !contact) throw new AdminError(404, 'Contacto no encontrado en ese dossier');
    const persona = m.personas.find((p) => p.id === (contact?.personaId ?? v.personaId)) ?? null;
    if (v.personaId && !contact && !persona) throw new AdminError(404, 'Actor no encontrado');
    const segment = m.segments.find((x) => x.id === (v.segmentId ?? state?.dossier.segmentId ?? persona?.segmentId)) ?? null;
    if (v.segmentId && !segment) throw new AdminError(404, 'Sector no encontrado');
    const link = state?.dossier.status === 'published' ? state.links.find((l) => l.state === 'active') : undefined;
    const tenant = await adb.getTenant(s.tenantId);
    const pitch = plays.find((p) => official(p) && p.moduleId === null && p.kind === 'pitch');
    return buildContext({
      tenantName: tenant?.name ?? 'nuestra empresa', companyPitch: pitch?.body ?? null,
      messageType: v.messageType, channel: v.channel, objection: v.objection ?? null, notes: v.notes ?? null,
      segment, persona, contact, state, plays,
      publicUrl: link && opts.publicOrigin ? `${opts.publicOrigin}/d/${link.token}` : null,
      evidence: opts.evidence, reading: opts.reading ?? null,
    });
  }

  // ------------------------------------------------------------ líder (admin)
  const snapshot = (p: Pick<Play, 'title' | 'body' | 'kind' | 'stage' | 'objection' | 'whenToUse' | 'whyItWorks' | 'techniqueRefs' | 'moduleId' | 'status' | 'audience'>) => ({
    title: p.title, body: p.body, kind: p.kind, stage: p.stage, objection: p.objection, whenToUse: p.whenToUse,
    whyItWorks: p.whyItWorks, techniqueRefs: p.techniqueRefs, moduleId: p.moduleId, status: p.status, audience: p.audience,
  });

  /** Jugadas oficiales que puede ver este usuario, con su evidencia. */
  async function listAllVisible() {
    return (await load()).plays.filter(official).sort((a, b) => a.position - b.position);
  }

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
      moduleId: p.moduleId, key: p.key ?? null, kind: p.kind, stage: p.stage ?? null, objection: p.objection ?? null, segments: p.segments, personas: p.personas,
      audience: p.audience, title: p.title, body: p.body, whenToUse: p.whenToUse ?? null, whyItWorks: p.whyItWorks ?? null, techniqueRefs: p.techniqueRefs,
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
      moduleId: p.moduleId, key: p.key ?? cur.key, kind: p.kind, stage: p.stage ?? null, objection: p.objection ?? null, segments: p.segments, personas: p.personas,
      audience: p.audience, title: p.title, body: p.body, whenToUse: p.whenToUse ?? null, whyItWorks: p.whyItWorks ?? null, techniqueRefs: p.techniqueRefs,
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
      // Mejoras de jugadas y trucos de colaboradores que esperan aprobación.
      pending: contributions.filter((c) => c.status === 'pending')
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

    if (action === 'accept' && c.type === 'tip') {
      // Truco de un colaborador: aprobarlo lo hace visible para el equipo.
      if (c.status !== 'pending') throw new AdminError(409, 'Solo se aprueban trucos pendientes');
      wrote(await pdb.updateContribution(c.id, { status: 'shared', ...reviewed }));
    } else if (action === 'accept') {
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
      topTips: contributions.filter((c) => c.type === 'tip' && c.status === 'shared').sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 8),
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
    const [{ plays, contributions, latest }, mk] = await Promise.all([load(), loadMarket()]);
    const card = (x: PlayView) => ({
      id: x.id, origen: 'oficial',
      modulo: x.moduleId ? latest.get(x.moduleId)?.moduleName ?? null : null,
      tipo: KIND_LABEL[x.kind], tecnica: x.title, guion: x.body,
      cuando_usarlo: x.whenToUse, por_que_funciona: x.whyItWorks,
      etapa: x.stage ? STAGE_LABEL[x.stage] : null, objecion: x.objection ? OBJECTION_LABEL[x.objection] : null,
      segmentos: x.segments, actores: x.personas, referencias_cerebro: x.techniqueRefs,
      evidencia_equipo: { funciono: x.score.worked, no_funciono: x.score.didnt }, version: x.version, actualizada: x.updatedAt,
    });
    return {
      formato: 'salessuite.playbook/v1',
      tenant: s.tenantId,
      generado: now(),
      mercado: mk.segments.filter((sg) => sg.status === 'official').map((sg) => ({
        clave: sg.key, sector: sg.name, descripcion: sg.description, propuesta_de_valor: sg.valueProp, cliente_ideal: sg.icp,
        descartar_si: sg.disqualifiers, proceso_de_compra: sg.buyingProcess, ticket: sg.dealSize, ciclo: sg.salesCycle,
        modulos: sg.modules.map((m) => ({ modulo: m.moduleName, prioridad: m.priority, por_que_encaja: m.fit })),
        actores: sg.personas.map((p) => ({
          clave: p.key, actor: p.name, papel: p.role, quiere: p.goals, le_duele: p.pains, mide: p.kpis,
          objeciones: p.objections.map((o) => OBJECTION_LABEL[o]), como_abordarle: p.howToApproach, evitar: p.avoid,
          puede_ayudar: p.canHelp, puede_tumbarlo: p.canBlock, angulos: p.angles.map((a) => ({ modulo: a.moduleName, angulo: a.angle })),
        })),
      })),
      jugadas: plays.filter(official).map(card),
      aportes_equipo: contributions.filter((c) => c.type === 'tip' && c.status === 'shared').map((c) => ({
        id: c.id, origen: 'equipo', modulo: c.moduleId ? latest.get(c.moduleId)?.moduleName ?? null : null,
        tipo: KIND_LABEL[c.kind], tecnica: c.title, guion: c.body, autor: c.authorName,
        evidencia_equipo: { funciono: c.score.worked, no_funciono: c.score.didnt }, creado: c.createdAt,
      })),
    };
  }

  return {
    isAdmin, isPartner, learnIndex, topic, modulePreview, pendingCount, markLearned, markSeen,
    market, segmentView, moduleFit, saveSegment, savePersona, deletePersona, setModuleFit, setPersonaAngle, contextBrief, shareTip, proposeChange, withdraw, talkTrack,
    listAll, listAllVisible, createPlay, updatePlay, setPlayStatus, history, inbox, review, metrics, exportCards,
  };
}

export type PlaybookService = ReturnType<typeof createPlaybookService>;
export type { Contribution };
