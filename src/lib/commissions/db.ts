import type { Coupon, Entry, EntryDraft, EntryStatus, EventStatus, Payout, Plan, RevenueEvent } from './types';

export type EventInsert = Omit<RevenueEvent, 'id' | 'tenantId' | 'createdAt'>;
export interface ApiKey { id: string; tenantId: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export interface Connector { id: string; tenantId: string; key: string; name: string; mapping: Record<string, unknown>; active: boolean }

/** Comisiones con la sesión del usuario (RLS decide qué ve; los triggers protegen el libro). */
export interface CommissionsDb {
  listPlans(tenantId: string): Promise<Plan[]>;
  savePlan(tenantId: string, p: Omit<Plan, 'id' | 'tenantId' | 'updatedAt'>, id?: string): Promise<string>;
  deletePlan(id: string): Promise<boolean>;
  listPlanMembers(tenantId: string): Promise<Array<{ userId: string; planId: string }>>;
  setPlanMember(tenantId: string, userId: string, planId: string | null): Promise<void>;

  listEvents(tenantId: string, f?: { status?: EventStatus; limit?: number }): Promise<RevenueEvent[]>;
  findEvent(tenantId: string, source: string, externalId: string): Promise<RevenueEvent | null>;
  insertEvent(tenantId: string, e: EventInsert): Promise<string>;
  setEventStatus(id: string, status: EventStatus): Promise<boolean>;

  listEntries(tenantId: string, f?: { userId?: string }): Promise<Entry[]>;
  /** Inserta y descarta las claves repetidas. Devuelve cuántas entraron. */
  insertEntries(tenantId: string, drafts: EntryDraft[]): Promise<number>;
  setEntryStatus(ids: string[], status: Extract<EntryStatus, 'approved' | 'void'>): Promise<number>;
  deleteEntries(ids: string[]): Promise<number>;

  listPayouts(tenantId: string, f?: { userId?: string }): Promise<Payout[]>;
  createPayout(tenantId: string, p: { userId: string; period: string; currency: string; totalCents: number; entryIds: string[] }): Promise<string>;
  markPayoutPaid(id: string): Promise<boolean>;
  deletePayout(id: string): Promise<boolean>;

  listApiKeys(tenantId: string): Promise<ApiKey[]>;
  createApiKey(tenantId: string, k: { name: string; keyHash: string; prefix: string }): Promise<string>;
  revokeApiKey(id: string): Promise<boolean>;
  listConnectors(tenantId: string): Promise<Connector[]>;
  saveConnector(tenantId: string, c: Omit<Connector, 'id' | 'tenantId'>, id?: string): Promise<string>;
  deleteConnector(id: string): Promise<boolean>;

  /** Cupones con sus usos (propuestas que lo tienen aplicado). */
  listCoupons(tenantId: string): Promise<Coupon[]>;
  saveCoupon(tenantId: string, c: Omit<Coupon, 'id' | 'tenantId' | 'uses'>, id?: string): Promise<string>;
}

/** Entrada por API (servidor con service role): resuelve la clave y escribe eventos de ese tenant. */
export interface IngestDb {
  tenantForKey(keyHash: string): Promise<{ tenantId: string; keyId: string } | null>;
  touchKey(keyId: string): Promise<void>;
  connector(tenantId: string, key: string): Promise<Connector | null>;
  findEvent(tenantId: string, source: string, externalId: string): Promise<RevenueEvent | null>;
  insertEvent(tenantId: string, e: EventInsert): Promise<string>;
  accountByRef(tenantId: string, ref: string): Promise<string | null>;
  userByEmail(tenantId: string, email: string): Promise<string | null>;
}
