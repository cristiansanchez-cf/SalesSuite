import { demoRepository } from '../data/demo';
import { resetDemoDb } from '../data/store';
import { demoAdminDb, demoIdentity } from './db-demo';
import { serviceContract } from './service.contract';

serviceContract('demo', () => ({
  enforcesRls: false,
  async reset() { resetDemoDb(); },
  dbFor: () => demoAdminDb(),
  publicGet: (token, tenantId) => demoRepository().getPublicDossier(token, tenantId),
  identity: () => demoIdentity(),
  publicTenant: (slug) => demoRepository().resolveTenantBySlug(slug) as never,
}));
