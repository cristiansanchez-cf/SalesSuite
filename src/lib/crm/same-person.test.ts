import { beforeEach, describe, expect, test } from 'vitest';
import { samePerson, withoutCompany } from './same-person';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { demoDb, resetDemoDb } from '../data/store';

describe('misma persona (caso Havana)', () => {
  test('sin la empresa detrás del nombre, sin tildes, o solo el nombre', () => {
    expect(withoutCompany('Mireia Havana', 'HAVANA the cánovas club')).toBe('Mireia');
    expect(withoutCompany('Jose Maria Havana', 'HAVANA the cánovas club')).toBe('Jose Maria');
    expect(withoutCompany('Havana', 'Havana')).toBe('Havana');
    const co = 'HAVANA the cánovas club';
    expect(samePerson({ name: 'Mireia' }, { name: 'Mireia Havana' }, co)).toBe(true);
    expect(samePerson({ name: 'José María' }, { name: 'Jose Maria Havana' }, co)).toBe(true);
    expect(samePerson({ name: 'Mireia' }, { name: 'Mireia López' }, co)).toBe(true);
    expect(samePerson({ name: 'Marta' }, { name: 'Mireia' }, co)).toBe(false);
    expect(samePerson({ name: 'Jefe', phone: '+34 671 90 24 46' }, { name: 'José María', phone: '671902446' }, co)).toBe(true);
  });
});

describe('en la ficha', () => {
  const ENJOY = '00000000-0000-4000-8000-000000000e01';
  const REP = '11111111-1111-4111-8111-111111111111';
  const SOL = '00000000-0000-4000-8000-0000000ac001';
  beforeEach(() => { resetDemoDb(); process.env.AI_RESEARCH_FIXTURE = '1'; });
  const rep = async () => (await contextAs((await publicRepository().resolveTenantBySlug('enjoy'))!, REP))!;
  const people = () => { const ids = demoDb().crm_contact_account.filter((l) => l.account_id === SOL).map((l) => l.contact_id); return demoDb().crm_contact.filter((c) => ids.includes(c.id)); };

  test('apuntar dos veces a la misma persona (con la empresa pegada al nombre) no la duplica, y completa su teléfono', async () => {
    const admin = await rep();
    const before = people().length;
    await admin.crm.notesApply([{ accountId: SOL, interaction: 'Hablé con Mireia', channel: 'visit', outcome: 'replied', people: [{ name: 'Mireia', role: 'Encargada' }] }]);
    await admin.crm.notesApply([{ accountId: SOL, interaction: 'Me pasó su contacto', channel: 'whatsapp', outcome: 'replied', people: [{ name: 'Mireia Club Sol', phone: '+34 633 89 47 87' }] }]);
    const mireias = people().filter((c) => /mireia/i.test(c.name));
    expect(people().length).toBe(before + 1);
    expect(mireias.map((c) => [c.name, c.phone])).toEqual([['Mireia', '+34 633 89 47 87']]);
  });

  test('la X: si ya no está en ninguna otra empresa, se borra del todo; si está en otra, sigue', async () => {
    const admin = await rep();
    await admin.crm.notesApply([{ accountId: SOL, interaction: 'x', channel: 'visit', outcome: 'replied', people: [{ name: 'Persona Suelta' }] }]);
    const c = people().find((x) => x.name === 'Persona Suelta')!;
    await admin.crm.unlink(c.id, SOL);
    expect(demoDb().crm_contact.some((x) => x.id === c.id)).toBe(false);
  });
});
