/**
 * A qué número escribe el equipo para hablar con el asistente (Mi cuenta → Tu asistente; Configurar → Asistente).
 *  - hub:    el número común de la plataforma (ASSISTANT_WHATSAPP_PHONE_ID), para todas las empresas.
 *  - tenant: el número de WhatsApp de la empresa (Leads entrantes → WhatsApp), como antes.
 *  - off:    todavía no hay ninguno.
 * El número que se enseña se pide a Meta (display_phone_number) y se guarda una hora; ASSISTANT_WHATSAPP_NUMBER lo fija
 * a mano para el común.
 */
import { env } from '../env';
import type { LeadSettings } from '../leads/types';
import { hubConfig } from './hub-config';

export interface AssistantContact {
  mode: 'hub' | 'tenant' | 'off';
  /** Como lo enseña WhatsApp («+34 694 90 41 49»), o null si no se ha podido saber. */
  number: string | null;
  /** Enlace para abrir el chat en WhatsApp con un «Hola» escrito. */
  waLink: string | null;
  /** La plantilla del recordatorio de la mañana (en español) y si la empresa la tiene puesta. */
  reminder: { template: string | null; byPlatform: boolean };
}

const GRAPH = 'https://graph.facebook.com/v25.0';
const cache = new Map<string, { at: number; v: string | null }>();
const HOUR = 3_600_000;

/** El número visible de un phone_number_id de Meta. */
export async function displayNumber(phoneId: string, token: string | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  if (!token || !/^\d{5,30}$/.test(phoneId)) return null;
  const hit = cache.get(phoneId);
  if (hit && now - hit.at < HOUR) return hit.v;
  let v: string | null = null;
  try {
    const r = await fetchImpl(`${GRAPH}/${phoneId}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2500) });
    if (r.ok) v = ((await r.json()) as { display_phone_number?: string }).display_phone_number?.trim() || null;
  } catch { v = null; }
  cache.set(phoneId, { at: now, v });
  return v;
}
export const clearNumberCache = () => cache.clear();

export const waLinkFor = (number: string | null, text = 'Hola') => {
  const d = (number ?? '').replace(/\D/g, '');
  return d.length >= 6 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
};

/** ¿Es el mismo teléfono? (lo que pone en Mi cuenta frente al número del asistente; con o sin prefijo). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').replace(/\D/g, ''), y = (b ?? '').replace(/\D/g, '');
  if (x.length < 6 || y.length < 6) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

export async function assistantContact(settings: LeadSettings | null, o: { demo: boolean; fetchImpl?: typeof fetch }): Promise<AssistantContact> {
  if (o.demo) {
    const number = '+34 600 00 00 00';
    return { mode: 'tenant', number, waLink: waLinkFor(number), reminder: { template: settings?.whatsappTemplates?.reminder?.es ?? null, byPlatform: false } };
  }
  const hub = hubConfig();
  if (hub) {
    const number = env('ASSISTANT_WHATSAPP_NUMBER')?.trim() || await displayNumber(hub.phoneId, env('ASSISTANT_WHATSAPP_TOKEN') ?? env('WHATSAPP_TOKEN'), o.fetchImpl);
    return { mode: 'hub', number, waLink: waLinkFor(number), reminder: { template: hub.templates.es, byPlatform: true } };
  }
  const phoneId = settings?.whatsappPhoneId;
  if (phoneId && env('WHATSAPP_TOKEN')) {
    const number = await displayNumber(phoneId, env('WHATSAPP_TOKEN'), o.fetchImpl);
    return { mode: 'tenant', number, waLink: waLinkFor(number), reminder: { template: settings?.whatsappTemplates?.reminder?.es ?? null, byPlatform: false } };
  }
  return { mode: 'off', number: null, waLink: null, reminder: { template: null, byPlatform: false } };
}
