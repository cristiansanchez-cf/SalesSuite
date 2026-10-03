import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from './db-demo';
import { demoEvidenceDb } from '../evidence/db-demo';
import { playbookContract } from './playbook.contract';

playbookContract('demo', () => ({
  enforcesRls: false,
  async reset() {
    const db = resetDemoDb();
    // Mismo punto de partida que Supabase: sin historia ni aportes de ejemplo.
    db.play_revision = [];
    db.play_contribution = [];
  },
  adminDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
}));

import { marketContract } from './market.contract';
marketContract('demo', () => ({
  enforcesRls: false,
  async reset() {
    const db = resetDemoDb();
    db.play_revision = [];
    db.play_contribution = [];
  },
  adminDbFor: () => demoAdminDb(),
  playbookDbFor: () => demoPlaybookDb(),
  evidenceDbFor: () => demoEvidenceDb(),
}));
