import type { Delegation, PlatformTenant } from './types';

/** Datos del organigrama. En Supabase, la RLS (20261026000000_org.sql) es la que de verdad limita. */
export interface OrgDb {
  /** ¿Es superadmin la persona con sesión? (platform_admin; nadie con sesión lo lee ni lo escribe). */
  isSuperadmin(userId: string): Promise<boolean>;
  listDelegations(tenantId: string): Promise<Delegation[]>;
  saveDelegation(tenantId: string, d: { name: string; managerId: string | null }, id?: string): Promise<string>;
  deleteDelegation(tenantId: string, id: string): Promise<void>;
  /** userId → delegación (solo los que tienen). */
  memberDelegations(tenantId: string): Promise<Map<string, string>>;
  setMemberDelegation(tenantId: string, userId: string, delegationId: string | null): Promise<void>;
  /** zoneId → delegación (solo las que tienen). */
  zoneDelegations(tenantId: string): Promise<Map<string, string>>;
  setZoneDelegation(tenantId: string, zoneId: string, delegationId: string | null): Promise<void>;
  platformOverview(): Promise<PlatformTenant[] | null>;
}
