/**
 * Paso guiado «WhatsApp a los leads» (docs/PLAN_AJUSTES.md, paso 6): lo que hay que crear en Meta y comprobar que está.
 *  - templateGuide: cada plantilla (nombre sugerido, idioma de Meta, categoría, texto y ejemplos) sale de lo mismo que
 *    se manda (templates.ts), para que lo aprobado coincida con lo enviado.
 *  - checkPhone: si nuestro token llega al número (si no, no han compartido la cuenta con la plataforma).
 *  - subscribeApp: conecta la app a la cuenta de WhatsApp para que lleguen los mensajes (lo que hicimos a mano con Enjoy).
 */
import { waBody, waParams } from './templates';
import type { LeadTemplates } from './types';
import { META_LANG } from './whatsapp';

export type WaStep = 'wa1' | 'wa2' | 'reminder';
export type WaLocale = 'es' | 'en' | 'fr';
export interface TemplateGuide { step: WaStep; locale: WaLocale; name: string; language: string; category: 'Utility'; body: string; examples: string[]; buttons: string[] }

export const suggestedName = (step: WaStep, l: WaLocale) => `${step === 'wa1' ? 'lead_hola' : step === 'wa2' ? 'lead_recordatorio' : 'equipo_recordatorio'}_${l}`;

/** El recordatorio de la mañana al equipo (docs/ASSISTANT.md §Recordatorios), con sus dos botones. */
const REMINDER: Record<WaLocale, { body: string; buttons: string[]; examples: string[] }> = {
  es: { body: 'Hola {{1}}, hoy tienes {{2}} seguimientos pendientes en el CRM: {{3}}. ¿Te preparo una propuesta de mensaje para cada uno?', buttons: ['Sí, prepáralos', 'Más tarde'], examples: ['Marta', '3', 'Club Sol, Sala Marina y 1 más'] },
  en: { body: 'Hi {{1}}, you have {{2}} follow-ups due in the CRM today: {{3}}. Shall I draft a message for each one?', buttons: ['Yes, draft them', 'Later'], examples: ['Marta', '3', 'Club Sol, Sala Marina and 1 more'] },
  fr: { body: "Bonjour {{1}}, vous avez {{2}} relances à faire aujourd'hui dans le CRM : {{3}}. Je vous propose un message pour chacune ?", buttons: ['Oui, prépare-les', 'Plus tard'], examples: ['Marta', '3', 'Club Sol, Sala Marina et 1 de plus'] },
};
const SAMPLE = { name: 'Laura Gómez', type: 'venue' as const, fields: { venue_name: 'Sala Ejemplo', city: 'Valencia' } };

export function templateGuide(step: WaStep, l: WaLocale, o: { signer: string; brand: string; custom?: LeadTemplates; booking?: string | null }): TemplateGuide {
  const base = { step, locale: l, name: suggestedName(step, l), language: META_LANG[l] ?? 'en', category: 'Utility' as const };
  if (step === 'reminder') return { ...base, ...REMINDER[l] };
  return {
    ...base,
    body: waBody(step, l, o.signer, o.brand, o.custom),
    examples: waParams(step, { ...SAMPLE, locale: l, bookingUrl: o.booking ?? 'https://cal.com/tu-empresa', videoUrl: null, custom: o.custom }),
    buttons: [],
  };
}

const GRAPH = 'https://graph.facebook.com/v25.0';
export type PhoneCheck = { ok: true; number: string | null; name: string | null; quality: string | null } | { ok: false; error: 'no_token' | 'no_access' | 'network' };

/** ¿Llega nuestro token a ese número? Devuelve cómo se ve (número, nombre verificado, calidad). */
export async function checkPhone(phoneId: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<PhoneCheck> {
  if (!token) return { ok: false, error: 'no_token' };
  try {
    const r = await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { ok: false, error: r.status >= 500 ? 'network' : 'no_access' };
    const d = (await r.json()) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
    return { ok: true, number: d.display_phone_number ?? null, name: d.verified_name ?? null, quality: d.quality_rating ?? null };
  } catch { return { ok: false, error: 'network' }; }
}

/** Conecta nuestra app a su cuenta de WhatsApp (POST /{waba}/subscribed_apps): sin esto, Meta no avisa de los mensajes. */
export async function subscribeApp(wabaId: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!token || !/^\d{5,30}$/.test(wabaId)) return false;
  try {
    const r = await fetchImpl(`${GRAPH}/${wabaId}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    return r.ok && ((await r.json()) as { success?: boolean }).success === true;
  } catch { return false; }
}
