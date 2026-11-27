import { describe, expect, it } from 'vitest';
import { ways } from './get-started';

describe('«Tu CRM en marcha»: cada uno ve las formas que puede usar', () => {
  it('admin: CSV, Notion, su IA y dictar; WhatsApp; y que entren solos (web, WhatsApp de leads, equipo)', () => {
    const w = ways({ importCrm: true, manageTenant: true, useAccounts: true, waLink: 'https://wa.me/34600000000?text=Hola', hasPhone: true });
    expect(w.bulk.map((x) => x.key)).toEqual(['csv', 'notion', 'ai', 'notes']);
    expect(w.daily[0]).toMatchObject({ key: 'whatsapp', href: 'https://wa.me/34600000000?text=Hola', external: true });
    expect(w.alone.map((x) => x.key)).toEqual(['web', 'waLeads', 'team']);
  });
  it('comercial: sin CSV ni conectar la web; sin móvil, el WhatsApp lleva a ponerlo', () => {
    const w = ways({ importCrm: false, manageTenant: false, useAccounts: true, waLink: 'https://wa.me/34600000000', hasPhone: false });
    expect(w.bulk.map((x) => x.key)).toEqual(['ai', 'notes']);
    expect(w.daily[0]).toMatchObject({ key: 'whatsapp', href: '/admin/account#asistente', setup: true });
    expect(w.alone).toEqual([]);
  });
});
