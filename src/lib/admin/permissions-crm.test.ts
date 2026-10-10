import { describe, expect, test } from 'vitest';
import { can } from './permissions';

describe('permisos del CRM por rol', () => {
  test('importar y ordenar los datos del CRM: solo admin; el territorio, solo admin; gestionar cuentas, admin y gerente', () => {
    expect([can('admin').importCrm, can('lead').importCrm, can('rep').importCrm, can('partner').importCrm]).toEqual([true, false, false, false]);
    expect([can('admin').manageZones, can('lead').manageZones, can('rep').manageZones]).toEqual([true, false, false]);
    expect([can('admin').manageAccounts, can('lead').manageAccounts, can('rep').manageAccounts]).toEqual([true, true, false]);
    expect([can('rep').useAccounts, can('partner').useAccounts]).toEqual([true, false]);
  });
});
