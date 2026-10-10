import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { createAccountsService } from '../accounts/service';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';
import { CLEANUP_TOOL, fixtureCleanup, sanitizeCleanup, type CleanupInput } from './cleanup';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const REP = '11111111-1111-4111-8111-111111111111';
const sess = (u: string, role: string) => ({ userId: u, email: 'x@enjoy.test', displayName: null, tenantId: ENJOY, role }) as never;
const svc = (u: string, role: string) => createCrmService(demoCrmDb(u), demoAccountsDb(u), demoAdminDb(), sess(u, role), { places: null, cleanup: fixtureCleanup() });
const input = (id: string, name: string): CleanupInput => ({ id, name, city: null, notes: null, website: null, instagram: null, email: null, tags: [], sector: null });

describe('limpiar el CRM', () => {
  beforeEach(() => { resetDemoDb(); });

  test('de la IA solo vale lo de la tanda, con tipos y motivos conocidos', () => {
    const r = sanitizeCleanup({ items: [
      { id: 'a', kind: 'dj', discard: null, why: 'DJ   residente' }, { id: 'b', kind: 'otro', discard: 'spam', why: 'x' }, { id: 'fuera', kind: 'dj', discard: null, why: '' },
      { id: 'a', kind: 'company', discard: 'partner', why: 'repetida' },
    ] }, [input('a', 'A'), input('b', 'B')]);
    expect(r).toEqual([{ id: 'a', kind: 'dj', discard: null, why: 'DJ residente' }, { id: 'b', kind: 'company', discard: null, why: 'x' }]);
    expect(JSON.stringify(CLEANUP_TOOL)).not.toContain('enum');
  });

  test('revisar, aplicar lo marcado, verlo por pestañas y deshacer; solo admin', async () => {
    const d = demoDb();
    const add = (name: string) => { const id = `00000000-0000-4000-8000-0000000c1${String(d.account.length).padStart(3, '0')}`; d.account.push({ ...d.account.find((a) => a.tenant_id === ENJOY)!, id, name, owner_id: null, kind: 'company', discarded_at: null, discard_reason: null, discard_note: null }); return id; };
    const dj = add('DJ Nova'); const shop = add('Acid Records tienda'); const club = add('Sala Luna');
    const adm = svc(ADMIN, 'admin');
    await expect(svc(REP, 'rep').cleanupOverview()).rejects.toMatchObject({ status: 403 });
    const o = await adm.cleanupOverview();
    expect(o.ids).toEqual(expect.arrayContaining([dj, shop, club]));
    const sug = await adm.cleanupClassify([dj, shop, club], { seller: 'Enjoy', clients: [] });
    expect(sug.find((x) => x.id === dj)).toMatchObject({ kind: 'dj', discard: null });
    expect(sug.find((x) => x.id === shop)).toMatchObject({ discard: 'partner' });
    const r = await adm.cleanupApply(sug);
    expect(r).toEqual({ changed: 2, djs: 1, discarded: 1 });
    expect(d.account.find((a) => a.id === shop)).toMatchObject({ discard_reason: 'partner', discard_note: 'Tienda de música: no es cliente, puede ser alianza.' });

    const acc = createAccountsService(demoAccountsDb(ADMIN), demoAdminDb(), sess(ADMIN, 'admin'));
    const ids = async (view: 'company' | 'dj' | 'discarded') => (await acc.list({ scope: 'all', view })).items.map((a) => a.id);
    expect(await ids('dj')).toEqual([dj]);
    expect(await ids('discarded')).toEqual([shop]);
    expect(await ids('company')).toContain(club);
    expect(await ids('company')).not.toContain(shop);

    await adm.cleanupUndo((await adm.cleanupOverview()).last!.id);
    expect(d.account.find((a) => a.id === dj)?.kind).toBe('company');
    expect(d.account.find((a) => a.id === shop)?.discarded_at).toBeNull();
  });

  test('en la ficha: cambiar el tipo no recupera una descartada; recuperar la devuelve', async () => {
    const club = demoDb().account.find((a) => a.tenant_id === ENJOY && !a.owner_id)!;
    const rep = svc(REP, 'rep');
    await rep.classifyAccount(club.id, { reason: 'not_sector', note: 'Inmobiliaria' });
    await rep.classifyAccount(club.id, { kind: 'dj' });
    expect(club).toMatchObject({ kind: 'dj', discard_reason: 'not_sector', discard_note: 'Inmobiliaria' });
    await rep.classifyAccount(club.id, { reason: null });
    expect(club).toMatchObject({ discarded_at: null, discard_reason: null });
  });
});
