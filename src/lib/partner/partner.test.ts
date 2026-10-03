import { demoRepository } from '../data/demo';
import { resetDemoDb } from '../data/store';
import { demoAdminDb, demoIdentity } from '../admin/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import { partnerContract } from './partner.contract';
import { demoEvidenceDb } from '../evidence/db-demo';

partnerContract('demo', () => ({
  enforcesRls: false,
  async reset() {
    const db = resetDemoDb();
    db.play_revision = [];
    db.play_contribution = [];
  },
  adminDbFor: () => demoAdminDb(),
  partnerDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
  identity: () => demoIdentity(),
  publicGet: (token, tenantId) => demoRepository().getPublicDossier(token, tenantId) as never,
}));
