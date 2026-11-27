/**
 * «Tu CRM en marcha» (docs/ARRANCA.md): las formas de meter lo que ya tienes sin dar de alta una a una, y de que entre
 * solo. Cada persona ve las que puede usar (subir un CSV o conectar la web, solo un admin). Puro: la página decide los
 * permisos y el enlace del asistente; esto, qué sale y adónde lleva.
 */
import type { IconName } from './ui/icons';

export type WayKey = 'csv' | 'notion' | 'ai' | 'notes' | 'whatsapp' | 'fab' | 'web' | 'waLeads' | 'team';
export interface Way { key: WayKey; href: string; icon: IconName; external?: boolean; setup?: boolean }

export function ways(o: { importCrm: boolean; manageTenant: boolean; useAccounts: boolean; waLink: string | null; hasPhone: boolean }): { bulk: Way[]; daily: Way[]; alone: Way[] } {
  const bulk: Way[] = [];
  if (o.importCrm) bulk.push({ key: 'csv', href: '/admin/import', icon: 'upload' }, { key: 'notion', href: '/admin/import/notion', icon: 'file-text' });
  if (o.useAccounts) bulk.push({ key: 'ai', href: '/admin/ia', icon: 'brain' }, { key: 'notes', href: '/admin/accounts/apuntar', icon: 'mic' });
  const daily: Way[] = [];
  if (o.useAccounts) {
    // Sin móvil en su cuenta, el asistente no le reconoce: primero, ponerlo.
    daily.push(o.hasPhone && o.waLink
      ? { key: 'whatsapp', href: o.waLink, icon: 'whatsapp', external: true }
      : { key: 'whatsapp', href: '/admin/account#asistente', icon: 'whatsapp', setup: true });
    daily.push({ key: 'fab', href: '/admin/accounts/apuntar', icon: 'sparkles' });
  }
  const alone: Way[] = o.manageTenant ? [
    { key: 'web', href: '/admin/leads/configurar', icon: 'globe' },
    { key: 'waLeads', href: '/admin/leads/configurar?abrir=whatsapp', icon: 'message-square-text' },
    { key: 'team', href: '/admin/team', icon: 'users' },
  ] : [];
  return { bulk, daily, alone };
}

/** Pocas empresas en el CRM: todavía merece la pena recordarle que puede meterlas de golpe. */
export const FEW_ACCOUNTS = 10;
