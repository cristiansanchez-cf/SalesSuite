/**
 * Puntuación por reglas, de momento (docs/LEADS.md §Puntuación). Encaje (tipo, tamaño, email, zona) e intención
 * (urgencia, botón, página, repetir). Encaje alto e intención alta → «hot»: a Cristian en minutos. Encaje bajo → «low».
 * Cada regla deja su motivo en `detail` para que se entienda por qué.
 */
import type { LeadType } from './contract';
import type { EmailKind } from './normalize';

export type Band = 'hot' | 'normal' | 'low';
export interface Score { score: number; fit: number; intent: number; band: Band; detail: string[] }

const TYPE_FIT: Record<LeadType, number> = { venue: 30, festival: 30, wedding_partner: 25, custom_dev: 25, wedding: 20, dj: 15, general: 15, waitlist: 5 };

export function scoreLead(i: { type: LeadType; fields: Record<string, string>; emailKind: EmailKind; message: string | null; ctaId: string | null; pagePath: string | null; submissions: number; now: Date }): Score {
  const detail: string[] = [];
  let fit = 0, intent = 0;
  const add = (to: 'fit' | 'intent', n: number, why: string) => { if (to === 'fit') fit += n; else intent += n; detail.push(`${n > 0 ? '+' : ''}${n} ${why}`); };

  const type = i.type === 'general' && i.fields.event_type && i.fields.event_type in TYPE_FIT ? (i.fields.event_type as LeadType) : i.type;
  add('fit', TYPE_FIT[type], `tipo ${type}`);
  const att = i.fields.attendees;
  if (att === '>10000') add('fit', 20, 'más de 10.000 asistentes');
  else if (att === '2000-10000') add('fit', 15, '2.000-10.000 asistentes');
  else if (att === '500-2000') add('fit', 10, '500-2.000 asistentes');
  const guests = Number.parseInt(i.fields.guests ?? '', 10);
  if (guests >= 150) add('fit', 10, `${guests} invitados`);
  else if (guests >= 80) add('fit', 5, `${guests} invitados`);
  const budget = i.fields.budget;
  if (budget === '>50k') add('fit', 20, 'presupuesto >50k');
  else if (budget === '15k-50k') add('fit', 15, 'presupuesto 15k-50k');
  else if (budget === '5k-15k') add('fit', 8, 'presupuesto 5k-15k');
  if (i.emailKind === 'business') add('fit', 10, 'email de empresa');
  else if (i.emailKind === 'role') add('fit', 5, 'email genérico de empresa');
  else if (i.emailKind === 'disposable') add('fit', -20, 'email desechable');
  if (i.fields.city || i.fields.venue_name || i.fields.company) add('fit', 5, 'sabemos quién es o dónde');

  if (i.fields.wedding_date) {
    const days = (Date.parse(`${i.fields.wedding_date}T12:00:00Z`) - i.now.getTime()) / 86_400_000;
    if (days >= 0 && days <= 120) add('intent', 20, 'boda en menos de 4 meses');
    else if (days > 120 && days <= 365) add('intent', 10, 'boda este año');
  }
  if ((i.message ?? '').trim().length >= 40) add('intent', 10, 'mensaje con detalle');
  if (/demo|book|reserv|pricing|precio|contact/i.test(i.ctaId ?? '')) add('intent', 10, 'botón de contacto o precio');
  if (/precio|pricing|tarifa|contact/i.test(i.pagePath ?? '')) add('intent', 5, 'página de precios o contacto');
  if (i.submissions > 1) add('intent', 10, 'vuelve a escribir');

  const band: Band = fit >= 35 && intent >= 15 ? 'hot' : fit < 20 ? 'low' : 'normal';
  return { score: fit + intent, fit, intent, band, detail };
}
