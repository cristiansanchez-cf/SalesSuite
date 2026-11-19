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
import type { Place } from './places';

export interface Candidate { id: string; name: string; zone: string; score: number; discarded: boolean }
export interface AssistantOps {
  /** «Apuntar»: lo separa por empresa con sus candidatas. */
  split(text: string): Promise<Array<NoteItem & { candidates: Candidate[] }>>;
  search(q: string): Promise<Candidate[]>;
  apply(rows: unknown[]): Promise<Array<{ accountId: string | null; name: string; ok: boolean; error?: string; agreement?: 'active' | 'pending' }>>;
  /** Recordatorios: la propuesta de mensaje para una empresa (draft.ts). */
  draft?(item: ReminderItem): Promise<string>;
  /** Dónde está una empresa nueva: un sitio conocido nombrado en el texto (places.ts). */
  placeIn?(text: string): Promise<Place | null>;
  /** Lo que escribe cuando se le pregunta la ciudad: sus zonas, el catálogo de España y Google. */
  places?(q: string): Promise<Place[]>;
  /** «Hecho»: apunta que le escribió (y el CRM propone el siguiente paso). Devuelve cuándo toca lo siguiente. */
  done?(accountId: string): Promise<{ name: string; nextAt: string | null }>;
  /** «Mañana»: el próximo paso, a mañana. */
  later?(accountId: string): Promise<{ name: string }>;
}
/** Una empresa del recordatorio de la mañana (lo de «Hoy»), con lo justo para proponer el mensaje. */
export interface ReminderItem {
  accountId: string; name: string; bucket: 'cooling' | 'overdue' | 'today'; cooling: number | null; contactName: string | null; step: string | null;
  channel: string | null; last: { outcome: string; note: string | null; at: string } | null; facts: string[];
}
export type Incoming =
  | { kind: 'text'; text: string; forwarded?: boolean }
  | { kind: 'button'; id: string }
  | { kind: 'audio'; text: string | null }
  /** Captura de una conversación (screenshot.ts): sus líneas («Nosotros: …»), el nombre de arriba y el pie de foto. */
  | { kind: 'image'; lines: string[] | null; contact: string; caption: string; channel: string; ready: boolean }
  | { kind: 'other' };
export type Reply = { text: string; buttons?: Array<{ id: string; title: string }> };

interface Choice { accountId: string | null; create: string | null; name: string }
interface Pending { item: NoteItem; candidates: Candidate[]; choice: Choice | null; skip?: boolean;
  /** Empresa nueva: dónde está (o «no sé»). */
  place?: Place | null; noPlace?: boolean }
export type State =
  | { step: 'idle' }
  | { step: 'pick'; at: string; pending: Pending[]; i: number; source?: string }
  /** source: lo que contó (para corregir sin perderlo); forward: los reenviados o la captura (para elegir otra empresa). */
  | { step: 'confirm'; at: string; pending: Pending[]; source?: string; forward?: { texts: string[]; channel?: string } }
  /** «Cambiar»: espera la corrección, que se aplica sobre lo que ya contó. */
  | { step: 'amend'; at: string; source: string; pending: Pending[] }
  /** Empresa nueva sin ciudad: se pregunta dónde está. */
  | { step: 'place'; at: string; pending: Pending[]; i: number; options: Place[]; source?: string; forward?: { texts: string[]; channel?: string } }
  /** intro: lo que contó antes de pasar los mensajes («he hablado con X, ahora te paso…»): se junta con ellos. */
  | { step: 'forward'; at: string; texts: string[]; channel?: string; intro?: string }
  /** Ha contado algo y va a pasar la conversación (o la pegó a medias): se espera y se junta. */
  | { step: 'context'; at: string; intro: string }
  | { step: 'forward-pick'; at: string; texts: string[]; query: string; candidates: Candidate[]; channel?: string }
  | { step: 'reminder'; at: string; items: ReminderItem[] };

