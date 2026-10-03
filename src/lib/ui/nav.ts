/**
 * Navegación de la consola: dos mundos y un conmutador (guía de consolas §7).
 *  - Vender: lo que hace cualquier vendedor cada día.
 *  - Configurar: lo que prepara el CEO o líder (solo admins).
 * Ningún item aparece o desaparece por permisos dentro de un mismo menú: cambia el mundo entero.
 */
import type { Role } from '../admin/types';
import type { IconName } from './icons';

export interface NavItem { href: string; label: string; icon: IconName; on: boolean; count?: number; testid?: string }
export type NavMode = 'sell' | 'setup';

const SETUP_PREFIXES = ['/admin/setup', '/admin/playbook', '/admin/catalog', '/admin/team', '/admin/brand'];

export function navFor(role: Role, path: string, counts: { pendingPlaybook?: number } = {}) {
  const on = (p: string) => path === p || path.startsWith(`${p}/`);
  const mode: NavMode = role === 'admin' && SETUP_PREFIXES.some(on) ? 'setup' : 'sell';
  const sell: NavItem[] = [
    role === 'partner'
      ? { href: '/admin', label: 'Mis cuentas', icon: 'store', on: path === '/admin' || on('/admin/dossiers') }
      : { href: '/admin', label: 'Dossiers', icon: 'file-text', on: path === '/admin' || on('/admin/dossiers') },
    { href: '/admin/compose', label: 'Preparar mensaje', icon: 'message-square-text', on: on('/admin/compose') },
    { href: '/admin/wins', label: 'Qué ha funcionado', icon: 'trophy', on: on('/admin/wins') },
    { href: '/admin/learn', label: 'Aprende', icon: 'graduation-cap', on: on('/admin/learn') },
  ];
  const setup: NavItem[] = [
    { href: '/admin/setup', label: 'Configuración guiada', icon: 'wand-sparkles', on: on('/admin/setup') },
    { href: '/admin/playbook', label: 'Playbook y mercado', icon: 'book-open', on: on('/admin/playbook'), count: counts.pendingPlaybook || undefined },
    { href: '/admin/catalog', label: 'Catálogo', icon: 'boxes', on: on('/admin/catalog') },
    { href: '/admin/team', label: 'Equipo', icon: 'users', on: on('/admin/team') },
    { href: '/admin/brand', label: 'Marca', icon: 'palette', on: on('/admin/brand') },
  ];
  return {
    mode,
    canSwitch: role === 'admin',
    modes: [
      { key: 'sell' as const, label: 'Vender', href: '/admin', icon: 'target' as IconName },
      { key: 'setup' as const, label: 'Configurar', href: '/admin/setup', icon: 'settings' as IconName },
    ],
    items: mode === 'setup' ? setup : sell,
  };
}
