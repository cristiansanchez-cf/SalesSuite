/**
 * Navegación de la consola: dos mundos y un conmutador (guía de consolas §7).
 *  - Vender: lo que hace cualquier vendedor cada día.
 *  - Configurar: lo que prepara el CEO o líder (solo admins).
 * Ningún item aparece o desaparece por permisos dentro de un mismo menú: cambia el mundo entero.
 */
import type { Role } from '../admin/types';
import type { IconName } from './icons';
import { can } from '../admin/permissions';
import { shellMessages } from '../i18n/messages/shell';

export interface NavItem { href: string; label: string; icon: IconName; on: boolean; count?: number; testid?: string }
export type NavMode = 'sell' | 'setup';

const SETUP_PREFIXES = ['/admin/setup', '/admin/playbook', '/admin/catalog', '/admin/team', '/admin/territory', '/admin/commissions/team', '/admin/prices', '/admin/brand'];

export function navFor(role: Role, path: string, counts: { pendingPlaybook?: number } = {}, L = shellMessages.es.nav) {
  const on = (p: string) => path === p || path.startsWith(`${p}/`);
  const perms = can(role);
  const mode: NavMode = perms.configure && SETUP_PREFIXES.some(on) ? 'setup' : 'sell';
  const sell: NavItem[] = [
    { href: '/admin/start', label: L.start, icon: 'compass', on: on('/admin/start'), testid: 'nav-start' },
    ...(role !== 'partner' ? [{ href: '/admin/inicio', label: L.home, icon: 'gauge' as IconName, on: on('/admin/inicio') }] : []),
    role === 'partner'
      ? { href: '/admin', label: L.myAccounts, icon: 'store', on: path === '/admin' || (on('/admin/dossiers') && !path.endsWith('/analytics')) }
      : { href: '/admin', label: L.dossiers, icon: 'file-text', on: path === '/admin' || (on('/admin/dossiers') && !path.endsWith('/analytics')) },
    ...(perms.useAccounts ? [{ href: '/admin/accounts', label: L.accounts, icon: 'map-pin' as IconName, on: on('/admin/accounts') }] : []),
    { href: '/admin/compose', label: L.compose, icon: 'message-square-text', on: on('/admin/compose') },
    { href: '/admin/analytics', label: L.analytics, icon: 'chart-column', on: on('/admin/analytics') || /\/admin\/dossiers\/[^/]+\/analytics$/.test(path), testid: 'nav-analytics' },
    { href: '/admin/wins', label: L.wins, icon: 'trophy', on: on('/admin/wins') },
    { href: '/admin/learn', label: L.learn, icon: 'graduation-cap', on: on('/admin/learn') },
    { href: '/admin/commissions', label: L.myCommissions, icon: 'wallet', on: path === '/admin/commissions' },
  ];
  const setup: NavItem[] = [
    { href: '/admin/setup', label: L.setup, icon: 'wand-sparkles', on: on('/admin/setup') },
    { href: '/admin/playbook', label: L.playbook, icon: 'book-open', on: on('/admin/playbook'), count: counts.pendingPlaybook || undefined },
    ...(perms.manageTenant ? [{ href: '/admin/catalog', label: L.catalog, icon: 'boxes' as IconName, on: on('/admin/catalog') }] : []),
    { href: '/admin/team', label: L.team, icon: 'users', on: on('/admin/team') },
    ...(perms.manageAccounts ? [{ href: '/admin/territory', label: L.territory, icon: 'map' as IconName, on: on('/admin/territory') }] : []),
    { href: '/admin/commissions/team', label: L.commissions, icon: 'wallet', on: on('/admin/commissions/team') },
    ...(perms.manageTenant ? [{ href: '/admin/prices', label: L.prices, icon: 'tag' as IconName, on: on('/admin/prices'), testid: 'nav-prices' }] : []),
    ...(perms.manageTenant ? [{ href: '/admin/brand', label: L.brand, icon: 'palette' as IconName, on: on('/admin/brand') }] : []),
  ];
  return {
    mode,
    canSwitch: perms.configure,
    modes: [
      { key: 'sell' as const, label: L.sell, href: '/admin', icon: 'target' as IconName },
      { key: 'setup' as const, label: L.configure, href: '/admin/setup', icon: 'settings' as IconName },
    ],
    items: mode === 'setup' ? setup : sell,
  };
}
