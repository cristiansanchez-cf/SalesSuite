/**
 * Normalización y antispam de la entrada (docs/LEADS.md §Entrada). Sin red: listas cortas y reglas, nada de servicios.
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

export type EmailKind = 'business' | 'free_webmail' | 'disposable' | 'role';

const FREE = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'hotmail.fr', 'outlook.com', 'outlook.es', 'outlook.fr', 'live.com', 'live.es', 'live.fr',
  'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.fr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.es', 'gmx.fr', 'gmx.net', 'gmx.de', 'yandex.com', 'mail.com', 'zoho.com', 'tutanota.com', 'orange.fr', 'free.fr', 'laposte.net',
  'sfr.fr', 'wanadoo.fr', 'neuf.fr', 'telefonica.net', 'movistar.es', 'terra.es', 'ono.com', 'web.de', 'libero.it', 'hey.com', 'fastmail.com',
]);
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mintemail.com', 'throwawaymail.com', 'fakeinbox.com',
  'mailnesia.com', 'tempail.com', 'emailondeck.com', 'moakt.com', 'mohmal.com', 'spamgourmet.com', 'burnermail.io', 'tempr.email', 'discard.email',
  'mailcatch.com', 'inboxkitten.com', 'mail.tm', 'tmpmail.org', 'tmail.ws', 'byom.de', 'trashmail.de', 'spambox.us', 'grr.la', 'emltmp.com',
]);
const ROLE = new Set(['info', 'hola', 'hello', 'contacto', 'contact', 'admin', 'administracion', 'office', 'oficina', 'ventas', 'sales', 'reservas',
  'booking', 'bookings', 'eventos', 'events', 'marketing', 'comercial', 'team', 'equipo', 'support', 'soporte', 'noreply', 'no-reply', 'mail', 'bodas']);

export function domainOf(email: string): string { return email.slice(email.lastIndexOf('@') + 1).toLowerCase(); }

export function emailKind(email: string): EmailKind {
  const d = domainOf(email);
  if (DISPOSABLE.has(d)) return 'disposable';
  const local = email.slice(0, email.lastIndexOf('@')).toLowerCase().replace(/\+.*$/, '');
  if (ROLE.has(local)) return 'role';
  if (FREE.has(d)) return 'free_webmail';
  return 'business';
}
/** El dominio de la cuenta (empresa): nunca el de un webmail gratuito ni desechable. */
export function accountDomain(email: string): string | null {
  const k = emailKind(email);
  return k === 'free_webmail' || k === 'disposable' ? null : domainOf(email);
}

const LOCALE_COUNTRY: Record<string, CountryCode> = { es: 'ES', fr: 'FR', en: 'GB', pt: 'PT', it: 'IT', de: 'DE' };
/** Teléfono → E.164. País: el que diga la web, si no el del idioma y si no España. null si no es un móvil o fijo válido. */
export function toE164(raw: string | null, opts: { country?: string | null; locale?: string } = {}): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (cleaned.replace(/\D/g, '').length < 6) return null;
  const country = (opts.country?.toUpperCase() as CountryCode | undefined) ?? LOCALE_COUNTRY[opts.locale ?? ''] ?? 'ES';
  const p = parsePhoneNumberFromString(cleaned, cleaned.startsWith('+') ? undefined : country);
  return p && p.isValid() ? p.number : null;
}

export interface SpamInput {
  email: string; name: string; message: string | null; timeToSubmitMs: number | null;
  recentByEmail: number; turnstile?: 'ok' | 'failed' | 'absent';
}
/**
 * Motivos para mandar a cuarentena. Nada se borra ni se contacta: lo revisa una persona. Sin motivos → entra normal.
 */
export function spamReasons(i: SpamInput): string[] {
  const r: string[] = [];
  if (i.timeToSubmitMs != null && i.timeToSubmitMs < 2500) r.push('too_fast');
  if (emailKind(i.email) === 'disposable') r.push('disposable_email');
  const links = (i.message ?? '').match(/https?:\/\/|www\.|\.(com|ru|cn|xyz|top)\b/gi)?.length ?? 0;
  if (links >= 3) r.push('many_links');
  if (i.name.trim().toLowerCase() === i.email.toLowerCase() || /https?:\/\//i.test(i.name)) r.push('odd_name');
  if (i.recentByEmail >= 3) r.push('too_many_by_email');
  if (i.turnstile === 'failed') r.push('turnstile_failed');
  return r;
}
