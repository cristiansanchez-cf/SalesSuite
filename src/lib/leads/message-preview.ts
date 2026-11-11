/**
 * Vista previa de los mensajes con un lead de ejemplo (Leads entrantes → Tus mensajes). Puro: lo usa el servidor para la
 * primera vista y el navegador para actualizarla mientras se escribe.
 */
import { autoreplyEmail, waParams, waPreview } from './templates';
import type { EmailSignature, EmailStyle, LeadTemplates } from './types';

export type PreviewLocale = 'es' | 'en' | 'fr';
export interface PreviewCtx {
  signer: string;
  brand: string;
  signature?: EmailSignature;
  style?: EmailStyle;
  /** Enlace de reserva y vídeo del lead de ejemplo, por idioma. */
  media: Record<PreviewLocale, { booking: string | null; video: string | null }>;
}
export const SAMPLE_LEAD = { name: 'Laura Gómez', type: 'venue' as const, fields: { venue_name: 'Sala Ejemplo', city: 'Valencia' } };

export function previewFor(l: PreviewLocale, custom: LeadTemplates, ctx: PreviewCtx) {
  const m = ctx.media[l];
  const base = { ...SAMPLE_LEAD, locale: l, bookingUrl: m.booking, videoUrl: m.video, custom };
  const mail = autoreplyEmail({ ...base, signer: ctx.signer, brand: ctx.brand, channel: 'whatsapp', eta: 'minutes', unsubscribeUrl: null, signature: ctx.signature, style: ctx.style });
  return {
    subject: mail.subject,
    html: mail.html,
    wa1: waPreview('wa1', l, ctx.signer, ctx.brand, waParams('wa1', base), custom),
    wa2: waPreview('wa2', l, ctx.signer, ctx.brand, waParams('wa2', { ...base, bookingUrl: m.booking ?? 'https://…' }), custom),
  };
}
