import { beforeEach, describe, expect, test } from 'vitest';
import { resetDemoDb, demoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCrmDb } from './db-demo';
import { createCrmService } from './service';

const ENJOY = '00000000-0000-4000-8000-000000000e01';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const sess = { userId: ADMIN, email: 'x@enjoy.test', displayName: null, tenantId: ENJOY, role: 'admin' } as never;
const svc = () => createCrmService(demoCrmDb(ADMIN), demoAccountsDb(ADMIN), demoAdminDb(), sess, { places: null });

describe('«Se enfría»', () => {
  beforeEach(() => { resetDemoDb(); });

  test('con un próximo paso ya puesto («hablamos en enero») no se enfría', async () => {
    const d = demoDb();
    const [a, b] = d.account.filter((x) => x.tenant_id === ENJOY && !x.discarded_at).slice(0, 2);
    const old = new Date(Date.now() - 20 * 86400_000).toISOString();
    for (const acc of [a!, b!]) {
      d.crm_activity = d.crm_activity.filter((x) => x.account_id !== acc.id);
      d.crm_activity.push({ id: crypto.randomUUID(), tenant_id: ENJOY, account_id: acc.id, contact_id: null, user_id: ADMIN, channel: 'whatsapp', outcome: 'interested', note: null, happened_at: old, created_at: old });
      acc.next_step_at = null;
    }
    expect([...(await svc().cooling([a!.id, b!.id])).keys()].sort()).toEqual([a!.id, b!.id].sort());
    b!.next_step_at = new Date(Date.now() + 60 * 86400_000).toISOString();
    expect([...(await svc().cooling([a!.id, b!.id])).keys()]).toEqual([a!.id]);
    // Con las cuentas ya cargadas (lista y mapa) no hace falta volver a leerlas.
    expect([...(await svc().cooling([{ id: a!.id, nextStepAt: null }, { id: b!.id, nextStepAt: b!.next_step_at }])).keys()]).toEqual([a!.id]);
  });
});
