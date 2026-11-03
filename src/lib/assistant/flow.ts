/**
 * La conversación del asistente de WhatsApp (docs/ASSISTANT.md). Sin estado propio: recibe el mensaje y por dónde iba,
 * hace lo que toca con las operaciones de «Apuntar» de esa persona (sus permisos) y devuelve las respuestas y el estado
 * nuevo. Nada se guarda sin su «Guardar».
 *
 *  · Lo que cuenta (texto o audio) → «Apuntar» lo separa por empresa y la busca por el nombre. Si duda, pregunta cuál
 *    («1) Grupo Salamandra · Valencia  2) …  0) Crear «Salamandra»»). Después, el resumen con Guardar / Cambiar.
 *  · Mensajes reenviados (de un cliente) → se juntan; pregunta de qué empresa son y los apunta como una interacción por
 *    WhatsApp («contestó»).
 */
import type { Channel, Outcome } from '../crm/followup';
import type { NoteItem } from '../crm/notes';
import { assistantMessages, type AssistantText } from './messages';

export interface Candidate { id: string; name: string; zone: string; score: number; discarded: boolean }
export interface AssistantOps {
  /** «Apuntar»: lo separa por empresa con sus candidatas. */
  split(text: string): Promise<Array<NoteItem & { candidates: Candidate[] }>>;
  search(q: string): Promise<Candidate[]>;
  apply(rows: unknown[]): Promise<Array<{ accountId: string | null; name: string; ok: boolean; error?: string }>>;
}
export type Incoming =
  | { kind: 'text'; text: string; forwarded?: boolean }
  | { kind: 'button'; id: string }
  | { kind: 'audio'; text: string | null }
  | { kind: 'other' };
export type Reply = { text: string; buttons?: Array<{ id: string; title: string }> };

interface Choice { accountId: string | null; create: string | null; name: string }
interface Pending { item: NoteItem; candidates: Candidate[]; choice: Choice | null; skip?: boolean }
export type State =
  | { step: 'idle' }
  | { step: 'pick'; at: string; pending: Pending[]; i: number }
  | { step: 'confirm'; at: string; pending: Pending[] }
  | { step: 'forward'; at: string; texts: string[] }
  | { step: 'forward-pick'; at: string; texts: string[]; query: string; candidates: Candidate[] };

/** Lo que queda a medias caduca a la media hora (luego se empieza de nuevo). */
export const STATE_TTL_MS = 30 * 60_000;
const MAX_FORWARDED = 30;
const strong = (c: Candidate[]) => !!c[0] && !c[0].discarded && c[0].score >= 0.9 && (!c[1] || c[1].score < 0.85);
// \b no entiende de tildes («sí»): fin de palabra = lo que sigue no es letra ni número.
const END = '(?![\\p{L}\\p{N}])';
/** Solo respuestas cortas («sí», «no, cambia»): «No me ha dicho nada…» es algo nuevo que apuntar. */
const short = (t: string) => t.trim().split(/\s+/).length <= 3;
const isYes = (t: string) => short(t) && new RegExp(`^(s[ií]|vale|ok|okey|guard(a|ar|alo)|perfecto|dale)${END}`, 'iu').test(t.trim());
const isNo = (t: string) => short(t) && new RegExp(`^(no|cambi(a|ar)|mal)${END}`, 'iu').test(t.trim());
const isCancel = (t: string) => short(t) && new RegExp(`^(cancela(r)?|olv[ií]dalo)${END}`, 'iu').test(t.trim());
const isHelp = (t: string) => /^(ayuda|help|\?|hola|buenas)\W*$/i.test(t.trim());
const numberOf = (t: string) => (/^\s*(\d{1,2})\s*[).]?\s*$/.test(t) ? Number(t.trim().replace(/\D/g, '')) : null);

