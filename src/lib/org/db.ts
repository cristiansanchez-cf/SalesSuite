import type { Delegation, PlatformTenant } from './types';
import type { StorageRow, UsageRow } from '../usage/report';
import type { TenantLimits } from '../usage/limits';

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
  /** Consumo de pago del periodo, agrupado (solo superadmin; docs/COSTES.md). null si aún no está la migración. */
  platformUsage?(from: Date, to: Date): Promise<UsageRow[] | null>;
  /** Lo que ocupa cada espacio en el almacenamiento (solo superadmin). */
  platformStorage?(): Promise<StorageRow[] | null>;
  /** Tope de IA de cada espacio (solo superadmin; docs/COSTES.md §Tope). Los que no tienen, no salen. */
  platformLimits?(): Promise<Map<string, TenantLimits> | null>;
  setTenantLimits?(tenantId: string, l: TenantLimits): Promise<void>;
  /** Alta de un espacio (solo superadmin; la base de datos lo comprueba). Devuelve su id. */
  createTenant(t: { slug: string; name: string; locale: string; hostname: string }): Promise<string>;
  /** Hace admin de un espacio a un usuario (solo superadmin). */
  addTenantAdmin(tenantId: string, userId: string): Promise<void>;
}
