import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from '../playbook/db-demo';
import { demoEvidenceDb } from '../evidence/db-demo';
import { demoNotifyDb, demoNotifyJobDb } from './db-demo';
import { notifyContract } from './notify.contract';

notifyContract('demo', () => ({
  async reset() {
    const db = resetDemoDb();
    // Mismo punto de partida que Supabase: sin aportes ni avisos de ejemplo.
    db.play_revision = [];
    db.play_contribution = [];
    db.notification = [];
  },
  adminDbFor: () => demoAdminDb(),
  partnerDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
  notifyDbFor: () => demoNotifyDb(),
  jobDb: () => demoNotifyJobDb(),
}));
