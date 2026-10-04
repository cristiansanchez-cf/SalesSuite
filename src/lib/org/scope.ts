/** Alcance del organigrama (docs/ORG.md), sin dependencias: lo usan los servicios de propuestas, equipo y comisiones. */
import type { AdminSession } from '../admin/types';

/** Ve todo el espacio: superadmin, admin o gerente sin delegación (gerente global). */
export const isGlobal = (s: Pick<AdminSession, 'role' | 'delegationId' | 'superadmin'>) =>
  !!s.superadmin || s.role === 'admin' || (s.role === 'lead' && !s.delegationId);
/** ¿Entra esta persona en lo que veo? Sin equipo acotado (global), todo. */
export const inTeam = (s: Pick<AdminSession, 'team'>, userId: string | null | undefined) => !s.team || (!!userId && s.team.includes(userId));