/** Lo que queda a medias caduca a la media hora (luego se empieza de nuevo). */
export const STATE_TTL_MS = 30 * 60_000;
const MAX_FORWARDED = 30;
/** El recordatorio de la mañana espera su respuesta todo el día. */
export const REMINDER_TTL_MS = 14 * 3_600_000;
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
    nextDays: it.nextDays, nextTime: it.nextTime ?? null, agreement: it.agreement ?? null, discard: null, worksAt: [], people: it.people ?? [], contact: it.contact ?? {},
    // Dónde está la empresa nueva (lo convierte en zona opsFor.apply, como el buscador de ciudades del CRM).
    ...(p.choice?.create && p.place ? { place: p.place.v } : {}),
  };
}
/** Conversaciones pegadas tal cual («[19/11/26, 10:21:09] Cristian: …», el formato de WhatsApp al copiar): sus líneas. */
const CHAT_LINE = /^\s*\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*[^:\n]{1,60}:\s?\S/;
export function pastedChat(text: string): string[] {
  const out: string[] = [];
  let open = false;
  for (const line of text.split('\n')) {
    if (CHAT_LINE.test(line)) { out.push(line.trim()); open = true; } else if (open && line.trim()) out[out.length - 1] += `\n${line.trim()}`; else open = false;
  }
  return out;
}
/**
 * Muy poco que apuntar (criterio de Cristian): «he estado hablando con Juan de Havana» sin decir de qué. Antes de
 * guardar, se pregunta qué le ha dicho y se junta la respuesta. Devuelve con quién (para la pregunta) o null.
 */
const TALKED = /^(?:oye,?\s*|mira,?\s*|pues,?\s*)?(?:hoy\s+|ayer\s+|esta mañana\s+|esta tarde\s+)?(?:he\s+(?:estado\s+)?habla(?:do|ndo)|estuve\s+hablando|acabo\s+de\s+hablar|hablé|he\s+llamado\s+a|he\s+estado\s+con|i\s+(?:talked|spoke|have been talking)|falei|estive\s+a\s+falar)\s+(?:con|with|com)\s+([^,.;:!?\n]{2,60}?)\s*[.!¡]*$/iu;
const SUBSTANCE = /\b(que|dijo|dice|me ha|nos ha|quiere|quieren|interes|precio|semana|mañana|jueves|viernes|lunes|martes|miércoles|sábado|domingo|cita|reunión|propuesta|said|wants|disse|quer)\b|[:;]/iu;
export function tooThin(t: string): string | null {
  const x = t.trim();
  if (x.split(/\s+/).length > 14 || SUBSTANCE.test(x.replace(/^(?:oye|mira|pues),?\s*/iu, ''))) return null;
  const m = TALKED.exec(x);
  return m ? m[1]!.trim() : null;
}
/** «He hablado con X… ahora te paso los mensajes»: lo que viene después va con esto. */
const ANNOUNCE = /(te (paso|mando|env[ií]o|pego|reenv[ií]o|adjunto)|ahora te|luego te|a continuaci[oó]n|i.?ll (send|forward|paste)|here (are|is)|vou (te )?(mandar|enviar|passar|colar)|já te (mando|passo))/iu;
const CHAT_NOUN = /(mensaje|conversaci|chat|captura|pantallazo|whats|messages?|conversation|screenshots?|mensage|conversa)/iu;
// Solo un aviso corto, y al final («…ahora te paso los mensajes»): en un audio largo, «te paso» es parte de lo que cuenta.
export const announcesChat = (t: string) => {
  if (t.length > 300 || pastedChat(t).length) return false;
  const tail = t.slice(-160);
  return ANNOUNCE.test(tail) && CHAT_NOUN.test(tail);
};
/**
 * Pegó a medias: WhatsApp solo deja pegar todos los mensajes copiados si la caja está vacía; si antes escribió «he
 * hablado con X…», solo entra uno. Una sola línea de chat con texto propio delante → lo que contó, sin esa línea.
 */
export function halfPasted(t: string): string | null {
  // El mensaje pegado suele quedar en la misma línea que lo escrito («…mira lo que le he puesto: [23/9/26, 14:04] Yo: …»).
  const hits = [...t.matchAll(/\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]\s*[^:\n\]]{1,60}:/g)];
  if (hits.length !== 1) return null;
  const intro = t.slice(0, hits[0]!.index).trim();
  return intro.split(/\s+/).filter(Boolean).length >= 3 ? intro : null;
}
const normName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Un apunte hecho a mano (mensajes reenviados): solo la interacción. */
function forwardedItem(name: string, texts: string[], today: string, channel = 'whatsapp'): NoteItem {
  return {
    venue: name, interaction: texts.join('\n').slice(0, 4000), keyFacts: [], facts: [], fit: null, fields: {}, channel: (['instagram', 'email'].includes(channel) ? channel : 'whatsapp') as Channel, outcome: 'replied' as Outcome,
    day: today, qualification: {}, nextStep: null, nextDays: null, discard: null, discardWhy: null, entity: null, worksAt: [], people: [], contact: {},
  };
}

