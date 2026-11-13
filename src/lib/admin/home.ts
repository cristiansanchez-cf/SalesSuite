/**
 * La pantalla de inicio de un espacio: el CRM para quien trabaja empresas (criterio de Cristian: «me tiene loco que
 * siempre vaya a Propuestas»); los colaboradores, a sus cuentas (/admin). Propuestas sigue en el menú.
 */
import { can } from './permissions';
import type { Role } from './types';

export const HOME = '/admin/home';
export const homePath = (role: Role): string => (can(role).useAccounts ? '/admin/accounts' : '/admin');
/** Ya se entró en esta sesión del navegador: «/admin» escrito a mano ya no vuelve a llevar al inicio. */
export const HOME_COOKIE = 'co_home';
