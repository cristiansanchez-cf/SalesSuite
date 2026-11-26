/**
 * La conversación de un lead fuera de su ficha (criterio de Cristian, 26-nov-2026: «el lead y el CRM tienen que vivir
 * juntos»). Lo que escribió en la web y lo que se ha hablado por WhatsApp, en burbujas para la ficha de la persona y de
 * su empresa, y como chat copiado de WhatsApp para «Pasar a la empresa con IA» (Apuntar lo lee igual que uno pegado).
 */
import type { Bubble } from '../crm/convo';
import type { LeadEvent } from './types';

interface Said { at: string; us: boolean; auto: boolean; text: string }

/** Lo dicho, en orden: el mensaje de la web, lo que contesta él y lo que se le escribe (a mano o automático). */
export function leadSaid(events: LeadEvent[]): Said[] {
  const out: Said[] = [];
  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    const text = typeof d.text === 'string' ? d.text.trim() : '';
    if (e.kind === 'submission' && typeof d.message === 'string' && d.message.trim()) out.push({ at: e.at, us: false, auto: false, text: d.message.trim() });
    else if (e.kind === 'message_in' && text) out.push({ at: e.at, us: false, auto: false, text });
    // Los automáticos con texto (WhatsApp 1 y 2); el email de confirmación no lleva el texto en el historial.
    else if (e.kind === 'message_out' && text && d.status !== 'failed') out.push({ at: e.at, us: true, auto: !d.manual, text });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

const stamp = (iso: string, locale: string, timeZone: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso));

export function leadBubbles(events: LeadEvent[], o: { them: string; auto: string; locale: string; timeZone?: string }): Bubble[] {
  const tz = o.timeZone ?? 'Europe/Madrid';
  return leadSaid(events).map((x) => ({ who: x.us ? (x.auto ? o.auto : '') : o.them, us: x.us, time: stamp(x.at, o.locale, tz), text: x.text }));
}

/**
 * Para Apuntar: quién es, qué pidió y la conversación como un chat copiado de WhatsApp («[23/11/2026, 17:48] Ignacio:
 * …»), con nuestro lado a nombre de quien apunta (así la ficha sabe qué burbujas son nuestras).
 */
export function leadTranscript(x: { name: string; intro: string; events: LeadEvent[]; me: string; autoTag: string; timeZone?: string }): string {
  const tz = x.timeZone ?? 'Europe/Madrid';
  const f = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  const when = (iso: string) => {
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((q) => [q.type, q.value]));
    return `[${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}]`;
  };
  const me = x.me.replace(/[:\n]/g, ' ').trim() || 'Yo';
  const them = x.name.replace(/[:\n]/g, ' ').trim() || 'Cliente';
  const lines = leadSaid(x.events).map((s) => `${when(s.at)} ${s.us ? me : them}: ${s.auto ? `${x.autoTag} ` : ''}${s.text.replace(/\s*\n\s*/g, ' ')}`);
  return [x.intro.trim(), lines.join('\n')].filter(Boolean).join('\n\n').slice(0, 12000);
}