/** Lo que va a notesApply (lo mismo que confirma la pantalla de Apuntar, sin descartar nada solo). */
function rowOf(p: Pending) {
  const it = p.item;
  return {
    accountId: p.choice?.accountId ?? null, create: p.choice?.create ?? null, interaction: it.interaction, keyFacts: it.keyFacts.slice(0, 5), facts: it.facts.slice(0, 40),
    fit: it.fit, fields: it.fields, channel: it.channel, outcome: it.outcome, day: it.day, qualification: it.qualification, nextStep: it.nextStep,
    nextDays: it.nextDays, discard: null, worksAt: [], people: it.people ?? [], contact: it.contact ?? {},
  };
}
/** Un apunte hecho a mano (mensajes reenviados): solo la interacción. */
function forwardedItem(name: string, texts: string[], today: string): NoteItem {
  return {
    venue: name, interaction: texts.join('\n').slice(0, 4000), keyFacts: [], facts: [], fit: null, fields: {}, channel: 'whatsapp' as Channel, outcome: 'replied' as Outcome,
    day: today, qualification: {}, nextStep: null, nextDays: null, discard: null, discardWhy: null, entity: null, worksAt: [], people: [], contact: {},
  };
}

export interface FlowDeps { ops: AssistantOps; now: Date; locale?: string }
export interface FlowResult { state: State; replies: Reply[] }

