import type { OrgDb } from './db';

/** Sin organigrama (contratos de otros módulos): nadie es superadmin y no hay delegaciones. */
export const emptyOrgDb: OrgDb = {
  async isSuperadmin() { return false; },
  async listDelegations() { return []; },
  async saveDelegation() { throw new Error('permission denied: sin organigrama'); },
  async deleteDelegation() {},
  async memberDelegations() { return new Map(); },
  async setMemberDelegation() { throw new Error('permission denied: sin organigrama'); },
  async zoneDelegations() { return new Map(); },
  async setZoneDelegation() { throw new Error('permission denied: sin organigrama'); },
  async platformOverview() { return null; },
};
