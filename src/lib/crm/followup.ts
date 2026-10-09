/**
 * Seguimiento (docs/CRM_DINAMICO.md §10): qué toca después de cada interacción. Una sola lógica, pura y probada.
 *
 * Regla del equipo (Cristian, 9-oct-2026):
 *  - Vías en orden: redes (Instagram, LinkedIn, WhatsApp) → teléfono → email → visita en persona.
 *  - Máximo 3 mensajes sin respuesta por persona; después, la siguiente persona de la empresa (hasta 3).
 *  - Si nadie contesta, visita en persona. El objetivo del primer contacto es conseguir una cita.
 *  - Si contesta o hay interés, el seguimiento lo decide el comercial (se propone uno, no se impone).
 */
export const CHANNELS = ['instagram', 'linkedin', 'whatsapp', 'phone', 'email', 'visit', 'meeting', 'other'] as const;
export type Channel = (typeof CHANNELS)[number];
export const OUTCOMES = ['no_reply', 'replied', 'interested', 'not_interested', 'meeting', 'note'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Orden de las vías para buscar a alguien. */
export const CHANNEL_ORDER: Channel[] = ['instagram', 'linkedin', 'whatsapp', 'phone', 'email', 'visit'];
export const MAX_ATTEMPTS = 3;
export const MAX_ACTORS = 3;
/** Días entre intentos sin respuesta. */
export const RETRY_DAYS = 2;

export interface Activity { id: string; accountId: string; contactId: string | null; userId: string | null; channel: Channel; outcome: Outcome; note: string | null; happenedAt: string }
export interface Reachable { instagram?: string | null; linkedin?: string | null; phone?: string | null; email?: string | null }
export interface Actor extends Reachable { id: string; name: string }

export type NextReason = 'first' | 'retry' | 'next_actor' | 'visit' | 'follow_up' | 'meeting' | 'closed';
export interface NextStep { contactId: string | null; channel: Channel | null; at: Date | null; reason: NextReason; attempt: number }

const DAY = 86_400_000;
/** A las 10:00 del día que toca (hora del servidor; los avisos van por día). */
const atDay = (from: Date, days: number) => { const d = new Date(from.getTime() + days * DAY); d.setHours(10, 0, 0, 0); return d; };

/** Vías por las que se puede buscar a alguien (las suyas y, si no tiene, las de la empresa). */
export function channelsFor(who: Reachable, company: Reachable = {}): Channel[] {
  const has = (k: keyof Reachable) => Boolean(who[k] || company[k]);
  const out: Channel[] = [];
  if (has('instagram')) out.push('instagram');
  if (has('linkedin')) out.push('linkedin');
  if (has('phone')) out.push('whatsapp', 'phone');
  if (has('email')) out.push('email');
  return out;
}

/** Intentos sin respuesta seguidos con esta persona (o con la empresa, si `contactId` es null), desde la última respuesta. */
export function unanswered(acts: Activity[], contactId: string | null): Activity[] {
  const mine = acts.filter((a) => a.contactId === contactId && a.outcome !== 'note').sort((a, b) => a.happenedAt.localeCompare(b.happenedAt));
  const out: Activity[] = [];
  for (const a of mine) { if (a.outcome === 'no_reply') out.push(a); else out.length = 0; }
  return out;
}

/** El próximo paso que propone la app después de lo que ha pasado. */
export function suggestNext(input: { activities: Activity[]; actors: Actor[]; company: Reachable; now: Date }): NextStep {
  const { activities, company, now } = input;
  const actors = input.actors.slice(0, MAX_ACTORS);
  const real = activities.filter((a) => a.outcome !== 'note').sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  const last = real[0];

  // Ya hay conversación: lo decide el comercial; se propone un seguimiento razonable.
  if (last && last.outcome === 'not_interested') return { contactId: last.contactId, channel: null, at: null, reason: 'closed', attempt: 0 };
  if (last && last.outcome === 'meeting') return { contactId: last.contactId, channel: 'meeting', at: atDay(now, 1), reason: 'meeting', attempt: 0 };
  if (last && (last.outcome === 'replied' || last.outcome === 'interested')) {
    return { contactId: last.contactId, channel: last.channel, at: atDay(now, RETRY_DAYS), reason: 'follow_up', attempt: 0 };
  }

  // A quién buscar: las personas de la empresa en orden (o la empresa si no hay nadie), hasta agotar sus 3 intentos.
  const who: Array<{ id: string | null; reach: Reachable }> = actors.length ? actors.map((a) => ({ id: a.id, reach: a })) : [{ id: null, reach: {} }];
  for (const w of who) {
    const tries = unanswered(activities, w.id);
    if (tries.length >= MAX_ATTEMPTS) continue;
    const ways = channelsFor(w.reach, company);
    if (!ways.length) continue;
    // La siguiente vía después de la última usada con esta persona (vuelve a empezar si se acaban).
    const lastWay = tries.at(-1)?.channel;
    const idx = lastWay ? (ways.indexOf(lastWay) + 1) % ways.length : 0;
    const reason: NextReason = !real.length ? 'first' : tries.length ? 'retry' : 'next_actor';
    return { contactId: w.id, channel: ways[idx], at: tries.length || real.length ? atDay(now, RETRY_DAYS) : atDay(now, 0), reason, attempt: tries.length + 1 };
  }
  // Aún no se ha intentado nada y no hay por dónde escribir: el primer contacto es en persona.
  if (!real.length) return { contactId: actors[0]?.id ?? null, channel: 'visit', at: atDay(now, 0), reason: 'first', attempt: 0 };
  // Nadie contesta: en persona.
  return { contactId: actors[0]?.id ?? null, channel: 'visit', at: atDay(now, RETRY_DAYS + 1), reason: 'visit', attempt: 0 };
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'later';
/** En qué parte de «Hoy» cae un próximo paso. */
export function dueBucket(at: string | Date | null, now: Date): DueBucket | null {
  if (!at) return null;
  const t = new Date(at).getTime();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const s = start.getTime();
  if (t < s) return 'overdue';
  if (t < s + DAY) return 'today';
  if (t < s + 2 * DAY) return 'tomorrow';
  return 'later';
}
