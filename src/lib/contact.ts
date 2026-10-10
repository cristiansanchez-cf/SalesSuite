import type { Brand } from './brand';
import { proposalText } from './i18n/messages/proposal';

/** Canales con los que alguien puede dejar su contacto en sus propuestas (users.contact_channel). */
export const CONTACT_CHANNELS = ['whatsapp', 'kakao', 'line', 'telegram', 'instagram', 'phone', 'email'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
/** Nombre del canal (igual en todos los idiomas: son marcas, salvo teléfono y email, que traduce quien lo pinta). */
export const CHANNEL_NAME: Record<ContactChannel, string> = { whatsapp: 'WhatsApp', kakao: 'KakaoTalk', line: 'LINE', telegram: 'Telegram', instagram: 'Instagram', phone: 'Tel.', email: 'Email' };

/** Contacto de quien hace la propuesta. */
export interface RepContact { name: string; channel: ContactChannel; value: string }

export interface ContactLink { kind: 'whatsapp' | 'email' | 'phone' | 'website' | ContactChannel; href: string | null; label: string; cta: string; external: boolean; rep?: boolean }

const digits = (v: string) => v.replace(/[^\d]/g, '');
const handle = (v: string) => v.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//i, '').replace(/[/?#].*$/, '');
const host = (v: string) => { try { return /^https:\/\//i.test(v.trim()) ? new URL(v.trim()).hostname : null; } catch { return null; } };

/**
 * Enlace del contacto del comercial. Un número, un usuario o un enlace (lo que cada app da para compartirse). KakaoTalk
 * no tiene enlace a un ID personal: con enlace de chat abierto (open.kakao.com / pf.kakao.com) es botón; con ID, se
 * enseña el ID para que el cliente lo busque.
 */
export function repContactLink(c: RepContact, title: string, locale?: string | null): ContactLink | null {
  const v = c.value.trim();
  if (!v) return null;
  const t = proposalText(locale);
  const msg = encodeURIComponent(t.hello(title));
  const base = { kind: c.channel, cta: t.rep[c.channel], rep: true } as const;
  switch (c.channel) {
    case 'whatsapp': return digits(v).length >= 6 ? { ...base, href: `https://wa.me/${digits(v)}?text=${msg}`, label: v, external: true } : null;
    case 'kakao': return /(^|\.)kakao\.com$/i.test(host(v) ?? '')
      ? { ...base, href: v.trim(), label: 'KakaoTalk', external: true }
      : { ...base, href: null, label: `KakaoTalk ID: ${v}`, external: false };
    case 'line': return /(^|\.)line\.me$/i.test(host(v) ?? '') ? { ...base, href: v, label: 'LINE', external: true } : { ...base, href: `https://line.me/ti/p/~${encodeURIComponent(handle(v))}`, label: `LINE: ${v}`, external: true };
    case 'telegram': return { ...base, href: `https://t.me/${encodeURIComponent(handle(v))}`, label: `@${handle(v)}`, external: true };
    case 'instagram': return { ...base, href: `https://ig.me/m/${encodeURIComponent(handle(v))}`, label: `@${handle(v)}`, external: true };
    case 'phone': return digits(v).length >= 6 ? { ...base, href: `tel:${v.replace(/[^\d+]/g, '')}`, label: v, external: false } : null;
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { ...base, href: `mailto:${v}?subject=${encodeURIComponent(title)}`, label: v, external: false } : null;
  }
}

/**
 * Enlaces de contacto en orden de preferencia: primero el de quien hizo la propuesta (si lo ha puesto), después los
 * de la marca (WhatsApp primero). En coreano no se ofrece el WhatsApp de la marca: allí no se usa.
 */
export function contactLinks(brand: Brand, dossierTitle: string, locale?: string | null, rep?: RepContact | null): ContactLink[] {
  const c = brand.contact ?? {};
  // En el idioma de la propuesta (por defecto, español).
  const t = proposalText(locale);
  const msg = encodeURIComponent(t.hello(dossierTitle));
  const out: ContactLink[] = [];
  const mine = rep ? repContactLink(rep, dossierTitle, locale) : null;
  if (mine) out.push(mine);
  if (c.whatsapp && !(locale ?? '').startsWith('ko')) out.push({ kind: 'whatsapp', href: `https://wa.me/${c.whatsapp}?text=${msg}`, label: 'WhatsApp', cta: t.whatsapp, external: true });
  if (c.email) out.push({ kind: 'email', href: `mailto:${c.email}?subject=${encodeURIComponent(dossierTitle)}`, label: c.email, cta: t.email, external: false });
  if (c.phone) out.push({ kind: 'phone', href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, label: c.phone, cta: t.phone, external: false });
  if (c.website) out.push({ kind: 'website', href: c.website, label: c.website.replace(/^https:\/\//, ''), cta: t.web, external: true });
  return out;
}
