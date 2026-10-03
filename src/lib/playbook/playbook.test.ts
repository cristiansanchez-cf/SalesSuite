import { resetDemoDb } from '../data/store';
import { demoAdminDb } from '../admin/db-demo';
import { demoPlaybookDb } from './db-demo';
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
}));
