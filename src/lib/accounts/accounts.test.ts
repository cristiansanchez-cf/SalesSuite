import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import { demoEvidenceDb } from '../evidence/db-demo';
import { demoNotifyDb } from '../notify/db-demo';
import { demoAccountsDb } from './db-demo';
import { demoCrmDb } from '../crm/db-demo';
import { accountsContract } from './accounts.contract';

const REP2 = { id: 'abababab-0000-4000-8000-000000000002', email: 'rep2@enjoy.test' };
accountsContract('demo', () => ({
  async reset() {
    const db = resetDemoDb();
    // Mismo punto de partida que Supabase: sin territorio ni cuentas de ejemplo.
    Object.assign(db, { play_contribution: [], notification: [], zone: [], membership_zone: [], account_rules: [], account: [], account_touch: [], crm_field: [], crm_contact: [], crm_contact_account: [], crm_import: [] });
    db.users.push({ id: REP2.id, email: REP2.email, display_name: '', memberships: [{ tenant_id: '00000000-0000-4000-8000-000000000e01', role: 'rep' }] });
  },
  adminDbFor: () => demoAdminDb(),
  partnerDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
  notifyDbFor: () => demoNotifyDb(),
  accountsDbFor: (u) => demoAccountsDb(u),
  crmDbFor: (u) => demoCrmDb(u),
  rep2: REP2,
  async expireClaim(id) { const a = resetless().account.find((x) => x.id === id)!; a.claimed_until = new Date(Date.now() - 1000).toISOString(); },
}));
import { demoDb as resetless } from '../data/store';
