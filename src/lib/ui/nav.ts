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

/**
 * Menú corto (5 + 5, docs/CRM_DINAMICO.md §8): cada destino agrupa páginas afines, que se recorren con las pestañas de
 * sección (sectionTabs) arriba de la página. Ninguna página ni dirección desaparece: solo cambia desde dónde se llega.
 */
interface Group { href: string; label: string; icon: IconName; testid?: string; count?: number; tabs: Array<{ href: string; label: string; testid?: string; exact?: boolean; show?: boolean }> }

function groups(role: Role, counts: { pendingPlaybook?: number; superadmin?: boolean }, L: typeof shellMessages.es.nav): { sell: Group[]; setup: Group[] } {
  const perms = can(role);
  const partner = role === 'partner';
  const sell: Group[] = [
    // Superadmin (docs/ORG.md): todos los espacios de la plataforma.
    ...(counts.superadmin ? [{ href: '/admin/platform', label: L.platform, icon: 'shield-check' as IconName, testid: 'nav-platform', tabs: [] }] : []),
    partner
      ? { href: '/admin/start', label: L.start, icon: 'compass' as IconName, testid: 'nav-start', tabs: [{ href: '/admin/start', label: L.start }, { href: '/admin/compose', label: L.compose }] }
      : { href: '/admin/inicio', label: L.home, icon: 'gauge' as IconName, testid: 'nav-home', tabs: [
        { href: '/admin/inicio', label: L.home }, { href: '/admin/start', label: L.start, testid: 'tab-start' }, { href: '/admin/compose', label: L.compose, testid: 'tab-compose' },
      ] },
    { href: '/admin', label: partner ? L.myAccounts : L.dossiers, icon: (partner ? 'store' : 'file-text') as IconName, testid: 'nav-dossiers', tabs: [
      { href: '/admin', label: partner ? L.myAccounts : L.dossiers, exact: true }, { href: '/admin/dossiers', label: '', show: false }, { href: '/admin/analytics', label: L.analytics, testid: 'tab-analytics' },
    ] },
    // CRM = empresas + personas. Importar y ordenar los datos va en Configurar (solo admin).
    ...(perms.useAccounts ? [{ href: '/admin/accounts', label: L.accounts, icon: 'map-pin' as IconName, testid: 'nav-accounts', tabs: [
      { href: '/admin/accounts', label: L.companies, testid: 'tab-companies' }, { href: '/admin/people', label: L.people, testid: 'tab-people' },
    ] }] : []),
    { href: '/admin/learn', label: L.learn, icon: 'graduation-cap', testid: 'nav-learn', tabs: [{ href: '/admin/learn', label: L.learn }, { href: '/admin/wins', label: L.wins, testid: 'tab-wins' }] },
    { href: '/admin/commissions', label: L.myCommissions, icon: 'wallet', testid: 'nav-my-commissions', tabs: [{ href: '/admin/commissions', label: L.myCommissions, exact: true }] },
  ];
  const setup: Group[] = [
    { href: '/admin/setup', label: L.company, icon: 'building2', testid: 'nav-company', tabs: [
      { href: '/admin/setup', label: L.setup }, { href: '/admin/brand', label: L.brand, show: perms.manageTenant },
    ] },
    { href: '/admin/playbook', label: L.playbook, icon: 'book-open', count: counts.pendingPlaybook || undefined, tabs: [] },
    ...(perms.manageTenant ? [{ href: '/admin/catalog', label: L.catalogPrices, icon: 'boxes' as IconName, testid: 'nav-catalog', tabs: [
      { href: '/admin/catalog', label: L.catalog }, { href: '/admin/prices', label: L.prices, testid: 'tab-prices' },
    ] }] : []),
    { href: '/admin/team', label: L.team, icon: 'users', testid: 'nav-team', tabs: [
      { href: '/admin/team', label: L.team, exact: true }, { href: '/admin/team/partners', label: '', show: false },
      { href: '/admin/team/org', label: L.org, testid: 'tab-org' },
      { href: '/admin/territory', label: L.territory, show: perms.manageAccounts, testid: 'tab-territory' },
    ] },
    // Datos del CRM (solo admin): importar, ordenar las ciudades y los campos de cada empresa o persona.
    ...(perms.importCrm ? [{ href: '/admin/import', label: L.crmData, icon: 'upload' as IconName, testid: 'nav-crm-data', tabs: [
      { href: '/admin/import', label: L.import, testid: 'tab-import' }, { href: '/admin/ciudades', label: L.cities, testid: 'tab-cities' }, { href: '/admin/limpiar', label: L.cleanup, testid: 'tab-cleanup' },
      { href: '/admin/team/fields', label: L.crmFields, testid: 'tab-fields' },
    ] }] : []),
    { href: '/admin/commissions/team', label: L.commissions, icon: 'wallet', tabs: [] },
  ];
  return { sell, setup };
}

