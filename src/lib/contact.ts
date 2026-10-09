import type { Brand } from './brand';
import { proposalText } from './i18n/messages/proposal';

export interface ContactLink { kind: 'whatsapp' | 'email' | 'phone' | 'website'; href: string; label: string; cta: string; external: boolean }

/** Enlaces de contacto en orden de preferencia comercial (WhatsApp primero). */
export function contactLinks(brand: Brand, dossierTitle: string, locale?: string | null): ContactLink[] {
  const c = brand.contact ?? {};
  // En el idioma de la propuesta (por defecto, español).
  const t = proposalText(locale);
  const msg = encodeURIComponent(t.hello(dossierTitle));
  const out: ContactLink[] = [];
  if (c.whatsapp) out.push({ kind: 'whatsapp', href: `https://wa.me/${c.whatsapp}?text=${msg}`, label: 'WhatsApp', cta: t.whatsapp, external: true });
  if (c.email) out.push({ kind: 'email', href: `mailto:${c.email}?subject=${encodeURIComponent(dossierTitle)}`, label: c.email, cta: t.email, external: false });
  if (c.phone) out.push({ kind: 'phone', href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, label: c.phone, cta: t.phone, external: false });
  if (c.website) out.push({ kind: 'website', href: c.website, label: c.website.replace(/^https:\/\//, ''), cta: t.web, external: true });
  return out;
}
