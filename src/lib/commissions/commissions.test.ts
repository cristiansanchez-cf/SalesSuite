import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import { demoEvidenceDb } from '../evidence/db-demo';
import { demoNotifyDb } from '../notify/db-demo';
import { demoAccountsDb } from '../accounts/db-demo';
import { demoCommissionsDb, demoIngestDb } from './db-demo';
import { commissionsContract } from './commissions.contract';

const LEAD = { id: 'cdcdcdcd-0000-4000-8000-000000000001', email: 'jefa-c@enjoy.test' };
commissionsContract('demo', () => ({
  async reset() {
    const db = resetDemoDb();
    // Mismo punto de partida que Supabase.
    Object.assign(db, { play_contribution: [], notification: [], zone: [], membership_zone: [], account_rules: [], account: [], account_touch: [], commission_plan: [], coupon: [] });
    db.users.push({ id: LEAD.id, email: LEAD.email, display_name: '', memberships: [{ tenant_id: '00000000-0000-4000-8000-000000000e01', role: 'lead' }] });
  },
  adminDbFor: () => demoAdminDb(), partnerDbFor: () => demoAdminDb(), playbookDbFor: () => demoPlaybookDb(), evidenceDbFor: () => demoEvidenceDb(),
  notifyDbFor: () => demoNotifyDb(), accountsDbFor: (u) => demoAccountsDb(u), commissionsDbFor: (u) => demoCommissionsDb(u),
  ingestDb: () => demoIngestDb(), lead: LEAD,
}));