const under = (path: string, p: string, exact?: boolean) => path === p || (!exact && path.startsWith(`${p}/`));
/** El grupo de una ruta: el de la pestaña más específica que la contiene. */
function groupOf(gs: Group[], path: string): Group | null {
  let best: { g: Group; len: number } | null = null;
  for (const g of gs) {
    for (const t of g.tabs.length ? g.tabs : [{ href: g.href, exact: false }]) {
      const hit = t.href === '/admin' ? path === '/admin' : under(path, t.href, t.exact);
      if (hit && (!best || t.href.length > best.len)) best = { g, len: t.href.length };
    }
  }
  return best?.g ?? null;
}

export function navFor(role: Role, path: string, counts: { pendingPlaybook?: number; superadmin?: boolean } = {}, L = shellMessages.es.nav) {
  const perms = can(role);
  const { sell, setup } = groups(role, counts, L);
  const inSetup = perms.configure && !!groupOf(setup, path);
  const mode: NavMode = inSetup ? 'setup' : 'sell';
  const list = mode === 'setup' ? setup : sell;
  const current = groupOf(list, path);
  // Las analíticas de una propuesta cuelgan de Propuestas.
  const items: NavItem[] = list.map((g) => ({ href: g.href, label: g.label, icon: g.icon, testid: g.testid, count: g.count, on: current === g || (g.href === '/admin' && /^\/admin\/dossiers\//.test(path)) }));
  return {
    mode,
    canSwitch: perms.configure,
    modes: [
      { key: 'sell' as const, label: L.sell, href: '/admin', icon: 'target' as IconName },
      { key: 'setup' as const, label: L.configure, href: '/admin/setup', icon: 'settings' as IconName },
    ],
    items,
  };
}

/** Pestañas de la sección actual (si tiene más de una visible). Las pinta el layout arriba de la página. */
export function sectionTabs(role: Role, path: string, counts: { superadmin?: boolean } = {}, L = shellMessages.es.nav) {
  const { sell, setup } = groups(role, counts, L);
  const perms = can(role);
  const g = (perms.configure ? groupOf(setup, path) : null) ?? groupOf(sell, path);
  // Las pantallas de detalle (una propuesta, un colaborador…) no llevan pestañas de sección.
  if (!g || /^\/admin\/dossiers\//.test(path) || /^\/admin\/team\/partners\//.test(path)) return [];
  const tabs = g.tabs.filter((t) => t.show !== false && t.label);
  if (tabs.length < 2) return [];
  const hit = (t: (typeof tabs)[number]) => (t.href === '/admin' ? path === '/admin' : under(path, t.href, t.exact) || (t.href === '/admin/learn' && path.startsWith('/admin/learn')));
  // Si dos pestañas contienen la ruta, se marca la más concreta.
  const best = tabs.filter(hit).sort((a, b) => b.href.length - a.href.length)[0];
  return tabs.map((t) => ({ href: t.href, label: t.label, testid: t.testid, on: t === best }));
}
