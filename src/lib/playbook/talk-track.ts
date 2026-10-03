/**
 * Guion de la reunión a partir del dossier: determinista (no inventa nada), solo ordena y personaliza
 * jugadas oficiales y trucos del equipo según los módulos que el comercial ha puesto, en su orden.
 */
import type { BuilderState } from '../admin/types';
import type { ContributionView, PlayKind, PlayView, Stage, TechniqueRef } from './types';
import { ROLE_LABEL, STANCE_LABEL, type DossierContact, type PersonaView, type Segment } from './market';

export interface TrackLine {
  source: 'official' | 'team';
  id: string;
  kind: PlayKind;
  title: string;
  text: string;
  refs: TechniqueRef[];
  score: { worked: number; didnt: number; mine: 'worked' | 'didnt' | null };
}

export interface TrackFact { label: string; text: string }

export interface TrackSection {
  id: 'cuenta' | 'apertura' | 'descubrimiento' | 'presentacion' | 'precio' | 'objeciones' | 'cierre';
  title: string;
  hint: string;
  /** Subtítulo por bloque (presentación: uno por módulo; cuenta: uno por persona). */
  blocks: Array<{ title: string | null; lines: TrackLine[]; note?: string; facts?: TrackFact[]; tone?: 'ally' | 'risk' | 'neutral'; contactId?: string }>;
}

export interface TrackAccount {
  segment: Segment | null;
  contacts: Array<{ contact: DossierContact; persona: PersonaView | null }>;
  /** Actores del sector (para recordar a quién falta mapear). */
  segmentPersonas: PersonaView[];
}

export interface TalkTrack {
  sections: TrackSection[];
  /** Módulos del dossier sin ninguna jugada: avisar al líder de que faltan. */
  uncovered: string[];
  empty: boolean;
}

const evidence = (s: { worked: number; didnt: number }) => s.worked - s.didnt;
const byEvidenceThenPosition = (a: PlayView, b: PlayView) => evidence(b.score) - evidence(a.score) || a.position - b.position;

export function personalize(text: string, d: { prospectName: string | null; prospectCompany: string | null }): string {
  return text
    .replaceAll('{company}', d.prospectCompany ?? d.prospectName ?? 'vuestra empresa')
    .replaceAll('{prospect}', d.prospectName ?? '');
}

