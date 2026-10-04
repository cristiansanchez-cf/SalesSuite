/** Organigrama (docs/ORG.md): delegaciones con su gerente, gerente global y superadmin de la plataforma. */
export interface Delegation { id: string; tenantId: string; name: string; managerId: string | null; position: number }

/** Lo que ve el superadmin de cada espacio. */
export interface PlatformTenant {
  id: string; slug: string; name: string; status: string; createdAt: string; domain: string | null;
  members: number; delegations: number; dossiers: number; published: number; revenueCents: number;
}
