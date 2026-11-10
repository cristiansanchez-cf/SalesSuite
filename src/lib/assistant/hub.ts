/**
 * El número del asistente para todas las empresas (docs/ASSISTANT.md §Un número para todas las empresas).
 *
 * Cada persona del equipo escribe desde su WhatsApp de trabajo a un único número. Si está en una sola empresa, va
 * directo. Si está en varias, al empezar el día le pregunta «¿Para qué empresa trabajas hoy?» (botones, o una lista
 * si son más de tres) y se acuerda hasta el día siguiente. Lo que mande antes de elegir se guarda y se apunta en
 * cuanto elige. «empresa» (o «cambiar de empresa») vuelve a preguntar.
 */
import type { Inbound } from '../leads/whatsapp';
import { localClock } from '../notify/daily';
import type { HubSession, Member, PendingMsg } from './db';
import { assistantMessages, type AssistantText } from './messages';
import { processAssistant, type AssistantDeps } from './process';

export const HUB_PICK = 'hub:';
const MAX_PENDING = 10;
/** No repetir la pregunta si llegan varios mensajes seguidos (reenvíos). */
const ASK_AGAIN_MS = 2 * 60_000;
const SWITCH = /^\s*(cambiar( de)?\s+empresa|empresas?|cambiar|company|switch( company)?|mudar( de)? empresa|회사)\s*[.!?]*\s*$/i;
const GREETING = /^\s*(hola+|holi|buenas( tardes| noches| días)?|buenos días|hey|hi|hello|olá|ola|bonjour|안녕(하세요)?)\s*[!.👋🙂😊]*\s*$/i;

export type HubResult = 'handled' | 'asked' | 'picked' | 'duplicate' | 'not_member';

const toPending = (m: Inbound): PendingMsg => ({
  id: m.id, kind: m.kind ?? 'text', text: m.text, forwarded: m.forwarded, mediaId: m.mediaId ?? null, buttonId: m.buttonId ?? null, at: m.at.toISOString(),
});
const fromPending = (p: PendingMsg, phoneId: string, from: string): Inbound => ({
  phoneId, from, text: p.text, at: new Date(p.at), id: p.id, kind: p.kind, forwarded: p.forwarded, mediaId: p.mediaId, buttonId: p.buttonId,
});

/** ¿Eligió empresa hoy (en su zona horaria) y sigue en ella? */
export function chosenToday(s: HubSession | null, tenants: string[], now: Date, timezone: string): boolean {
  if (!s?.tenantId || !s.chosenAt || !tenants.includes(s.tenantId)) return false;
  return localClock(new Date(s.chosenAt), timezone).day === localClock(now, timezone).day;
}

export async function processHub(d: AssistantDeps, phoneId: string, members: Member[], m: Inbound): Promise<HubResult> {
  const users = [...new Set(members.map((x) => x.userId))];
  // Dos personas con el mismo teléfono en Mi cuenta: no se adivina quién es.
  if (users.length !== 1) return 'not_member';
  const userId = users[0];
  const tenants = [...new Set(members.map((x) => x.tenantId))];
  if (tenants.length === 1) return processAssistant(d, phoneId, { tenantId: tenants[0], userId }, m);

  const profile = await d.db.userProfile(userId);
  const T: AssistantText = assistantMessages[(profile.locale ?? 'es') as keyof typeof assistantMessages] ?? assistantMessages.es;
  const names = await d.db.tenantNames(tenants);
  // Siempre en el mismo orden, para que «2» sea siempre la misma.
  const options = tenants.map((id) => ({ id, name: names[id] ?? id })).sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  const session: HubSession = (await d.db.session(userId)) ?? { tenantId: null, chosenAt: null, askedAt: null, pending: [] };
  if (m.id && session.pending.some((p) => p.id === m.id)) return 'duplicate';

  const text = (m.text ?? '').trim();
  // ¿Está eligiendo? Botón o fila de la lista; o, si se le acaba de preguntar, el número o el nombre.
  let picked: string | null = null;
  if (m.kind === 'button' && m.buttonId?.startsWith(HUB_PICK)) picked = m.buttonId.slice(HUB_PICK.length);
  else if (session.askedAt && m.kind === 'text') {
    const n = /^\s*(\d{1,2})\s*[.)]?\s*$/.exec(text);
    if (n) picked = options[Number(n[1]) - 1]?.id ?? null;
    else picked = options.find((o) => o.name.toLowerCase() === text.toLowerCase())?.id ?? null;
  }
  if (picked && tenants.includes(picked)) {
    const pending = session.pending;
    await d.db.saveSession(userId, { tenantId: picked, chosenAt: d.now.toISOString(), askedAt: null, pending: [] });
    if (d.wa?.sendText) await d.wa.sendText(phoneId, m.from, T.hubPicked(options.find((o) => o.id === picked)!.name)).catch((e) => console.error('[assistant hub]', e instanceof Error ? e.message : e));
    for (const p of pending) await processAssistant(d, phoneId, { tenantId: picked, userId }, fromPending(p, phoneId, m.from));
    return 'picked';
  }

  const wantsSwitch = m.kind === 'text' && SWITCH.test(text);
  if (!wantsSwitch && chosenToday(session, tenants, d.now, profile.timezone)) {
    return processAssistant(d, phoneId, { tenantId: session.tenantId!, userId }, m);
  }

  // Hay que preguntar. Lo que traiga contenido se guarda para después (un saludo o «empresa», no).
  const content = !wantsSwitch && !(m.kind === 'text' && GREETING.test(text)) && !(m.kind === 'button');
  const pending = content ? [...session.pending, toPending(m)].slice(-MAX_PENDING) : session.pending;
  const recentlyAsked = !wantsSwitch && !!session.askedAt && d.now.getTime() - Date.parse(session.askedAt) < ASK_AGAIN_MS;
  await d.db.saveSession(userId, { tenantId: wantsSwitch ? null : session.tenantId, chosenAt: wantsSwitch ? null : session.chosenAt, askedAt: recentlyAsked ? session.askedAt : d.now.toISOString(), pending });
  if (recentlyAsked || !d.wa) return 'asked';
  const firstName = (profile.name ?? '').trim().split(/\s+/)[0] ?? '';
  const ask = T.hubAsk(firstName, pending.length > 0);
  try {
    if (options.length <= 3 && d.wa.sendButtons) {
      await d.wa.sendButtons(phoneId, m.from, ask, options.map((o) => ({ id: `${HUB_PICK}${o.id}`, title: o.name })));
    } else if (options.length <= 10 && d.wa.sendList) {
      await d.wa.sendList(phoneId, m.from, ask, T.hubPickButton, options.map((o) => ({ id: `${HUB_PICK}${o.id}`, title: o.name })));
    } else if (d.wa.sendText) {
      await d.wa.sendText(phoneId, m.from, `${ask}\n\n${T.hubAskNumbered(options.map((o) => o.name))}`);
    }
  } catch (e) { console.error('[assistant hub]', e instanceof Error ? e.message : e); }
  return 'asked';
}
