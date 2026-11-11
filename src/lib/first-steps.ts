/**
 * Primeros pasos en Inicio (docs/PLAN_AJUSTES.md, paso 7): una lista corta que se tacha sola y desaparece al acabar.
 *  - Admin: la empresa, la marca, el equipo, los leads entrantes y el asistente de WhatsApp.
 *  - Quien vende: su móvil, escribir al asistente y su primera propuesta.
 * Puro: la página reúne los datos y esto decide qué está hecho y adónde lleva cada paso.
 */
export type AdminStep = 'company' | 'brand' | 'team' | 'leads' | 'assistant';
export type RepStep = 'phone' | 'assistant' | 'proposal';
export interface FirstStep<K extends string> { key: K; done: boolean; href: string; external?: boolean }

export interface AdminFacts { segments: number; hasLogo: boolean; members: number; leadsReady: boolean; assistantOn: boolean }
export interface RepFacts { hasPhone: boolean; talkedToAssistant: boolean; assistantLink: string | null; proposals: number }

export function adminSteps(f: AdminFacts): FirstStep<AdminStep>[] {
  return [
    { key: 'company', done: f.segments > 0, href: '/admin/setup' },
    { key: 'brand', done: f.hasLogo, href: '/admin/brand' },
    { key: 'team', done: f.members > 1, href: '/admin/team' },
    { key: 'leads', done: f.leadsReady, href: '/admin/leads/configurar' },
    { key: 'assistant', done: f.assistantOn, href: '/admin/asistente' },
  ];
}

export function repSteps(f: RepFacts): FirstStep<RepStep>[] {
  return [
    { key: 'phone', done: f.hasPhone, href: '/admin/account#asistente' },
    // Sin móvil, el asistente no le reconoce: el enlace a WhatsApp solo cuando ya lo tiene.
    { key: 'assistant', done: f.talkedToAssistant, href: f.hasPhone && f.assistantLink ? f.assistantLink : '/admin/account#asistente', external: f.hasPhone && !!f.assistantLink },
    { key: 'proposal', done: f.proposals > 0, href: '/admin#nuevo' },
  ];
}

export const progressOf = (s: { done: boolean }[]) => ({ done: s.filter((x) => x.done).length, total: s.length, finished: s.every((x) => x.done) });
