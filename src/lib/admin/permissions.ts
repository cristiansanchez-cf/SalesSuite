/**
 * Qué puede hacer cada rol (docs/TEAM.md). Un único sitio: las páginas, los servicios y el menú preguntan aquí.
 * La RLS de Postgres repite estas reglas (defensa en profundidad).
 *  - admin: todo.
 *  - lead (gerente): equipo comercial y colaboradores, playbook, mercado, situaciones y todos los dossiers.
 *    No toca marca, catálogo, roles de admin ni precios.
 *  - rep: sus dossiers y las cuentas de su zona.
 *  - partner: sus cuentas (docs/PARTNERS.md).
 */
import type { Role } from './types';

export function can(role: Role) {
  const admin = role === 'admin';
  const manager = admin || role === 'lead';
  return {
    /** Marca, catálogo, ajustes de la empresa y roles de admin. */
    manageTenant: admin,
    /** Fijar precios: tarifa del catálogo y política de precio de las cuentas de colaboradores. */
    setPrices: admin,
    /** Invitar comerciales y colaboradores, gestionar sus cuentas y accesos. */
    manageTeam: manager,
    /** Playbook, mercado, situaciones, configuración guiada y cierres del equipo. */
    managePlaybook: manager,
    /** Editar cualquier dossier del equipo. */
    editAllDossiers: manager,
    /** Ve el modo «Configurar». */
    configure: manager,
    /** Comisiones: configurar planes y liquidar. */
    manageCommissions: admin,
    /** Cuentas del CRM (equipo interno; los colaboradores venden en sus cuentas asignadas). */
    useAccounts: manager || role === 'rep',
    /** Bloquear, asignar y liberar cuentas; asignar zonas al equipo; decidir conflictos de comisión. */
    manageAccounts: manager,
    /** Definir el territorio y las reglas de cuentas. */
    manageZones: admin,
  };
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', lead: 'Gerente', rep: 'Comercial', partner: 'Colaborador' };
