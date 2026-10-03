/**
 * Contexto comercial listo para el Cerebro de Ventas (o cualquier asistente: Claude, ChatGPT).
 * Determinista: solo junta lo que ya sabe la app (empresa, sector, actor, cuenta, propuesta, playbook);
 * la técnica y la redacción las pone el Cerebro, con su atribución.
 */
import type { BuilderState } from '../admin/types';
import { STAGE_LABEL, OBJECTION_LABEL, type Objection, type PlayView } from './types';
import { ROLE_HINT, ROLE_LABEL, STANCE_LABEL, type DossierContact, type PersonaView, type Segment } from './market';
import { CHANNELS, MESSAGE_TYPES, type MessageType } from './schema';
import { stripMarkdown } from './markdown';
import { personalize } from './talk-track';

export interface ContextBrief {
  title: string;
  /** Contexto en texto plano, para pegar donde sea. */
  brief: string;
  /** Petición completa (instrucciones + contexto) para Claude/ChatGPT con el Cerebro conectado. */
  prompt: string;
  /** Parámetros equivalentes para buscar_tecnica del Cerebro de Ventas. */
  cerebro: { situacion: string; etapa: string; objecion: string | null };
  plays: Array<{ id: string; title: string }>;
}

export interface ContextData {
  tenantName: string;
  companyPitch: string | null;
  messageType: MessageType;
  channel: keyof typeof CHANNELS;
  objection: Objection | null;
  notes: string | null;
  segment: Segment | null;
  persona: PersonaView | null;
  contact: DossierContact | null;
  state: BuilderState | null;
  publicUrl: string | null;
  plays: PlayView[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const line = (label: string, v: string | null | undefined) => (v && v.trim() ? `- ${label}: ${v.trim().replace(/\n+/g, ' · ')}` : null);

/** Jugadas aplicables: primero las dirigidas a ese actor, luego las de la etapa/objeción del mensaje. */
export function pickPlays(plays: PlayView[], d: Pick<ContextData, 'segment' | 'persona' | 'messageType' | 'objection'>, max = 5): PlayView[] {
  const etapa = MESSAGE_TYPES[d.messageType].etapa;
  const stageKey = (Object.entries(STAGE_LABEL).find(([, v]) => v === etapa)?.[0]) ?? null;
  const segOk = (p: PlayView) => !p.segments.length || (d.segment && p.segments.includes(d.segment.key));
  const persOk = (p: PlayView) => !p.personas.length || (d.persona && p.personas.includes(d.persona.key));
  const pool = plays.filter((p) => p.status === 'official' && segOk(p) && persOk(p));
  const score = (p: PlayView) =>
    (d.persona && p.personas.includes(d.persona.key) ? 100 : 0)
    + (d.objection && p.objection === d.objection ? 60 : 0)
    + (stageKey && p.stage === stageKey ? 40 : 0)
    + (d.segment && p.segments.includes(d.segment.key) ? 10 : 0)
    + (p.score.worked - p.score.didnt);
  return pool.filter((p) => score(p) >= 10).sort((a, b) => score(b) - score(a)).slice(0, max);
}

export function buildContext(d: ContextData): ContextBrief {
  const mt = MESSAGE_TYPES[d.messageType];
  const st = d.state;
  const dossier = st?.dossier ?? null;
  const p = (t: string) => (dossier ? personalize(t, dossier) : t);
  const who = d.contact?.name ?? d.persona?.name ?? (dossier?.prospectName || dossier?.prospectCompany) ?? 'el cliente';
  const parts: Array<string | null> = [];

  parts.push(`CONTEXTO COMERCIAL · ${d.tenantName}`);
  if (d.companyPitch) parts.push(`Qué vendemos: ${stripMarkdown(d.companyPitch).replace(/\n+/g, ' ')}`);

  if (d.segment) {
    parts.push('', `SECTOR: ${d.segment.name}`);
    parts.push(line('Qué es', d.segment.description), line('Por qué nosotros', d.segment.valueProp),
      line('Cliente ideal', d.segment.icp), line('Proceso de compra', d.segment.buyingProcess),
      line('Ticket típico', d.segment.dealSize), line('Ciclo de venta', d.segment.salesCycle));
  }

  parts.push('', `DESTINATARIO: ${who}${d.persona && d.contact ? ` (${d.persona.name})` : ''}`);
  if (d.persona) {
    parts.push(line('Papel en la decisión', `${ROLE_LABEL[d.persona.role]}: ${ROLE_HINT[d.persona.role]}`));
    if (d.contact) parts.push(line('Postura actual', STANCE_LABEL[d.contact.stance].replace(/^\S+\s/, '')));
    parts.push(line('Qué quiere conseguir', d.persona.goals), line('Qué le duele', d.persona.pains), line('Qué mide', d.persona.kpis),
      line('Cómo abordarle', d.persona.howToApproach), line('Qué evitar', d.persona.avoid),
      line('Objeciones típicas', d.persona.objections.map((o) => OBJECTION_LABEL[o]).join(', ')),
      line('Cómo puede ayudarnos', d.persona.canHelp), line('Cómo puede tumbarlo', d.persona.canBlock));
    const moduleIds = st ? new Set(st.items.filter((i) => i.visible).map((i) => i.moduleId)) : null;
    const angles = d.persona.angles.filter((a) => !moduleIds || moduleIds.has(a.moduleId));
    if (angles.length) parts.push('- Qué le aporta cada módulo:', ...angles.map((a) => `  · ${a.moduleName}: ${a.angle}`));
  } else if (d.contact) {
    parts.push(line('Postura actual', STANCE_LABEL[d.contact.stance].replace(/^\S+\s/, '')));
  }
  if (d.contact?.notes) parts.push(line('Notas sobre esta persona', d.contact.notes));

  if (st && dossier) {
    const mods = [...new Set(st.items.filter((i) => i.visible).map((i) => i.moduleName))];
    parts.push('', `PROPUESTA: «${dossier.title}»${dossier.prospectCompany ? ` para ${dossier.prospectCompany}` : ''}`);
    parts.push(line('Módulos incluidos', mods.join(', ')),
      line('Precio', st.total ? `${st.total.formatted}${dossier.priceMode === 'per_module' ? ' (suma de módulos)' : ''}, sin IVA` : dossier.priceMode === 'none' ? 'no se muestra en el dossier' : null),
      line('Enlace a la propuesta', d.publicUrl), line('Próximo paso acordado', dossier.nextStep));
    const others = st.contacts.filter((c) => c.id !== d.contact?.id);
    if (others.length) parts.push(line('Otras personas en la cuenta', others.map((c) => `${c.name} (${STANCE_LABEL[c.stance].replace(/^\S+\s/, '').toLowerCase()})`).join(', ')));
  }
  if (d.notes) parts.push('', `LO QUE SÉ DE ESTE CASO: ${d.notes}`);

  const picked = pickPlays(d.plays, d);
  if (picked.length) {
    parts.push('', 'PLAYBOOK DE LA EMPRESA (lo que nos funciona):');
    for (const pl of picked) {
      parts.push(`- ${p(pl.title)}: ${clip(stripMarkdown(p(pl.body)).replace(/\n+/g, ' '), 320)}`);
      for (const r of pl.techniqueRefs) parts.push(`  · Técnica relacionada del Cerebro: [${r.id}] ${r.title}${r.creator ? ` (${r.creator})` : ''}`);
    }
  }

  const brief = parts.filter((x) => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  const objecion = d.messageType === 'objecion' && d.objection ? OBJECTION_LABEL[d.objection] : null;
  const roleBit = d.persona ? `${d.persona.name}${d.segment ? ` (${d.segment.name})` : ''}` : who;
  const situacion = `${mt.ask} a ${roleBit}${objecion ? `, que pone la objeción «${objecion}»` : ''}`;

  const prompt = [
    `Quiero preparar ${mt.ask} para ${who}${d.persona && !d.contact ? '' : d.persona ? `, ${d.persona.name}` : ''} por ${CHANNELS[d.channel]}.`,
    `Usa el Cerebro de Ventas: busca la técnica con buscar_tecnica (situación: «${situacion}», etapa: «${mt.etapa}»${objecion ? `, objeción: «${objecion}»` : ''}).`,
    'Dime qué ficha y qué creador usas, respeta su guion si lo tiene y sigue sus reglas de redacción. Si el Cerebro no cubre el caso, dilo antes de proponer nada tuyo.',
    'No inventes datos: usa solo lo que hay en este contexto y deja entre corchetes lo que tenga que completar yo.',
    '',
    brief,
  ].join('\n');

  return {
    title: `${mt.label} · ${who}`,
    brief,
    prompt,
    cerebro: { situacion, etapa: mt.etapa, objecion },
    plays: picked.map((x) => ({ id: x.id, title: x.title })),
  };
}
