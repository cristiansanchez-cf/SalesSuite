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
import { EDIT_HINT, type EditAsk, type EditPlan } from './edits';
import type { QualQuestion } from '../crm/qual-labels';

/** Lo que se cambia de una ficha (por WhatsApp). */
export interface EditChange {
  name?: string; place?: Place; kind?: string; discard?: { reason: string; note: string | null }; restore?: boolean;
  linkTo?: { id: string | null; name: string }; note?: string;
}
/** Un cambio ya con su empresa (y su sitio y su enlace resueltos), listo para enseñar y guardar. */
interface EditItem { id: string; name: string; ask: EditAsk; place: Place | null; link: { id: string | null; name: string } | null; kindLabel: string | null }
export interface Candidate { id: string; name: string; zone: string; score: number; discarded: boolean }
export interface AssistantOps {
  /** «Apuntar»: lo separa por empresa con sus candidatas. */
  split(text: string): Promise<Array<NoteItem & { candidates: Candidate[] }>>;
  search(q: string): Promise<Candidate[]>;
  apply(rows: unknown[]): Promise<Array<{ accountId: string | null; name: string; ok: boolean; error?: string; agreement?: 'active' | 'pending'; trial?: string; trialError?: string; discarded?: boolean }>>;
  /** Recordatorios: la propuesta de mensaje para una empresa (draft.ts). */
  draft?(item: ReminderItem): Promise<string>;
  /** Dónde está una empresa nueva: un sitio conocido nombrado en el texto (places.ts). */
  placeIn?(text: string): Promise<Place | null>;
  /** Lo que escribe cuando se le pregunta la ciudad: sus zonas, el catálogo de España y Google. */
  places?(q: string): Promise<Place[]>;
  /** «Hecho»: apunta que le escribió (y el CRM propone el siguiente paso). Devuelve cuándo toca lo siguiente. */
  done?(accountId: string): Promise<{ name: string; nextAt: string | null }>;
  /** Arreglar lo recién guardado (criterio de Cristian): el nombre y/o dónde está. Devuelve cómo ha quedado. */
  edit?(accountId: string, e: EditChange): Promise<{ name: string; zone: string }>;
  /** Arreglar fichas con IA (edits.ts): qué empresas y qué cambios pide, con sus palabras. */
  understand?(text: string): Promise<EditPlan | null>;
  /** Nombre del tipo («Promotora») por su clave. */
  kindLabel?(key: string): Promise<string>;
  /** Cualificar por WhatsApp: las preguntas que le faltan y marcar lo que cuenta (con la IA de Apuntar). */
  qualGaps?(accountId: string): Promise<{ name: string; gaps: QualQuestion[] }>;
  qualifyFrom?(accountId: string, text: string): Promise<{ name: string; marked: string[]; gaps: QualQuestion[] }>;
  /** «Mañana»: el próximo paso, a mañana. */
  later?(accountId: string): Promise<{ name: string }>;
  /** «Validar» / «Rechazar» del aviso de lead nuevo (docs/LEADS.md §2f). */
  leadOk?(leadId: string): Promise<{ name: string; whatsapp: { minutes: number; soon: boolean } | null; why: string | null }>;
  leadNo?(leadId: string): Promise<{ name: string }>;
  /** «¿Qué tengo para hoy?»: lo de hoy (y de esta semana), lo mismo que lo_de_hoy del MCP. */
  agenda?(): Promise<AgendaItem[]>;
}
export interface AgendaItem { name: string; bucket: 'cooling' | 'overdue' | 'today' | 'tomorrow' | 'week'; cooling: number | null; step: string | null; at: string | null; contact: string | null }
/** Preguntar qué toca (no es algo que apuntar). Corto y con forma de pregunta o de orden. */
const AGENDA = /^[¿¡\s]*(?:(?:y\s+)?(?:qu[eé]|que)\s+(?:tengo|me\s+toca|toca|hay|tenemos)(?:\s+(?:que\s+hacer\s+)?(?:para\s+)?(?:hoy|mañana|esta\s+semana|pendiente|de\s+hoy))?|(?:mi|la)\s+agenda(?:\s+de\s+hoy)?|lo\s+de\s+hoy|pendientes(?:\s+de\s+hoy)?|agenda|what(?:'s|\s+is|\s+do\s+i\s+have)\s+(?:on\s+|for\s+)?(?:today|this\s+week)|my\s+(?:agenda|day)|o\s+que\s+(?:tenho|há)(?:\s+(?:para\s+)?(?:hoje|esta\s+semana))?|오늘\s*(?:뭐|일정|할\s*일)[^\n]{0,10})[\s?!.]*$/iu;
/** Una empresa del recordatorio de la mañana (lo de «Hoy»), con lo justo para proponer el mensaje. */
export interface ReminderItem {
  accountId: string; name: string; bucket: 'cooling' | 'overdue' | 'today'; cooling: number | null; contactName: string | null; step: string | null;
  channel: string | null; last: { outcome: string; note: string | null; at: string } | null; facts: string[];
}
export type Incoming =
  | { kind: 'text'; text: string; forwarded?: boolean }
  | { kind: 'button'; id: string }
  /** forwarded: un audio reenviado (de un cliente): son sus palabras, no lo que cuenta quien escribe. */
  | { kind: 'audio'; text: string | null; forwarded?: boolean }
  /** Captura de una conversación (screenshot.ts): sus líneas («Nosotros: …»), el nombre de arriba y el pie de foto. */
  | { kind: 'image'; lines: string[] | null; contact: string; caption: string; channel: string; ready: boolean }
  /** Tarjeta de contacto compartida, en texto («Contacto compartido: Jorge · Teléfono: …»). */
  | { kind: 'contact'; text: string }
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
  /** Ha compartido una tarjeta de contacto: se espera quién es y de qué empresa («el encargado del 12 Torremolinos»). */
  | { step: 'card'; at: string; card: string }
  | { step: 'forward-pick'; at: string; texts: string[]; query: string; candidates: Candidate[]; channel?: string }
  /** agenda: lo de hoy, mañana y esta semana que llevaba el recordatorio (se enseña entero al decir que sí). */
  | { step: 'reminder'; at: string; items: ReminderItem[]; agenda?: AgendaItem[] }
  /** Recién guardado: «se llama solo X» o «está en Murcia, no en Madrid» arreglan eso mismo (media hora). */
  | { step: 'saved'; at: string; saved: Array<{ id: string; name: string }>; ask?: { id: string; name: string } }
  /** Arreglar fichas: el resumen de cambios (Guardar / Cambiar) y, si una empresa tiene varias parecidas, cuál es. */
  | { step: 'edit-confirm'; at: string; items: EditItem[]; source: string }
  | { step: 'edit-pick'; at: string; items: EditItem[]; rest: EditAsk[]; ask: EditAsk; candidates: Candidate[]; source: string }
  | { step: 'edit-amend'; at: string; source: string };

/** Un arreglo rápido tras guardar es una frase corta; un relato (más de LONG_WORDS) nunca es un arreglo de fichas. */
const QUICK_FIX_WORDS = 20;
/** Una pregunta de la cualificación en una línea: «• ¿Hay fiesta? (Es su negocio / Algunas noches / No)». */
const qLine = (q: QualQuestion) => `• ${q.question}${q.options.length <= 5 ? ` (${q.options.map((o) => o.label).join(' / ')})` : ''}`;
const LONG_WORDS = 60;
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
    nextDays: it.nextDays, nextTime: it.nextTime ?? null, laterSteps: it.laterSteps ?? [], agreement: it.agreement ?? null, agreementPackages: it.agreementPackages ?? [], agreementPrice: it.agreementPrice ?? null, trialUntil: it.trialUntil ?? null,
    // Descartar (no les interesa, no encaja…): se ve en el resumen y se hace al pulsar Guardar; así nadie vuelve a venderles lo mismo.
    discard: it.discard ?? null, discardNote: it.discard ? it.discardWhy ?? null : null, worksAt: [], people: it.people ?? [], contact: it.contact ?? {},
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
const CHAT_NOUN = /(mensaje|conversaci|chat|captura|pantallazo|whats|audio|nota de voz|messages?|conversation|screenshots?|voice note|mensage|conversa|áudio)/iu;
// Solo un aviso corto, y al final («…ahora te paso los mensajes»): en un audio largo, «te paso» es parte de lo que cuenta.
/** «…y me dijo esto:», «escucha lo que me ha mandado»: lo que viene (un audio o sus mensajes reenviados) son sus palabras. */
const SAID_THIS = /(?:me\s+(?:dijo|ha\s+dicho|cont[oó]|ha\s+contado|coment[oó]|ha\s+comentado|mand[oó]|ha\s+mandado|escribi[oó]|ha\s+escrito|respondi[oó]|ha\s+respondido|contest[oó]|ha\s+contestado)\s+(?:esto|lo\s+siguiente|este\s+audio)|esto\s+es\s+lo\s+que\s+me\s+(?:dijo|ha\s+dicho)|escucha\s+(?:esto|lo\s+que)|(?:te\s+)?(?:reenv[ií]o|paso|mando)\s+(?:el|su|un)\s+audio|(?:he|she)\s+(?:told|said)\s+(?:me\s+)?this|(?:me\s+)?disse\s+isto)\s*[:.…]*\s*$/iu;
export const announcesChat = (t: string) => {
  if (t.length > 300 || pastedChat(t).length) return false;
  const tail = t.slice(-160);
  return (ANNOUNCE.test(tail) && CHAT_NOUN.test(tail)) || SAID_THIS.test(tail.trim());
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
/**
 * Lo que escribe al preguntarle cuál es («Euforía. Está en Murcia», «sí, crear Euforia»): el nombre por un lado y, si
 * dice dónde está, el sitio por otro (antes todo iba al nombre: «Euforía está en Murcia»).
 */
export function nameAndRest(t: string): { create: boolean; name: string; rest: string } {
  let x = t.trim().replace(/^s[ií][,.]?\s*/iu, '');
  const create = /^(cr[eé]a(r|la|lo)?|nueva|nuevo)\b[,:]?\s*/iu.test(x);
  x = x.replace(/^(cr[eé]a(r|la|lo)?|nueva|nuevo)\b[,:]?\s*/iu, '');
  const cut = /\s*(?:[.,;]\s+|\s+(?:que\s+)?(?:est[aá]|queda|es de)\s+en\s+|\s+(?:est[aá])\s+)/iu.exec(x);
  const name = (cut ? x.slice(0, cut.index) : x).replace(/^[«"']|[»"']$/g, '').trim();
  return { create, name, rest: cut ? x.slice(cut.index).replace(/^[\s.,;]+/, '') : '' };
}
/** Dónde dice que está, quedándose con lo último que no niega («no está en Madrid, está en Murcia» → Murcia). */
export function saidPlace(t: string): string | null {
  const ms = [...t.matchAll(/(?:^|[\s,;.])(no\s+)?(?:est[aá]|queda|es de|ubicad[oa])\s+en\s+([^,.;\n]{2,60})/giu)].filter((m) => !m[1]);
  return ms.length ? ms[ms.length - 1]![2]!.trim() : null;
}
/**
 * Arreglar una ficha (criterio de Cristian: «corrige el nombre de Euforía y está en Murcia. Se llama solo Euforía»): la
 * empresa (por su nombre de ahora, que puede llevar «está en…» si se guardó mal) y el cambio. Con o sin dos puntos.
 */
const FIX_VERB = /^\s*(?:corrige|corregir|corr[ií]gelo|arregla|arreglar|cambia|cambiar|edita|editar)\s+(?:(el\s+nombre|la\s+ficha|la\s+ubicaci[oó]n|la\s+ciudad|el\s+sitio)\s+(?:de|a|en)\s+)?/iu;
const NAME_SAID = /[\s,.;:]+(?:se llama(?: solo)?|el nombre (?:correcto )?es|ponle de nombre|ll[aá]mal[ao]|es solo|solo es|deber[ií]a llamarse|tiene que llamarse)\s/iu;
const PLACE_SAID = /[\s,.;:]+(?:que\s+)?(?:est[aá]|queda|es de|ubicad[oa])\s+en\s/iu;
export const isFixRequest = (t: string) => FIX_VERB.test(t);
export function fixCommand(t: string): { target: string; change: string; alt: string | null } | null {
  const v = FIX_VERB.exec(t);
  if (!v) return null;
  const what = (v[1] ?? '').toLowerCase();
  const body = t.slice(v[0].length).trim();
  const clean = (x: string) => x.replace(/^[«"'\s]+|[»"'\s.,;:]+$/g, '').trim();
  let target = '', change = '';
  const colon = body.indexOf(':');
  const nm = NAME_SAID.exec(body);
  const rn = /^(.+?)\s+(?:a|por)\s+[«"']?([^»"'\n]{2,80})[»"']?\s*$/iu.exec(body);
  if (colon > 0) { target = body.slice(0, colon); change = body.slice(colon + 1); }
  else if (nm) { target = body.slice(0, nm.index); change = body.slice(nm.index); }
  else if (what.startsWith('el nombre') && rn) { target = rn[1]!; change = `se llama ${rn[2]}`; }
  else { const pl = PLACE_SAID.exec(body); if (!pl) return null; target = body.slice(0, pl.index); change = body.slice(pl.index); }
  target = clean(target);
  // Si el nombre de ahora lleva la ciudad pegada («Euforía y está en Murcia»), se prueba también sin ella.
  const cut = PLACE_SAID.exec(target) ?? /\s+y\s+(?=est[aá]\s+en\s)/iu.exec(target);
  const alt = cut ? clean(target.slice(0, cut.index).replace(/\s+y$/iu, '')) : null;
  return target.length >= 2 && change.trim().length >= 3 ? { target, change: change.trim(), alt: alt && alt.length >= 2 ? alt : null } : null;
}
/** «Se llama solo X», «el nombre es X», «es solo X», «cámbiale el nombre a X». */
export function saidName(t: string): string | null {
  const m = /(?:se llama(?: solo)?|el nombre (?:correcto )?es|cambia(?:r|le)? el nombre (?:a|por)|ponle de nombre|ll[aá]mal[ao]|es solo|solo es)\s+[«"']?([^»"'.,;\n]{2,80}?)[»"']?\s*(?:[.,;]|\s+y\s+(?:no\s+)?(?:est|es|qued|ubic)|$)/iu.exec(t);
  return m ? m[1]!.trim() : null;
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
      interaction: p.item.interaction, keyFacts: p.item.keyFacts, facts: p.item.facts, later: (p.item.laterSteps ?? []).map((x) => ({ step: x.step, day: new Date(d.now.getTime() + x.days * 86_400_000).toISOString().slice(0, 10) })), qual: p.item.qualLabels ?? [], people: (p.item.people ?? []).map((x) => [x.name, x.role, x.phone, x.email].filter(Boolean).join(' · ')), nextStep: p.item.nextStep, nextDays: p.item.nextDays, nextTime: p.item.nextTime ?? null, agreement: p.item.agreement ? [p.item.agreementLabel, p.item.agreement].filter(Boolean).join(' — ') : null, trialUntil: p.item.trialUntil ?? null,
      discard: p.item.discard ? `${T.discards[p.item.discard] ?? p.item.discard}${p.item.discardWhy ? ` (${p.item.discardWhy})` : ''}` : null,
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
    for (const x of r) if (x.ok && x.trial) deals.push(T.trialSaved(x.name, x.trial)); else if (x.ok && x.trialError) deals.push(T.trialFailed(x.name, x.trialError));
    const out = r.filter((x) => x.ok && x.discarded).map((x) => x.name);
    if (out.length) deals.push(T.discardedSaved(out));
    const saved = r.filter((x) => x.ok && x.accountId).map((x) => ({ id: x.accountId!, name: x.name }));
    const replies = [say([ok.length ? T.saved(ok) : '', ...deals, bad.length ? T.notSaved(bad) : ''].filter(Boolean).join('\n\n') || T.nothingLeft)];
    // Una empresa (no descartada) con preguntas sin responder: se proponen, para cualificarla en el momento.
    let ask: { id: string; name: string } | undefined;
    const one = saved.length === 1 && !r.some((x) => x.discarded) ? saved[0]! : null;
    if (one && d.ops.qualGaps && d.ops.qualifyFrom) {
      const g = await d.ops.qualGaps(one.id).catch(() => null);
      if (g?.gaps.length) { ask = one; replies.push(say(T.qualAsk(one.name, g.gaps.map(qLine)))); }
    }
    return { state: saved.length && (d.ops.edit || ask) ? { step: 'saved', at, saved, ...(ask ? { ask } : {}) } : idle, replies };
  };
  /** Lo que cuenta, a «Apuntar». */
  const note = async (text: string, prev: Pending[] = [], literal?: string[], correction?: string): Promise<FlowResult> => {
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
      // Al corregir, lo que ya había elegido para esa empresa (por su nombre; si solo hay una, esa aunque cambie el nombre).
      let was = prev.find((p) => p.choice && (normName(p.item.venue) === normName(it.venue) || normName(p.choice.name) === normName(it.venue)));
      if (!was && prev.length === 1 && items.length === 1 && prev[0]!.choice) was = prev[0];
      // Una empresa nueva a la que se le corrige el nombre («se llama solo Euforía»): se crea con el nombre bueno.
      const renamed = correction ? saidName(correction) : null;
      if (was?.choice && !was.choice.accountId && (renamed || normName(was.choice.name) !== normName(it.venue))) {
        const nm = (renamed ?? it.venue).slice(0, 160);
        was = { ...was, choice: { accountId: null, create: nm, name: nm } };
      }
      const choice = was?.choice ?? (strong(it.candidates) ? { accountId: it.candidates[0].id, create: null, name: it.candidates[0].name } : null);
      // Dónde está (por si es nueva): lo que diga de ella; si solo hay una, todo lo que contó.
      const about = [it.venue, it.interaction, ...it.keyFacts, ...it.facts, items.length === 1 ? text : ''].filter(Boolean).join(' \n ');
      // Al corregir, el sitio que diga ahora manda sobre el de antes («no, está en Murcia»).
      const fixed = correction && d.ops.placeIn ? await d.ops.placeIn(saidPlace(correction) ?? correction).catch(() => null) : null;
      const place = fixed ?? was?.place ?? (d.ops.placeIn ? await d.ops.placeIn(about).catch(() => null) : null);
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

  // ---- Arreglar fichas con IA: resolver cada empresa, enseñar el resumen y guardar al pulsar Guardar.
  const editSummary = (items: EditItem[], source: string): FlowResult => {
    const lines = items.map((x) => [`*${x.name}*`,
      x.ask.rename ? `✏️ ${T.editName}: ${x.ask.rename}` : '', x.place ? `📍 ${x.place.label}` : x.ask.place ? `📍 ${x.ask.place} (${T.editPlaceUnknown})` : '',
      x.ask.kind ? `🏷️ ${T.editKind}: ${x.kindLabel ?? x.ask.kind}` : '',
      x.ask.discard ? `🚫 ${T.editDiscard}: ${T.discards[x.ask.discard] ?? x.ask.discard}${x.ask.discardWhy ? ` (${x.ask.discardWhy})` : ''}` : '',
      x.ask.restore ? `♻️ ${T.editRestore}` : '', x.link ? `🔗 ${T.editLink(x.link.name, !x.link.id)}` : '', x.ask.note ? `📝 «${x.ask.note}»` : '',
    ].filter(Boolean).join('\n'));
    return { state: { step: 'edit-confirm', at, items, source }, replies: [say(`${T.editPlan}\n\n${lines.join('\n\n')}`, [{ id: 'save', title: T.save }, { id: 'change', title: T.change }])] };
  };
  const pickOf = (c: Candidate[], q: string) => c.find((x) => normName(x.name) === normName(q)) ?? (c[0] && c[0].score >= 0.85 && (!c[1] || c[1].score < c[0].score - 0.05) ? c[0] : null);
  const resolveEdit = async (ask: EditAsk, chosen: { id: string; name: string }): Promise<EditItem> => {
    let place: Place | null = null;
    if (ask.place) {
      place = d.ops.placeIn ? await d.ops.placeIn(`en ${ask.place}`).catch(() => null) : null;
      if (!place && d.ops.places) place = (await d.ops.places(ask.place).catch(() => []))[0] ?? null;
    }
    let link: EditItem['link'] = null;
    if (ask.linkTo) { const c = await d.ops.search(ask.linkTo).catch(() => []); const h = pickOf(c, ask.linkTo); link = h ? { id: h.id, name: h.name } : { id: null, name: ask.linkTo }; }
    const kindLabel = ask.kind && d.ops.kindLabel ? await d.ops.kindLabel(ask.kind).catch(() => null) : null;
    return { id: chosen.id, name: chosen.name, ask, place, link, kindLabel };
  };
  /** Una a una: la que se reconoce, directa; si hay varias parecidas, se pregunta cuál (con número). */
  const resolveEdits = async (asks: EditAsk[], items: EditItem[], source: string): Promise<FlowResult> => {
    const notFound: string[] = [];
    for (let i = 0; i < asks.length; i++) {
      const ask = asks[i]!;
      let c = await d.ops.search(ask.target).catch(() => [] as Candidate[]);
      let hit = pickOf(c, ask.target);
      // El nombre de ahora puede llevar la ciudad pegada («Euforía y está en Murcia»).
      const alt = ask.target.replace(/\s+(?:y\s+)?(?:que\s+)?est[aá]\s+en\s+.*$/iu, '').trim();
      if (!hit && alt && alt !== ask.target) { const c2 = await d.ops.search(alt).catch(() => [] as Candidate[]); hit = pickOf(c2, alt); if (!c.length) c = c2; }
      if (hit) { items.push(await resolveEdit(ask, hit)); continue; }
      if (!c.length) { notFound.push(ask.target); continue; }
      const opts = c.slice(0, 5).map((x, n) => `${n + 1}) ${x.name}${x.zone ? ` · ${x.zone}` : ''}${x.discarded ? ` (${T.discarded})` : ''}`);
      return { state: { step: 'edit-pick', at, items, rest: asks.slice(i + 1), ask, candidates: c.slice(0, 5), source }, replies: [say(T.editWhich(ask.target, opts))] };
    }
    if (!items.length) return { state: idle, replies: [say(notFound.length ? T.notFound(notFound.join(', ')) : T.nothing)] };
    const r = editSummary(items, source);
    return notFound.length ? { ...r, replies: [say(T.editSkipped(notFound)), ...r.replies] } : r;
  };
  const understand = async (text: string): Promise<FlowResult | null> => {
    if (!d.ops.understand) return null;
    const plan = await d.ops.understand(text).catch(() => null);
    return plan?.isEdit ? resolveEdits(plan.edits, [], text) : null;
  };
  const saveEdits = async (items: EditItem[]): Promise<FlowResult> => {
    const ok: string[] = [], bad: string[] = [];
    for (const x of items) {
      try {
        const r = await d.ops.edit!(x.id, {
          ...(x.ask.rename ? { name: x.ask.rename } : {}), ...(x.place ? { place: x.place } : {}), ...(x.ask.kind ? { kind: x.ask.kind } : {}),
          ...(x.ask.discard ? { discard: { reason: x.ask.discard, note: x.ask.discardWhy } } : {}), ...(x.ask.restore ? { restore: true } : {}),
          ...(x.link ? { linkTo: x.link } : {}), ...(x.ask.note ? { note: x.ask.note } : {}),
        });
        ok.push(`${r.name}${r.zone ? ` · 📍 ${r.zone}` : ''}`);
      } catch (e) { bad.push(`${x.name}: ${e instanceof Error && e.message ? e.message : T.failed}`); }
    }
    return { state: idle, replies: [say([ok.length ? T.editDone(ok) : '', bad.length ? T.notSaved(bad) : ''].filter(Boolean).join('\n\n'))] };
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
  // ---- Botones del aviso de lead nuevo: «lead:<espacio>:<lead>:ok|no» (el espacio ya lo ha elegido hub.ts).
  if (msg.kind === 'button' && /^lead:[0-9a-f-]{36}:[0-9a-f-]{36}:(ok|no)$/i.test(msg.id)) {
    const [, , leadId, what] = msg.id.split(':');
    try {
      if (what === 'ok' && d.ops.leadOk) { const r = await d.ops.leadOk(leadId); return { state, replies: [say(T.leadOk(r.name, r.whatsapp, r.why ? (T.leadWhy as Record<string, string>)[r.why] ?? r.why : null))] }; }
      if (what === 'no' && d.ops.leadNo) { const r = await d.ops.leadNo(leadId); return { state, replies: [say(T.leadNo(r.name))] }; }
    } catch (e) { return { state, replies: [say(e instanceof Error && e.message ? T.leadFailed(e.message) : T.failedOne)] }; }
  }
  // La respuesta al recordatorio de la mañana (su botón de la plantilla o un «sí» / «más tarde»).
  if (state.step === 'reminder' && (msg.kind === 'button' || msg.kind === 'text')) {
    const said = (msg.kind === 'button' ? msg.id : msg.text).trim();
    // Solo respuestas cortas: «Sí, hoy he hablado con Club Sol…» es algo nuevo que apuntar.
    if (msg.kind === 'button' || short(said)) {
      if (new RegExp(`^(s[ií]|prep[aá]ra(los|me)?|vale|ok|dale|venga|claro|yes|sure|sim|oui|네|좋아)${END}`, 'iu').test(said)) {
        // Primero la agenda entera (hoy, mañana, esta semana) y luego una propuesta por cada una de hoy.
        const r = await prepare(state.items);
        return state.agenda ? { ...r, replies: [say(T.agenda(state.agenda)), ...r.replies] } : r;
      }
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
    if (state.step === 'edit-confirm' && msg.id === 'save') return saveEdits(state.items);
    if (state.step === 'edit-confirm' && msg.id === 'change') return { state: { step: 'edit-amend', at, source: state.source }, replies: [say(T.askChange)] };
    if (state.step === 'confirm' && msg.id === 'change') return change(state);
    return { state, replies: [say(T.expired)] };
  }
  if (msg.kind === 'other') return { state, replies: [say(T.onlyText)] };
  // ---- Tarjeta de contacto («este es Jorge, el encargado del 12 Torremolinos»): la persona, con su cargo y su número,
  // en su empresa. Con lo que ya contó delante se junta; si no, se pregunta quién es y de dónde.
  if (msg.kind === 'contact') {
    const card = msg.text.trim().slice(0, 2000);
    if (state.step === 'context') return await note(`${state.intro}\n\n${card}`);
    if (state.step === 'confirm' && state.source) return await note(`${state.source}\n\n${card}`, state.pending);
    if (state.step === 'card') return { state: { ...state, at, card: `${state.card}\n${card}` }, replies: [] };
    const who = /Contacto compartido:\s*([^·\n]+)/.exec(card)?.[1]?.trim() ?? '';
    return { state: { step: 'card', at, card }, replies: [say(T.cardAsk(who))] };
  }
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
  // ---- Audio reenviado (de un cliente: «hablé con el de la Bresh y me dijo esto:» + su audio): son sus palabras. Va
  // como los mensajes reenviados, con lo que contó delante; si ya estaba el resumen, se suma a lo que contó.
  if (msg.kind === 'audio' && msg.forwarded) {
    const said = `${T.clientAudio}: «${text}»`;
    if (state.step === 'forward' || state.step === 'forward-pick') return { state: { ...state, at, texts: [...state.texts, said].slice(-MAX_FORWARDED) }, replies: heard };
    if (state.step === 'context') return { state: { step: 'forward', at, texts: [said], intro: state.intro }, replies: [...heard, say(T.joining)] };
    // Con el resumen delante (o tras «Cambiar», o eligiendo la empresa): se suma a lo que contó.
    if ((state.step === 'confirm' || state.step === 'amend' || state.step === 'pick' || state.step === 'place') && state.source) return withHeard(await note(`${state.source}\n\n${said}`, state.pending));
    return { state: { step: 'forward', at, texts: [said] }, replies: [...heard, say(T.forwardedAsk)] };
  }
  // ---- «¿Qué tengo para hoy?»: la agenda (si hoy no hay nada, la semana). No cambia lo que estuviera a medias.
  if (!(msg.kind === 'text' && msg.forwarded) && d.ops.agenda && text.length <= 60 && AGENDA.test(text)) {
    try { return withHeard({ state, replies: [say(T.agenda(await d.ops.agenda()))] }); } catch { return withHeard({ state, replies: [say(T.failedOne)] }); }
  }

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
  // Algo nuevo (sin nada a medias, o recién guardado otra cosa). «He hablado con X… ahora te paso su audio / los
  // mensajes»: se espera para juntarlo (caso Bresh: con lo guardado justo antes, esto se apuntaba solo y a medias).
  if (state.step === 'idle' || state.step === 'saved') {
    if (announcesChat(text)) return withHeard({ state: { step: 'context', at, intro: text }, replies: [say(T.waitChat)] });
    // Muy poco («he estado hablando con X»): se pregunta de qué antes de guardar nada.
    const who = state.step === 'idle' ? tooThin(text) : null;
    if (who != null) return withHeard({ state: { step: 'context', at, intro: text }, replies: [say(T.tellMore(who))] });
  }

  /** Cambiar el nombre y/o la ciudad de una empresa (la que diga, o la recién guardada). */
  const applyEdit = async (target: { id: string; name: string }, change: string, keep: State): Promise<FlowResult | null> => {
    const newName = saidName(change);
    const where = saidPlace(change);
    if (!newName && !where) return null;
    let place: Place | null = null;
    if (where) {
      place = d.ops.placeIn ? await d.ops.placeIn(`en ${where}`).catch(() => null) : null;
      if (!place && d.ops.places) place = (await d.ops.places(where).catch(() => []))[0] ?? null;
      if (!place && !newName) return { state: keep, replies: [say(T.placeNotFound(where))] };
    }
    try {
      const r = await d.ops.edit!(target.id, { ...(newName ? { name: newName } : {}), ...(place ? { place } : {}) });
      return { state: { step: 'saved', at, saved: [{ id: target.id, name: r.name }] }, replies: [say(T.edited(r.name, r.zone))] };
    } catch (e) { return { state: keep, replies: [say(e instanceof Error && e.message ? `${T.failedOne} (${e.message})` : T.failedOne)] }; }
  };
  // Un relato largo (un audio contando una visita) es algo nuevo que apuntar, nunca un arreglo de fichas: «el socio
  // minoritario se llama Aitor» dentro de un audio sobre Marquee renombró la empresa recién guardada (Jumanji Copas).
  const words = text.split(/\s+/).filter(Boolean).length;
  const story = words > LONG_WORDS;
  // Cualificar (docs/ASSISTANT.md §Cualificar): tras guardar, lo que cuente de esa empresa se marca («tiene pantallas,
  // hacen 2 fiestas al mes»). Si no saca nada de su cualificación, sigue como siempre (puede ser algo nuevo).
  // Una corrección corta («es solo Euforia», «está en Murcia», «corrige…») va antes: es arreglar, no cualificar.
  const fixing = (words <= QUICK_FIX_WORDS && (!!saidName(text) || !!saidPlace(text))) || isFixRequest(text);
  if (state.step === 'saved' && state.ask && d.ops.qualifyFrom && !story && !fixing) {
    if (short(text) && new RegExp(`^(luego|m[aá]s tarde|ahora no|no|despu[eé]s|later|not now|depois|mais tarde|나중에)${END}`, 'iu').test(text)) {
      return withHeard({ state: { step: 'saved', at, saved: state.saved }, replies: [say(T.qualLater(state.ask.name))] });
    }
    const q = await d.ops.qualifyFrom(state.ask.id, text).catch(() => null);
    if (q?.marked.length) return withHeard({ state: { step: 'saved', at, saved: state.saved, ...(q.gaps.length ? { ask: state.ask } : {}) }, replies: [say(T.qualMarked(q.name, q.marked, q.gaps.map(qLine)))] });
  }
  // «Cualifica Marquee» (y lo que sepa): lo marca; sin más, pregunta lo que falta.
  const qm = d.ops.qualifyFrom && d.ops.qualGaps && ['idle', 'saved'].includes(state.step) && !story
    ? /^\s*cualif[ií]ca(?:r|me|la|lo)?\s+(?:a\s+)?([^:,.\n]+?)(?:\s*[:,.]\s*([\s\S]+?))?\s*$/iu.exec(text) : null;
  if (qm) {
    const who = qm[1]!.trim();
    const c = await d.ops.search(who).catch(() => [] as Candidate[]);
    const hit = pickOf(c, who);
    if (!hit) return withHeard({ state, replies: [say(c.length ? T.fixWhich(who, c.slice(0, 5).map((x) => `${x.name}${x.zone ? ` · ${x.zone}` : ''}`)) : T.notFound(who))] });
    const ask = { id: hit.id, name: hit.name };
    if (qm[2]?.trim()) {
      const q = await d.ops.qualifyFrom!(hit.id, qm[2]);
      return withHeard({ state: { step: 'saved', at, saved: [ask], ...(q.gaps.length ? { ask } : {}) }, replies: [say(q.marked.length ? T.qualMarked(q.name, q.marked, q.gaps.map(qLine)) : T.qualNone(q.name))] });
    }
    const g = await d.ops.qualGaps!(hit.id);
    if (!g.gaps.length) return withHeard({ state, replies: [say(T.qualDone(g.name))] });
    return withHeard({ state: { step: 'saved', at, saved: [ask], ask }, replies: [say(T.qualAsk(g.name, g.gaps.map(qLine)))] });
  }
  // Arreglar fichas con IA (lo que diga, con sus palabras); si no es eso, sigue como siempre.
  if (!story && d.ops.edit && d.ops.understand && ['idle', 'saved'].includes(state.step) && EDIT_HINT.test(text)) {
    const r = await understand(text);
    if (r) return withHeard(r);
  }
  // Sin IA: «Corrige X: se llama Y y está en Z» (frases fijas).
  const fix = !story && d.ops.edit && !d.ops.understand && ['idle', 'saved'].includes(state.step) ? fixCommand(text) : null;
  if (fix) {
    // Por su nombre de ahora; si no, sin la ciudad pegada. Si la ciudad iba en el nombre viejo, también se arregla.
    const find = async (q: string) => {
      const c = await d.ops.search(q);
      return { c, hit: c.find((x) => normName(x.name) === normName(q)) ?? (c[0] && c[0].score >= 0.8 && (!c[1] || c[1].score < c[0].score - 0.05) ? c[0] : null) };
    };
    let f = await find(fix.target);
    if (!f.hit && fix.alt) { const g = await find(fix.alt); if (g.hit || !f.c.length) f = g; }
    if (!f.hit) return withHeard({ state, replies: [say(f.c.length ? T.fixWhich(fix.alt ?? fix.target, f.c.slice(0, 5).map((x) => `${x.name}${x.zone ? ` · ${x.zone}` : ''}`)) : T.notFound(fix.target))] });
    const placeInName = saidPlace(fix.target);
    const change = placeInName && !saidPlace(fix.change) ? `${fix.change}. Está en ${placeInName}` : fix.change;
    const r = await applyEdit({ id: f.hit.id, name: f.hit.name }, change, state);
    if (r) return withHeard(r);
  }
  // Pedía arreglar algo pero no se entiende qué: se explica cómo (antes lo apuntaba como algo nuevo).
  if (!story && d.ops.edit && ['idle', 'saved'].includes(state.step) && isFixRequest(text) && !fix) return withHeard({ state, replies: [say(T.fixHow)] });
  if (state.step === 'edit-confirm') {
    if (isYes(text)) return saveEdits(state.items);
    // Otra cosa: corrección sobre lo que pidió.
    const r = await understand(`${state.source}\n\n${T.correction}: ${text}`);
    if (r) return withHeard(r);
  }
  if (state.step === 'edit-amend') {
    const r = await understand(`${state.source}\n\n${T.correction}: ${text}`);
    if (r) return withHeard(r);
  }
  if (state.step === 'edit-pick') {
    const n = numberOf(text);
    const st = state;
    const chosen = n != null ? st.candidates[n - 1] : st.candidates.find((x) => normName(x.name) === normName(text)) ?? null;
    if (chosen) { const items = [...st.items, await resolveEdit(st.ask, chosen)]; return withHeard(await resolveEdits(st.rest, items, st.source)); }
    if (short(text) && new RegExp(`^(salta(r)?|ninguna|no)${END}`, 'iu').test(text)) return withHeard(await resolveEdits(st.rest, [...st.items], st.source));
    const c = await d.ops.search(text).catch(() => [] as Candidate[]);
    const h = pickOf(c, text);
    if (h) return withHeard(await resolveEdits(st.rest, [...st.items, await resolveEdit(st.ask, h)], st.source));
    return withHeard({ state: { ...st, at, candidates: c.slice(0, 5).length ? c.slice(0, 5) : st.candidates }, replies: [say(T.editWhich(text, (c.length ? c : st.candidates).slice(0, 5).map((x, i) => `${i + 1}) ${x.name}${x.zone ? ` · ${x.zone}` : ''}`)))] });
  }
  // Recién guardado: «se llama solo Euforía», «está en Murcia, no en Madrid» arreglan esa empresa. Solo un mensaje
  // corto (una corrección); si cuenta más, es algo nuevo.
  if (state.step === 'saved' && words <= QUICK_FIX_WORDS && d.ops.edit && (saidName(text) || saidPlace(text))) {
    const target = state.saved.length === 1 ? state.saved[0]! : state.saved.find((x) => normName(text).includes(normName(x.name))) ?? null;
    if (!target) return withHeard({ state, replies: [say(T.whichSaved(state.saved.map((x) => x.name)))] });
    const r = await applyEdit(target, text, state);
    if (r) return withHeard(r);
  }

  switch (state.step) {
    case 'card':
      return withHeard(await note(`${state.card}\n\n${text}`));
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
      // Un audio largo («lo que saco de aquí es… vamos a hacer X e Y») se suma a lo de antes: no renombra ni mueve nada.
      if (state.source) return withHeard(await note(`${state.source}\n\n${T.correction}: ${text}`, state.pending, undefined, story ? undefined : text));
      break; // reenviados: se apunta como algo nuevo
    case 'amend':
      return withHeard(await note(`${state.source}\n\n${T.correction}: ${text}`, state.pending, undefined, story ? undefined : text));
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
      // Un nombre (y quizá dónde está): «Euforía. Está en Murcia» → nombre «Euforía», sitio Murcia.
      const { create, name, rest } = nameAndRest(text);
      const where = rest && d.ops.placeIn ? await d.ops.placeIn(saidPlace(rest) ?? rest).catch(() => null) : null;
      const venue = (name || p.item.venue).slice(0, 160);
      // «Sí, crear Euforia»: se crea con ese nombre, sin volver a buscar.
      if (create) { pending[state.i] = { ...p, item: { ...p.item, venue }, choice: { accountId: null, create: venue, name: venue }, ...(where ? { place: where } : {}) }; return withHeard(next(pending, { source: state.source })); }
      const c = await d.ops.search(venue);
      pending[state.i] = { ...p, item: { ...p.item, venue }, candidates: c.slice(0, 5), choice: strong(c) ? { accountId: c[0].id, create: null, name: c[0].name } : null, ...(where ? { place: where } : {}) };
      return withHeard(next(pending, { source: state.source }));
    }
    case 'forward':
      // Más que un nombre («Bresh, es un audio de Alejandro… habrá que hablarles en 2027 y por correo»): lo que cuenta
      // va con los mensajes (la IA saca la empresa, el próximo paso…) y la conversación queda literal.
      if (words > 4) {
        const lit = state.texts.flatMap((x) => x.split('\n')).filter(Boolean);
        return withHeard(await note(`${text}\n\n${state.texts.join('\n')}`, [], lit));
      }
      return withHeard(await forwardSearch(state.texts, text, state.channel));
    case 'forward-pick': {
      const n = numberOf(text);
      if (n === 0) return withHeard(forwardTo(state.texts, { accountId: null, create: state.query.slice(0, 160), name: state.query.slice(0, 160) }, state.channel));
      if (n != null && state.candidates[n - 1]) { const c = state.candidates[n - 1]; return withHeard(forwardTo(state.texts, { accountId: c.id, create: null, name: c.name }, state.channel)); }
      return withHeard(await forwardSearch(state.texts, text, state.channel));
    }
  }
  return withHeard(await note(text));
}