export interface FlowDeps { ops: AssistantOps; now: Date; locale?: string }
export interface FlowResult { state: State; replies: Reply[] }

export async function handle(d: FlowDeps, msg: Incoming, prev: State): Promise<FlowResult> {
  const T: AssistantText = assistantMessages[(d.locale ?? 'es') as keyof typeof assistantMessages] ?? assistantMessages.es;
  const at = d.now.toISOString();
  const today = at.slice(0, 10);
  const ttl = prev.step === 'reminder' ? REMINDER_TTL_MS : STATE_TTL_MS;
  const state: State = prev.step !== 'idle' && d.now.getTime() - Date.parse(prev.at) > ttl ? { step: 'idle' } : prev;
  const idle: State = { step: 'idle' };
  const say = (text: string, buttons?: Reply['buttons']): Reply => ({ text, ...(buttons ? { buttons } : {}) });

  /** El resumen de lo que se va a guardar, con sus botones. */
  const confirm = (pending: Pending[], from: { source?: string; forward?: { texts: string[]; channel?: string } } = {}): FlowResult => {
    const keep = pending.filter((p) => !p.skip && p.choice);
    if (!keep.length) return { state: idle, replies: [say(T.nothingLeft)] };
    const lines = keep.map((p) => T.summary({
      name: p.choice!.name, isNew: !p.choice!.accountId, channel: T.channels[p.item.channel] ?? p.item.channel, outcome: T.outcomes[p.item.outcome] ?? p.item.outcome,
      interaction: p.item.interaction, keyFacts: p.item.keyFacts, nextStep: p.item.nextStep, nextDays: p.item.nextDays, nextTime: p.item.nextTime ?? null, agreement: p.item.agreement ?? null,
    }) + (!p.choice!.accountId && p.place ? `\n📍 ${p.place.label}` : ''));
    return { state: { step: 'confirm', at, pending, ...from }, replies: [say(`${T.willSave}\n\n${lines.join('\n\n')}`, [{ id: 'save', title: T.save }, { id: 'change', title: T.change }])] };
  };
  /** Empresa nueva sin ciudad: se pregunta (si se puede buscar). */
  type From = { source?: string; forward?: { texts: string[]; channel?: string } };
  const askPlace = (pending: Pending[], i: number, from: From = {}, options: Place[] = []): FlowResult => ({
    state: { step: 'place', at, pending, i, options, ...from },
    replies: [say(options.length ? T.whichPlace(pending[i]!.choice!.name, options.map((o, n) => `${n + 1}) ${o.label}`)) : T.askPlace(pending[i]!.choice!.name))],
  });
  const askPick = (pending: Pending[], i: number): FlowResult => {
    const p = pending[i];
    const opts = p.candidates.slice(0, 5).map((c, n) => `${n + 1}) ${c.name}${c.zone ? ` · ${c.zone}` : ''}${c.discarded ? ` (${T.discarded})` : ''}`);
    return { state: { step: 'pick', at, pending, i }, replies: [say(T.whichOne(p.item.venue, opts, p.item.venue))] };
  };
  /** Siguiente empresa por decidir, luego la ciudad de las nuevas, y el resumen si ya está todo. */
  const next = (pending: Pending[], from: From = {}): FlowResult => {
    const i = pending.findIndex((p) => !p.choice && !p.skip);
    if (i >= 0) { const r = askPick(pending, i); return { ...r, state: { ...(r.state as Extract<State, { step: 'pick' }>), source: from.source } }; }
    const j = d.ops.places ? pending.findIndex((p) => !p.skip && p.choice && !p.choice.accountId && !p.place && !p.noPlace) : -1;
    return j >= 0 ? askPlace(pending, j, from) : confirm(pending, from);
  };
  const save = async (pending: Pending[]): Promise<FlowResult> => {
    const keep = pending.filter((p) => !p.skip && p.choice);
    const r = await d.ops.apply(keep.map(rowOf));
    const ok = r.filter((x) => x.ok).map((x) => x.name);
    const bad = r.filter((x) => !x.ok).map((x) => `${x.name || '—'}: ${x.error ?? T.failed}`);
    // Cerradas con acuerdo: ya en Clientes, o pendientes de que un gerente lo confirme.
    const deals = r.filter((x) => x.ok && x.agreement).map((x) => (x.agreement === 'active' ? T.dealClosed(x.name) : T.dealPending(x.name)));
    return { state: idle, replies: [say([ok.length ? T.saved(ok) : '', ...deals, bad.length ? T.notSaved(bad) : ''].filter(Boolean).join('\n\n') || T.nothingLeft)] };
  };
  /** Lo que cuenta, a «Apuntar». */
  const note = async (text: string, prev: Pending[] = [], literal?: string[]): Promise<FlowResult> => {
    let items: Awaited<ReturnType<AssistantOps['split']>>;
    try { items = await d.ops.split(text); } catch { return { state: idle, replies: [say(T.aiDown)] }; }
    if (!items.length) return { state: idle, replies: [say(T.nothing)] };
    // La conversación pegada tal cual va literal en la interacción (para ver después cómo le hablamos y qué funciona).
    const chat = literal ?? pastedChat(text);
    if (chat.length && items.length === 1) {
      const it = items[0]!;
      items = [{ ...it, interaction: [it.interaction, `${T.convo}:\n${chat.join('\n')}`].filter(Boolean).join('\n\n').slice(0, 4000) }];
    }
    const pending: Pending[] = [];
    for (const it of items) {
      // Al corregir: lo que ya había elegido para esa empresa (la misma u otra con el mismo nombre) se mantiene.
      const was = prev.find((p) => p.choice && (normName(p.item.venue) === normName(it.venue) || normName(p.choice.name) === normName(it.venue)));
      const choice = was?.choice ?? (strong(it.candidates) ? { accountId: it.candidates[0].id, create: null, name: it.candidates[0].name } : null);
      // Dónde está (por si es nueva): lo que diga de ella; si solo hay una, todo lo que contó.
      const about = [it.venue, it.interaction, ...it.keyFacts, ...it.facts, items.length === 1 ? text : ''].filter(Boolean).join(' \n ');
      const place = was?.place ?? (d.ops.placeIn ? await d.ops.placeIn(about).catch(() => null) : null);
      pending.push({ item: it, candidates: it.candidates, choice, place, noPlace: was?.noPlace });
    }
    return next(pending, { source: text });
  };
  /** Los reenviados ya tienen empresa: al resumen. */
  const forwardTo = (texts: string[], choice: Choice, channel?: string): FlowResult => {
    const p: Pending = { item: forwardedItem(choice.name, texts, today, channel), candidates: [], choice };
    if (!choice.accountId && d.ops.places) return askPlace([p], 0, { forward: { texts, channel } });
    return confirm([p], { forward: { texts, channel } });
  };
  const forwardSearch = async (texts: string[], q: string, channel?: string): Promise<FlowResult> => {
    const c = await d.ops.search(q);
    if (strong(c) || (c[0] && c[0].score >= 0.99)) return forwardTo(texts, { accountId: c[0].id, create: null, name: c[0].name }, channel);
    const opts = c.slice(0, 5).map((x, n) => `${n + 1}) ${x.name}${x.zone ? ` · ${x.zone}` : ''}`);
    return { state: { step: 'forward-pick', at, texts, query: q, candidates: c.slice(0, 5), channel }, replies: [say(opts.length ? T.whichOne(q, opts, q) : T.notFound(q))] };
  };

  /** Una propuesta de mensaje por empresa, cada una con «Hecho» y «Mañana». */
  const prepare = async (items: ReminderItem[]): Promise<FlowResult> => {
    const replies: Reply[] = [];
    for (const it of items) {
      let draft: string | null = null;
      try { draft = d.ops.draft ? await d.ops.draft(it) : null; } catch { draft = null; }
      replies.push(say(T.proposal({ name: it.name, contact: it.contactName, why: T.why(it), step: it.step, draft }),
        [{ id: `done:${it.accountId}`, title: T.done }, { id: `later:${it.accountId}`, title: T.tomorrow }]));
    }
    return { state: idle, replies };
  };
  // ---- Botones de los recordatorios (llevan la empresa: valen aunque haya pasado el rato).
  if (msg.kind === 'button' && /^(done|later):[0-9a-f-]{36}$/i.test(msg.id)) {
    const [what, id] = msg.id.split(':');
    try {
      if (what === 'done' && d.ops.done) { const r = await d.ops.done(id); return { state, replies: [say(T.doneOk(r.name, r.nextAt))] }; }
      if (what === 'later' && d.ops.later) { const r = await d.ops.later(id); return { state, replies: [say(T.laterOk(r.name))] }; }
    } catch { return { state, replies: [say(T.failedOne)] }; }
  }
  // La respuesta al recordatorio de la mañana (su botón de la plantilla o un «sí» / «más tarde»).
  if (state.step === 'reminder' && (msg.kind === 'button' || msg.kind === 'text')) {
    const said = (msg.kind === 'button' ? msg.id : msg.text).trim();
    // Solo respuestas cortas: «Sí, hoy he hablado con Club Sol…» es algo nuevo que apuntar.
    if (msg.kind === 'button' || short(said)) {
      if (new RegExp(`^(s[ií]|prep[aá]ra(los|me)?|vale|ok|dale|venga|claro|yes|sure|sim|oui|네|좋아)${END}`, 'iu').test(said)) return prepare(state.items);
      if (new RegExp(`^(m[aá]s tarde|luego|ahora no|later|not now|plus tard|mais tarde|depois|no|não|nao|나중에)${END}`, 'iu').test(said)) return { state: idle, replies: [say(T.remindLater)] };
    }
  }
  /** «Cambiar»: se corrige sobre lo que ya contó (o se elige otra empresa para los reenviados), no se tira. */
  const change = (st: Extract<State, { step: 'confirm' }>): FlowResult => {
    if (st.source) return { state: { step: 'amend', at, source: st.source, pending: st.pending }, replies: [say(T.askChange)] };
    if (st.forward) return { state: { step: 'forward', at, texts: st.forward.texts, channel: st.forward.channel }, replies: [say(T.askOtherCompany)] };
    return { state: idle, replies: [say(T.changed)] };
  };
  // ---- Botones
  if (msg.kind === 'button') {
    if (state.step === 'confirm' && msg.id === 'save') return save(state.pending);
    if (state.step === 'confirm' && msg.id === 'change') return change(state);
    return { state, replies: [say(T.expired)] };
  }
  if (msg.kind === 'other') return { state, replies: [say(T.onlyText)] };
  // ---- Captura de una conversación: como los reenviados, con la conversación literal (quién dijo qué).
  if (msg.kind === 'image') {
    if (!msg.ready) return { state, replies: [say(T.noShots)] };
    if (!msg.lines?.length) return { state, replies: [say(T.notAChat)] };
    // Otra captura de la misma conversación: se junta (sin contestar, como los reenviados).
    if (state.step === 'forward' || state.step === 'forward-pick') {
      return { state: { ...state, at, texts: [...state.texts, ...msg.lines].slice(-MAX_FORWARDED * 3) }, replies: [] };
    }
    const read = say(T.shotRead(msg.lines.length, msg.contact));
    // Ya contó de quién es: se junta con eso.
    if (state.step === 'context') return { state: { step: 'forward', at, texts: msg.lines, channel: msg.channel, intro: state.intro }, replies: [read, say(T.joining)] };
    const q = msg.caption || msg.contact;
    if (q) { const r = await forwardSearch(msg.lines, q.slice(0, 160), msg.channel); return { ...r, replies: [read, ...r.replies] }; }
    return { state: { step: 'forward', at, texts: msg.lines, channel: msg.channel }, replies: [read, say(T.forwardedAsk)] };
  }
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
    if (state.step === 'context') return { state: { step: 'forward', at, texts: [text], intro: state.intro }, replies: [say(T.joining)] };
    return { state: { step: 'forward', at, texts: [text] }, replies: [say(T.forwardedAsk)] };
  }
  // Con lo que contó delante: los reenviados o las capturas, junto con eso, cuando dice «listo» (o cuenta algo más).
  if (state.step === 'forward' && state.intro) {
    const done = short(text) && new RegExp(`^(${T.doneWords})${END}`, 'iu').test(text);
    const lit = state.texts.flatMap((x) => x.split('\n')).filter(Boolean);
    return withHeard(await note([state.intro, done ? '' : text].filter(Boolean).join('\n\n'), [], lit));
  }
  // Pegó la conversación a medias: se guarda lo que contó y se le pide que pegue primero los mensajes.
  if (['idle', 'confirm', 'context'].includes(state.step)) {
    const intro = halfPasted(text);
    if (intro) return withHeard({ state: { step: 'context', at, intro: state.step === 'context' ? `${state.intro}\n${intro}` : intro }, replies: [say(T.pasteFirst)] });
  }
  if (isCancel(text)) return { state: idle, replies: [say(T.cancelled)] };
  if (state.step === 'idle' && isHelp(text)) return { state, replies: [say(T.help)] };

  switch (state.step) {
    case 'context':
      // «Apúntalo» / «nada»: no hay mensajes que pasar; se apunta lo que contó.
      if (short(text) && new RegExp(`^(${T.noteIt})${END}`, 'iu').test(text)) return withHeard(await note(state.intro));
      // Lo siguiente (la conversación pegada, o más de lo que contó) va junto con lo de antes.
      return withHeard(await note(`${state.intro}\n\n${text}`));
    case 'confirm':
      if (isYes(text)) return save(state.pending);
      if (isNo(text)) return change(state);
      // La conversación que faltaba: se añade a lo que contó (no es una corrección).
      if (state.source && pastedChat(text).length >= 2) return withHeard(await note(`${state.source}\n\n${text}`, state.pending));
      // Otra cosa, con lo anterior delante: es una corrección («la parada está en Almería»), no algo nuevo.
      if (state.source) return withHeard(await note(`${state.source}\n\n${T.correction}: ${text}`, state.pending));
      break; // reenviados: se apunta como algo nuevo
    case 'amend':
      return withHeard(await note(`${state.source}\n\n${T.correction}: ${text}`, state.pending));
    case 'place': {
      const pending = [...state.pending];
      const p = pending[state.i]!;
      const n = numberOf(text);
      const done = (place: Place | null) => { pending[state.i] = { ...p, place, noPlace: !place }; return next(pending, { source: state.source, forward: state.forward }); };
      if (n != null && state.options[n - 1]) return withHeard(done(state.options[n - 1]!));
      if (short(text) && new RegExp(`^(no s[eé]|ninguna|saltar?|da igual|no)${END}`, 'iu').test(text)) return withHeard(done(null));
      const found = d.ops.places ? await d.ops.places(text).catch(() => []) : [];
      if (found.length === 1 || (found[0] && normName(found[0].label.split(' › ').at(-1)!) === normName(text))) return withHeard(done(found[0]!));
      return withHeard(askPlace(pending, state.i, { source: state.source, forward: state.forward }, found.slice(0, 5)));
    }
    case 'pick': {
      const n = numberOf(text);
      const p = state.pending[state.i];
      const pending = [...state.pending];
      if (n === 0) { pending[state.i] = { ...p, choice: { accountId: null, create: p.item.venue, name: p.item.venue } }; return withHeard(next(pending, { source: state.source })); }
      if (n != null && p.candidates[n - 1]) { const c = p.candidates[n - 1]; pending[state.i] = { ...p, choice: { accountId: c.id, create: null, name: c.name } }; return withHeard(next(pending, { source: state.source })); }
      if (short(text) && new RegExp(`^(salta(r)?|ninguna|no)${END}`, 'iu').test(text)) { pending[state.i] = { ...p, skip: true }; return withHeard(next(pending, { source: state.source })); }
      // Un nombre: se busca otra vez.
      const c = await d.ops.search(text);
      pending[state.i] = { ...p, item: { ...p.item, venue: text.slice(0, 160) }, candidates: c.slice(0, 5), choice: strong(c) ? { accountId: c[0].id, create: null, name: c[0].name } : null };
      return withHeard(next(pending, { source: state.source }));
    }
    case 'forward':
      return withHeard(await forwardSearch(state.texts, text, state.channel));
    case 'forward-pick': {
      const n = numberOf(text);
      if (n === 0) return withHeard(forwardTo(state.texts, { accountId: null, create: state.query.slice(0, 160), name: state.query.slice(0, 160) }, state.channel));
      if (n != null && state.candidates[n - 1]) { const c = state.candidates[n - 1]; return withHeard(forwardTo(state.texts, { accountId: c.id, create: null, name: c.name }, state.channel)); }
      return withHeard(await forwardSearch(state.texts, text, state.channel));
    }
  }
  // Muy poco («he estado hablando con X»): se pregunta de qué antes de guardar nada.
  if (state.step === 'idle' && !announcesChat(text)) {
    const who = tooThin(text);
    if (who != null) return withHeard({ state: { step: 'context', at, intro: text }, replies: [say(T.tellMore(who))] });
  }
  // «He hablado con X… ahora te paso los mensajes»: se espera la conversación para juntarla.
  if (state.step === 'idle' && announcesChat(text)) return withHeard({ state: { step: 'context', at, intro: text }, replies: [say(T.waitChat)] });
  return withHeard(await note(text));
}
