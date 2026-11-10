/**
 * El número del asistente (docs/ASSISTANT.md §Un número para todas las empresas): uno para toda la plataforma, al que
 * cada persona del equipo escribe desde su WhatsApp de trabajo. Si no está configurado, el asistente sigue en el número
 * de cada empresa, como antes.
 *
 *   ASSISTANT_WHATSAPP_PHONE_ID      el phone_number_id del número del asistente en Meta
 *   ASSISTANT_REMINDER_TEMPLATES     opcional: «es=nombre,en=nombre,fr=nombre» (por defecto, equipo_recordatorio_<idioma>)
 *   ASSISTANT_WHATSAPP_TOKEN         opcional: si el número está en otra cartera de Meta con su propio token
 *   ASSISTANT_WHATSAPP_APP_SECRET    opcional: si el número está en otra app de Meta (para comprobar la firma)
 */
import { env } from '../env';
import { cloudWhatsApp, type WhatsApp } from '../leads/whatsapp';

export type HubLocale = 'es' | 'en' | 'fr';
export interface HubConfig { phoneId: string; templates: Record<HubLocale, string> }

export function parseTemplates(raw: string | undefined): Record<HubLocale, string> {
  const t: Record<HubLocale, string> = { es: 'equipo_recordatorio_es', en: 'equipo_recordatorio_en', fr: 'equipo_recordatorio_fr' };
  for (const part of (raw ?? '').split(',')) {
    const [k, v] = part.split('=').map((x) => x?.trim() ?? '');
    if ((k === 'es' || k === 'en' || k === 'fr') && /^[a-z0-9_]{1,512}$/.test(v)) t[k] = v;
  }
  return t;
}

export function hubConfig(): HubConfig | null {
  const phoneId = env('ASSISTANT_WHATSAPP_PHONE_ID')?.trim();
  if (!phoneId || !/^\d{5,30}$/.test(phoneId)) return null;
  return { phoneId, templates: parseTemplates(env('ASSISTANT_REMINDER_TEMPLATES')) };
}

/** El cliente de WhatsApp del número del asistente: con su token si lo tiene; si no, el de la plataforma. */
export function hubWhatsApp(fallback: WhatsApp | null): WhatsApp | null {
  const token = env('ASSISTANT_WHATSAPP_TOKEN');
  return token ? cloudWhatsApp(token) : fallback;
}
