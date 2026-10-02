import type { Brand } from './brand';

export interface ContactLink { kind: 'whatsapp' | 'email' | 'phone' | 'website'; href: string; label: string; cta: string; external: boolean }

/** Enlaces de contacto en orden de preferencia comercial (WhatsApp primero). */
export function contactLinks(brand: Brand, dossierTitle: string): ContactLink[] {
  const c = brand.contact ?? {};
  const msg = encodeURIComponent(`Hola, os escribo por la propuesta «${dossierTitle}».`);
  const out: ContactLink[] = [];
  if (c.whatsapp) out.push({ kind: 'whatsapp', href: `https://wa.me/${c.whatsapp}?text=${msg}`, label: 'WhatsApp', cta: 'Hablemos por WhatsApp', external: true });
  if (c.email) out.push({ kind: 'email', href: `mailto:${c.email}?subject=${encodeURIComponent(dossierTitle)}`, label: c.email, cta: 'Escríbenos', external: false });
  if (c.phone) out.push({ kind: 'phone', href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, label: c.phone, cta: 'Llámanos', external: false });
  if (c.website) out.push({ kind: 'website', href: c.website, label: c.website.replace(/^https:\/\//, ''), cta: 'Web', external: true });
  return out;
}
