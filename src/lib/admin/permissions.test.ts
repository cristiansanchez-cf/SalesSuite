/**
 * Contrato de permisos: la matriz completa de `can(role)`, escrita a mano. Si cambia un permiso, este test falla y hay
 * que cambiarlo aquí también: así ampliar (o recortar) lo que puede un rol es una decisión consciente, no un efecto
 * secundario. La RLS de Postgres repite estas reglas (supabase/tests/*.test.sql).
 */
import { describe, expect, test } from 'vitest';
import { can, ROLE_LABEL } from './permissions';
import type { Role } from './types';

const ROLES: Role[] = ['admin', 'lead', 'rep', 'partner'];

/** Permiso → [admin, gerente (lead), comercial (rep), colaborador (partner)]. */
const MATRIX: Record<keyof ReturnType<typeof can>, [boolean, boolean, boolean, boolean]> = {
  manageTenant: [true, false, false, false],
  setPrices: [true, false, false, false],
  manageTeam: [true, true, false, false],
  managePlaybook: [true, true, false, false],
  editAllDossiers: [true, true, false, false],
  configure: [true, true, false, false],
  manageCommissions: [true, false, false, false],
  useAccounts: [true, true, true, false],
  manageAccounts: [true, true, false, false],
  importCrm: [true, false, false, false],
  manageZones: [true, false, false, false],
};

describe('permisos por rol (contrato)', () => {
  test.each(ROLES.map((r, i) => [r, i] as const))('%s: exactamente la fila de la matriz', (role, i) => {
    const expected = Object.fromEntries(Object.entries(MATRIX).map(([k, row]) => [k, row[i]]));
    expect(can(role)).toEqual(expected);
  });

  test('no hay permisos sin declarar en la matriz (uno nuevo obliga a decidir quién lo tiene)', () => {
    for (const r of ROLES) expect(Object.keys(can(r)).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  test('un rol desconocido (p. ej. una membresía corrupta) no tiene ningún permiso', () => {
    const p = can('superadmin' as unknown as Role);
    expect(Object.values(p).every((v) => v === false)).toBe(true);
  });

  test('jerarquía: lo que puede un rol lo puede también el de arriba (colaborador ⊆ comercial ⊆ gerente ⊆ admin)', () => {
    const order: Role[] = ['partner', 'rep', 'lead', 'admin'];
    for (let i = 1; i < order.length; i++) {
      const low = can(order[i - 1]), high = can(order[i]);
      for (const k of Object.keys(low) as Array<keyof typeof low>) if (low[k]) expect(high[k], `${order[i]} debería poder ${k}`).toBe(true);
    }
  });

  test('el colaborador no tiene ningún permiso de consola (solo vende en sus cuentas asignadas)', () => {
    expect(Object.values(can('partner')).some(Boolean)).toBe(false);
  });

  test('etiquetas de cada rol', () => {
    expect(ROLE_LABEL).toEqual({ admin: 'Admin', lead: 'Gerente', rep: 'Comercial', partner: 'Colaborador' });
  });
});
