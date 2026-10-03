import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import { demoEvidenceDb } from './db-demo';
import { evidenceContract } from './evidence.contract';

evidenceContract('demo', () => ({
  enforcesRls: false,
  async reset() { resetDemoDb(); },
  adminDbFor: () => demoAdminDb(),
  partnerDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
}));