export async function handle(d: FlowDeps, msg: Incoming, prev: State): Promise<FlowResult> {
  const T: AssistantText = assistantMessages[(d.locale ?? 'es') as keyof typeof assistantMessages] ?? assistantMessages.es;
  const at = d.now.toISOString();
  const today = at.slice(0, 10);
  const state: State = prev.step !== 'idle' && d.now.getTime() - Date.parse(prev.at) > STATE_TTL_MS ? { step: 'idle' } : prev;
  const idle: State = { step: 'idle' };
  const say = (text: string, buttons?: Reply['buttons']): Reply => ({ text, ...(buttons ? { buttons } : {}) });

  /** El resumen de lo que se va a guardar, con sus botones. */
  const confirm = (pending: Pending[]): FlowResult => {
    const keep = pending.filter((p) => !p.skip && p.choice);
    if (!keep.length) return { state: idle, replies: [say(T.nothingLeft)] };
    const lines = keep.map((p) => T.summary({
      name: p.choice!.name, isNew: !p.choice!.accountId, channel: T.channels[p.item.channel] ?? p.item.channel, outcome: T.outcomes[p.item.outcome] ?? p.item.outcome,
      interaction: p.item.interaction, keyFacts: p.item.keyFacts, nextStep: p.item.nextStep, nextDays: p.item.nextDays,
    }));
    return { state: { step: 'confirm', at, pending }, replies: [say(`${T.willSave}\n\n${lines.join('\n\n')}`, [{ id: 'save', title: T.save }, { id: 'change', title: T.change }])] };
  };
  const askPick = (pending: Pending[], i: number): FlowResult => {
    const p = pending[i];
    const opts = p.candidates.slice(0, 5).map((c, n) => `${n + 1}) ${c.name}${c.zone ? ` · ${c.zone}` : ''}${c.discarded ? ` (${T.discarded})` : ''}`);
    return { state: { step: 'pick', at, pending, i }, replies: [say(T.whichOne(p.item.venue, opts, p.item.venue))] };
  };
  /** Siguiente empresa por decidir, o el resumen si ya están todas. */
  const next = (pending: Pending[]): FlowResult => {
    const i = pending.findIndex((p) => !p.choice && !p.skip);
    return i < 0 ? confirm(pending) : askPick(pending, i);
  };
  const save = async (pending: Pending[]): Promise<FlowResult> => {
    const keep = pending.filter((p) => !p.skip && p.choice);
    const r = await d.ops.apply(keep.map(rowOf));
    const ok = r.filter((x) => x.ok).map((x) => x.name);
    const bad = r.filter((x) => !x.ok).map((x) => `${x.name || '—'}: ${x.error ?? T.failed}`);
    return { state: idle, replies: [say([ok.length ? T.saved(ok) : '', bad.length ? T.notSaved(bad) : ''].filter(Boolean).join('\n\n') || T.nothingLeft)] };
  };
  /** Lo que cuenta, a «Apuntar». */
  const note = async (text: string): Promise<FlowResult> => {
    let items: Awaited<ReturnType<AssistantOps['split']>>;
    try { items = await d.ops.split(text); } catch { return { state: idle, replies: [say(T.aiDown)] }; }
    if (!items.length) return { state: idle, replies: [say(T.nothing)] };
    const pending: Pending[] = items.map((it) => ({
      item: it, candidates: it.candidates, choice: strong(it.candidates) ? { accountId: it.candidates[0].id, create: null, name: it.candidates[0].name } : null,
    }));
    return next(pending);
  };
  /** Los reenviados ya tienen empresa: al resumen. */
  const forwardTo = (texts: string[], choice: Choice) => confirm([{ item: forwardedItem(choice.name, texts, today), candidates: [], choice }]);
  const forwardSearch = async (texts: string[], q: string): Promise<FlowResult> => {
    const c = await d.ops.search(q);
    if (strong(c) || (c[0] && c[0].score >= 0.99)) return forwardTo(texts, { accountId: c[0].id, create: null, name: c[0].name });
    const opts = c.slice(0, 5).map((x, n) => `${n + 1}) ${x.name}${x.zone ? ` · ${x.zone}` : ''}`);
    return { state: { step: 'forward-pick', at, texts, query: q, candidates: c.slice(0, 5) }, replies: [say(opts.length ? T.whichOne(q, opts, q) : T.notFound(q))] };
  };

  // ---- Botones
  if (msg.kind === 'button') {
    if (state.step === 'confirm' && msg.id === 'save') return save(state.pending);
    if (state.step === 'confirm' && msg.id === 'change') return { state: idle, replies: [say(T.changed)] };
    return { state, replies: [say(T.expired)] };
  }
  if (msg.kind === 'other') return { state, replies: [say(T.onlyText)] };
  if (msg.kind === 'audio' && !msg.text) return { state, replies: [say(T.noAudio)] };
  const text = (msg.text ?? '').trim().slice(0, 12000);
  const heard = msg.kind === 'audio' ? [say(T.heard(text))] : [];
  const withHeard = (r: FlowResult): FlowResult => ({ ...r, replies: [...heard, ...r.replies] });
  if (!text) return { state, replies: [say(T.help)] };

  // ---- Reenviados: se juntan y se pregunta una vez de qué empresa son.
  if (msg.kind === 'text' && msg.forwarded) {
    if (state.step === 'forward' || state.step === 'forward-pick') {
      return { state: { ...state, at, texts: [...state.texts, text].slice(-MAX_FORWARDED) }, replies: [] };
    }
    return { state: { step: 'forward', at, texts: [text] }, replies: [say(T.forwardedAsk)] };
  }
  if (isCancel(text)) return { state: idle, replies: [say(T.cancelled)] };
  if (state.step === 'idle' && isHelp(text)) return { state, replies: [say(T.help)] };

  switch (state.step) {
    case 'confirm':
      if (isYes(text)) return save(state.pending);
      if (isNo(text)) return { state: idle, replies: [say(T.changed)] };
      break; // otra cosa: se apunta como algo nuevo (lo anterior se olvida)
    case 'pick': {
      const n = numberOf(text);
      const p = state.pending[state.i];
      const pending = [...state.pending];
      if (n === 0) { pending[state.i] = { ...p, choice: { accountId: null, create: p.item.venue, name: p.item.venue } }; return withHeard(next(pending)); }
      if (n != null && p.candidates[n - 1]) { const c = p.candidates[n - 1]; pending[state.i] = { ...p, choice: { accountId: c.id, create: null, name: c.name } }; return withHeard(next(pending)); }
      if (short(text) && new RegExp(`^(salta(r)?|ninguna|no)${END}`, 'iu').test(text)) { pending[state.i] = { ...p, skip: true }; return withHeard(next(pending)); }
      // Un nombre: se busca otra vez.
      const c = await d.ops.search(text);
      pending[state.i] = { ...p, item: { ...p.item, venue: text.slice(0, 160) }, candidates: c.slice(0, 5), choice: strong(c) ? { accountId: c[0].id, create: null, name: c[0].name } : null };
      return withHeard(next(pending));
    }
    case 'forward':
      return withHeard(await forwardSearch(state.texts, text));
    case 'forward-pick': {
      const n = numberOf(text);
      if (n === 0) return withHeard(forwardTo(state.texts, { accountId: null, create: state.query.slice(0, 160), name: state.query.slice(0, 160) }));
      if (n != null && state.candidates[n - 1]) { const c = state.candidates[n - 1]; return withHeard(forwardTo(state.texts, { accountId: c.id, create: null, name: c.name })); }
      return withHeard(await forwardSearch(state.texts, text));
    }
  }
  return withHeard(await note(text));
}
