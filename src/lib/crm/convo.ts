/**
 * La conversación literal guardada en una interacción («Conversación:» + líneas, docs/ASSISTANT.md) → burbujas de chat
 * para la ficha (criterio de Cristian: «fuera el resumen de cómo se ha vendido y luego una pantallita de mensajes… ver
 * conversación entera»). Entiende el copiar de WhatsApp («[23/9/26, 14:04:38] Nombre: …» y «23/9/26, 14:04 - Nombre: …»),
 * las capturas leídas por el asistente («Nosotros · 10:02: …» / «Cliente (Sala Marina): …») y los reenviados (sin nombre).
 */
export interface Bubble { who: string; us: boolean; text: string; time: string }
export interface Convo { summary: string; bubbles: Bubble[] }

const HEAD = /^(Conversación|Conversation|Conversa|대화):\s*$/m;
const WA_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]\s*([^:\n]{1,60}):\s?(.*)$/;
const WA_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})\s*[-–]\s*([^:\n]{1,60}):\s?(.*)$/;
const US = ['Nosotros', 'Us', 'Nós', '우리'];
const THEM = ['Cliente', 'Client', '고객'];
const SHOT = new RegExp(`^(${[...US, ...THEM].join('|')})(?: \\(([^)]{1,120})\\))?(?: · (\\d{1,2}:\\d{2}|[^:]{1,40}))?:\\s(.*)$`);
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tokens = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3);

/** null si no hay conversación (o tiene menos de 2 mensajes): la nota se pinta como siempre. */
export function splitConvo(note: string | null, me: string | null = null): Convo | null {
  if (!note) return null;
  const m = HEAD.exec(note);
  if (!m) return null;
  const summary = note.slice(0, m.index).trim();
  const raw: Array<{ who: string; us: boolean | null; text: string; time: string }> = [];
  let patterned = false;
  for (const line of note.slice(m.index + m[0].length).split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const wa = WA_IOS.exec(l) ?? WA_ANDROID.exec(l);
    const shot = !wa && SHOT.exec(l);
    if (wa) { patterned = true; raw.push({ who: wa[3]!.trim(), us: null, time: `${wa[1]} ${wa[2]}`, text: wa[4]! }); }
    else if (shot) { patterned = true; raw.push({ who: shot[2] ?? (US.includes(shot[1]!) ? '' : shot[1]!), us: US.includes(shot[1]!), time: shot[3] ?? '', text: shot[4]! }); }
    else if (patterned && raw.length) raw[raw.length - 1]!.text += `\n${l}`;
    else raw.push({ who: '', us: false, time: '', text: l }); // reenviados: del cliente
  }
  const bubbles = raw.filter((b) => b.text.trim());
  if (bubbles.length < 2) return null;
  // Quién somos en el copiar de WhatsApp: quien se parece a quien lo apuntó; si no, quien habla primero.
  const names = [...new Set(bubbles.filter((b) => b.us === null).map((b) => b.who))];
  const mine = me ? tokens(me) : [];
  const us = names.find((n) => tokens(n).some((t) => mine.includes(t))) ?? names[0];
  return { summary, bubbles: bubbles.map((b) => ({ ...b, us: b.us ?? b.who === us })) };
}
