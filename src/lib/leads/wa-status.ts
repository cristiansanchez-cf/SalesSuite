/**
 * ¿Este espacio tiene su WhatsApp conectado con nosotros? (docs/LEADS.md §2f). Una sola regla para todo lo que promete
 * un WhatsApp (la web, el email al lead, el aviso, la ficha, la bandeja, el asistente y el MCP): si no se cumple, en
 * ningún sitio se dice que le va a salir un WhatsApp. Conectado = nuestra clave de Meta en el servidor, su número
 * conectado (Ajustes → WhatsApp a los leads), la plantilla del primer mensaje puesta y el envío encendido.
 */
import { env } from '../env';
import { appMode } from '../mode';
import { local, firstSendAt } from './schedule';
import type { LeadSettings } from './types';

export type WaGap = 'token' | 'phone' | 'template' | 'off';
const tpl = (s: LeadSettings, locale?: string) => {
  const wa1 = s.whatsappTemplates?.wa1 ?? {};
  if (!locale) return Object.values(wa1).some(Boolean);
  const l = ['es', 'en', 'fr'].includes(locale.slice(0, 2)) ? locale.slice(0, 2) : 'en';
  return !!wa1[l];
};

/** La clave de Meta de la plataforma está en el servidor (en la demo, el WhatsApp de mentira cuenta como conectado). */
export function waTokenReady(): boolean {
  return !!env('WHATSAPP_TOKEN') || appMode() === 'demo';
}

/** Lo que le falta para estar conectado (vacío = conectado). */
export function waGaps(s: LeadSettings | null | undefined, tokenReady: boolean): WaGap[] {
  const out: WaGap[] = [];
  if (!tokenReady) out.push('token');
  if (!s?.whatsappPhoneId) out.push('phone');
  if (!s || !tpl(s)) out.push('template');
  if (!s?.whatsappEnabled) out.push('off');
  return out;
}

export function waConnected(s: LeadSettings | null | undefined, tokenReady: boolean, locale?: string): boolean {
  return !!s && waGaps(s, tokenReady).length === 0 && tpl(s, locale);
}

/** Minutos tras validar hasta el primer WhatsApp (Ajustes; por defecto 5). */
export function waDelay(s: LeadSettings | null | undefined): number {
  const n = Math.round(Number(s?.waDelayMinutes ?? 5));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 120) : 5;
}

/**
 * Cuándo sale el primer WhatsApp de un lead que se acaba de validar: a los minutos de Ajustes si cae en el horario de
 * envío; si no, al abrir el horario (como el primer envío automático). Devuelve también si sale «en minutos».
 */
export function afterValidationAt(now: Date, s: LeadSettings): { at: Date; soon: boolean } {
  const at = new Date(now.getTime() + waDelay(s) * 60_000);
  const l = local(at, s.timezone);
  if (l.h >= s.sendFromHour && l.h < s.sendToHour && !(s.holidays ?? []).includes(l.ymd)) return { at, soon: true };
  return { at: firstSendAt(at, s, 0).at, soon: false };
}
