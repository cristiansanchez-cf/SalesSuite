import { describe, expect, test } from 'vitest';
import { accountByCompany, companyKey } from './company-key';

describe('companyKey (= public.company_key)', () => {
  test('sin signos, tildes, mayúsculas ni S.L.', () => {
    expect(companyKey('Zafiro Zone, S.L.')).toBe('zafiro zone');
    expect(companyKey('  CAFÉ   Málaga ')).toBe('cafe malaga');
    expect(companyKey('Sala 12 SA')).toBe('sala 12');
    expect(companyKey('--')).toBeNull();
  });
  test('una sola con ese nombre; con dos, no adivina', () => {
    const accs = [{ name: 'Zafiro Zone' }, { name: 'Doble' }, { name: 'DOBLE, S.L.' }];
    expect(accountByCompany(accs, 'zafiro zone')?.name).toBe('Zafiro Zone');
    expect(accountByCompany(accs, 'Doble')).toBeNull();
    expect(accountByCompany(accs, 'Otra')).toBeNull();
    expect(accountByCompany(accs, 'Z')).toBeNull();
  });
});