export function buildTalkTrack(state: BuilderState, plays: PlayView[], tips: ContributionView[], account?: TrackAccount): TalkTrack {
  const d = state.dossier;
  const p = (t: string) => personalize(t, d);
  const segKey = account?.segment?.key ?? null;
  const contactPersonas = new Set((account?.contacts ?? []).map((c) => c.persona?.key).filter((k): k is string => !!k));
  // Jugadas de otro sector fuera. Las dirigidas a un actor: si la cuenta ya tiene contactos mapeados,
  // solo las de actores presentes; si no hay mapa todavía, todas (no sabemos con quién hablará).
  const mapped = contactPersonas.size > 0;
  const official = plays.filter((x) => x.status === 'official'
    && (!segKey || !x.segments.length || x.segments.includes(segKey))
    && (!mapped || !x.personas.length || x.personas.some((k) => contactPersonas.has(k))));
  const line = (x: PlayView): TrackLine => ({ source: 'official', id: x.id, kind: x.kind, title: p(x.title), text: p(x.body), refs: x.techniqueRefs, score: x.score });
  const tipLine = (x: ContributionView): TrackLine => ({ source: 'team', id: x.id, kind: x.kind, title: p(x.title), text: p(x.body), refs: [], score: x.score });


  const general = (kinds: PlayKind[], stages?: Stage[]) => official
    .filter((x) => x.moduleId === null && kinds.includes(x.kind) && (!stages || (x.stage && stages.includes(x.stage))))
    .sort((a, b) => a.position - b.position);
  const ofModules = (kinds: PlayKind[]) => official.filter((x) => x.moduleId && moduleIds.has(x.moduleId) && kinds.includes(x.kind));
  const sharedTips = tips.filter((t) => t.status === 'shared' || t.status === 'accepted');

  // Módulos visibles del dossier, en orden y sin repetir (dos instancias del mismo módulo = un bloque).
  const seen = new Set<string>();
  const modules = state.items.filter((i) => i.visible && !seen.has(i.moduleId) && seen.add(i.moduleId))
    .map((i) => ({ id: i.moduleId, name: i.moduleName }));
  const moduleIds = new Set(modules.map((m) => m.id));

  const sections: TrackSection[] = [];

  if (account && (account.contacts.length || account.segment)) {
    const blocks: TrackSection['blocks'] = account.contacts.map(({ contact, persona }) => {
      const facts: TrackFact[] = [];
      if (persona) {
        facts.push({ label: 'Papel', text: ROLE_LABEL[persona.role] });
        if (persona.goals) facts.push({ label: 'Quiere', text: persona.goals });
        if (persona.pains) facts.push({ label: 'Le duele', text: persona.pains });
        if (persona.howToApproach) facts.push({ label: 'Cómo abordarle', text: persona.howToApproach });
        if (contact.stance === 'bloqueador' && persona.canBlock) facts.push({ label: 'Riesgo', text: persona.canBlock });
        if (contact.stance !== 'bloqueador' && persona.canHelp) facts.push({ label: 'Cómo te puede ayudar', text: persona.canHelp });
        if (persona.avoid) facts.push({ label: 'Evita', text: persona.avoid });
        const angles = persona.angles.filter((a) => moduleIds.has(a.moduleId));
        for (const a of angles) facts.push({ label: a.moduleName, text: a.angle });
      }
      if (contact.notes) facts.push({ label: 'Notas', text: contact.notes });
      return {
        title: `${contact.name}${persona ? ` · ${persona.name}` : ''} · ${STANCE_LABEL[contact.stance]}`,
        contactId: contact.id,
        tone: contact.stance === 'aliado' ? 'ally' as const : contact.stance === 'bloqueador' ? 'risk' as const : 'neutral' as const,
        facts,
        lines: persona ? official.filter((x) => x.personas.includes(persona.key)).sort(byEvidenceThenPosition).map(line) : [],
      };
    });
    const mapped = new Set(account.contacts.map((c) => c.persona?.id));
    const missing = account.segmentPersonas.filter((x) => (x.role === 'decisor' || x.role === 'guardian' || x.role === 'pagador') && !mapped.has(x.id));
    const note = !account.contacts.length
      ? 'Aún no has mapeado a nadie de la cuenta. Añade contactos en «Cuenta y actores» para preparar cada conversación.'
      : missing.length ? `Sin mapear todavía: ${missing.map((x) => `${x.name} (${ROLE_LABEL[x.role].toLowerCase()})`).join(', ')}.` : undefined;
    if (note) blocks.push({ title: null, lines: [], note });
    sections.push({ id: 'cuenta', title: 'Con quién hablas', hint: account.segment ? `Cuenta de ${account.segment.name}: quién decide, quién paga, quién puede tumbarlo.` : 'Quién decide, quién paga, quién puede tumbarlo.', blocks });
  }

  sections.push({
    id: 'apertura', title: 'Apertura', hint: 'Primeros minutos: su objetivo antes que tu producto.',
    blocks: [{ title: null, lines: [...general(['script'], ['primer_contacto', 'prospeccion']), ...general(['pitch'])].map(line) }],
  });

  sections.push({
    id: 'descubrimiento', title: 'Descubrimiento', hint: 'Pregunta y escucha: cada respuesta te dice qué módulo enseñar.',
    blocks: [{
      title: null,
      lines: [...general(['discovery']), ...ofModules(['discovery']).sort(byEvidenceThenPosition)].map(line),
    }],
  });

  const uncovered: string[] = [];
  sections.push({
    id: 'presentacion', title: 'Presentación', hint: 'En el orden del dossier.',
    blocks: modules.map((m, i) => {
      const mine = official.filter((x) => x.moduleId === m.id);
      const pick = (k: PlayKind, n: number) => mine.filter((x) => x.kind === k).sort(byEvidenceThenPosition).slice(0, n);
      const bestTip = sharedTips.filter((t) => t.moduleId === m.id).sort((a, b) => evidence(b.score) - evidence(a.score))[0];
      const lines = [...pick('pitch', 1), ...pick('fit', 1), ...pick('proof', 1), ...pick('tip', 1)].map(line);
      if (bestTip) lines.push(tipLine(bestTip));
      if (!mine.length) uncovered.push(m.name);
      return { title: `${i + 1}. ${m.name}`, lines, note: mine.length ? undefined : 'Este módulo aún no tiene jugadas: pídeselas a tu líder o comparte las tuyas.' };
    }),
  });

  const priceNote = d.priceMode === 'none'
    ? 'Este dossier no muestra precio: llévalo preparado por si te lo piden.'
    : state.total ? `Precio del dossier: ${state.total.formatted}${d.priceMode === 'per_module' ? ' (suma de módulos)' : ''}, sin IVA.` : undefined;
  sections.push({
    id: 'precio', title: 'Precio', hint: 'Después del valor, nunca antes.',
    blocks: [{
      title: null, note: priceNote,
      lines: [...ofModules(['monetization']).sort(byEvidenceThenPosition), ...general(['monetization']), ...general(['tip'], ['negociacion'])].map(line),
    }],
  });

  sections.push({
    id: 'objeciones', title: 'Objeciones probables', hint: 'Ordenadas por lo que mejor le ha funcionado al equipo.',
    blocks: [{
      title: null,
      lines: [
        ...[...ofModules(['objection']), ...general(['objection'])].sort(byEvidenceThenPosition).map(line),
        ...sharedTips.filter((t) => t.kind === 'objection' && (t.moduleId === null || moduleIds.has(t.moduleId))).map(tipLine),
      ],
    }],
  });

  sections.push({
    id: 'cierre', title: 'Cierre', hint: 'Una fecha concreta, no "hablamos".',
    blocks: [{ title: null, lines: general(['script', 'tip'], ['cierre', 'seguimiento']).map(line) }],
  });

  const empty = sections.every((s) => s.blocks.every((b) => b.lines.length === 0));
  return { sections, uncovered, empty };
}
