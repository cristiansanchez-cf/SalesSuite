import { demoRepository } from '../data/demo';
import { resetDemoDb } from '../data/store';
import { demoAdminDb } from './db-demo';
import { serviceContract } from './service.contract';

serviceContract('demo', () => ({
  enforcesRls: false,
  async reset() { resetDemoDb(); },
  dbFor: () => demoAdminDb(),
  publicGet: (token, tenantId) => demoRepository().getPublicDossier(token, tenantId),
}));
