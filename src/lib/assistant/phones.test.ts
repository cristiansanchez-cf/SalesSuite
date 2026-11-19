import { describe, expect, test } from 'vitest';
import { formatPhone } from '../phone-format';

describe('teléfono como se lee', () => {
  test('España con prefijo: +34 y de 3 en 3', () => {
    expect(formatPhone('+34694904149')).toBe('+34 694 904 149');
    expect(formatPhone('+34 69 49 04 14 9')).toBe('+34 694 904 149');
  });
  test('mientras se escribe', () => {
    expect(formatPhone('+')).toBe('+');
    expect(formatPhone('+3')).toBe('+3');
    expect(formatPhone('+346')).toBe('+34 6');
    expect(formatPhone('+346949')).toBe('+34 694 9');
  });
  test('otros países y sin prefijo', () => {
    expect(formatPhone('+15551596658')).toBe('+1 555 159 665 8');
    expect(formatPhone('+351912345678')).toBe('+351 912 345 678');
    expect(formatPhone('694904149')).toBe('694 904 149');
    expect(formatPhone('')).toBe('');
  });
});

describe('un móvil por empresa (asistente)', () => {
  test('desde cada móvil, solo sus empresas; vacío = el de Mi cuenta', async () => {
    const { demoDb } = await import('../data/store');
    const { demoAssistantDb } = await import('./db-demo');
    const db = demoDb();
    const E = '00000000-0000-4000-8000-000000000e01', A = '00000000-0000-4000-8000-000000000a01', O = '00000000-0000-4000-8000-000000000b01';
    const u = { id: '99999999-9999-4999-8999-999999999999', email: 'varias@test', display_name: 'Varias', phone: '+34644000111',
      memberships: [{ tenant_id: E, role: 'admin' as const, assistant_phone: '+34694000222' }, { tenant_id: A, role: 'rep' as const }, { tenant_id: O, role: 'admin' as const }] };
    db.users.push(u);
    try {
      const adb = demoAssistantDb();
      const byPhone = async (d: string) => (await adb.membersByPhone(d)).filter((x) => x.userId === u.id).map((x) => x.tenantId).sort();
      expect(await byPhone('34694000222')).toEqual([E]); // el móvil de Enjoy: solo Enjoy (va directo)
      expect(await byPhone('34644000111')).toEqual([A, O].sort()); // el de Mi cuenta: las demás
      expect(await byPhone('34600000000')).toEqual([]);
    } finally { db.users.splice(db.users.indexOf(u), 1); }
  });
});
