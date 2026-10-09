import type { CrmField, FieldValues } from '../crm/fields';
import type { Qualification, Weights } from '../crm/priority';
import type { Account, AccountContact, AccountDecision, AccountRules, AccountStatus, AccountTouch, Eligibility, Zone, ZoneAssignment, ZoneKind } from './types';

export interface AccountFilter { zoneIds?: string[]; ownerId?: string; q?: string; ids?: string[]; status?: AccountStatus; parentId?: string; tag?: string; limit: number }
export interface AccountInsert {
  name: string; zoneId: string | null; segmentId: string | null; address: string | null; externalRef: string | null; notes: string | null;
  /** Solo managers: asignar al dar de alta (un comercial siempre se la queda él). */
  ownerId?: string | null;
  fields?: FieldValues;
  parentId?: string | null;
  tags?: string[];
  importId?: string | null;
  contact?: AccountContact;
}
export interface AccountPatch {
  name?: string; zoneId?: string | null; segmentId?: string | null; address?: string | null; externalRef?: string | null; notes?: string | null;
  /** Solo managers (en Postgres lo impide account_guard). */
  status?: AccountStatus; blockedReason?: string | null; ownerId?: string | null; claimedUntil?: string | null;
  /** Todos los valores de los campos del CRM (reemplaza el objeto entero). */
  fields?: FieldValues;
  parentId?: string | null;
  tags?: string[];
  contact?: AccountContact;
  next?: { step: string | null; at: string | null; contactId: string | null; channel: string | null };
}
export type CrmFieldRecord = Omit<CrmField, 'id' | 'tenantId' | 'archivedAt'>;
export type { AccountInsert as AccountInsertRow };

/**
 * Cuentas y territorio. Implementación por usuario: en Supabase lo decide la sesión (RLS + triggers);
 * en demo, `actorId` replica auth.uid().
 */
export interface AccountsDb {
  listZones(tenantId: string): Promise<Zone[]>;
  saveZone(tenantId: string, z: { parentId: string | null; name: string; kind: ZoneKind; position: number }, id?: string): Promise<string>;
  deleteZone(id: string): Promise<boolean>;
  /** Alta de zonas en bloque (ciudades de una importación). */
  insertZones(tenantId: string, rows: Array<{ parentId: string | null; name: string; kind: ZoneKind; position: number }>): Promise<string[]>;
  listAssignments(tenantId: string): Promise<ZoneAssignment[]>;
  setAssignments(tenantId: string, userId: string, zoneIds: string[]): Promise<void>;
  getRules(tenantId: string): Promise<AccountRules>;
  saveRules(tenantId: string, r: AccountRules): Promise<void>;
  listAccounts(tenantId: string, f: AccountFilter): Promise<Account[]>;
  getAccount(id: string): Promise<Account | null>;
  insertAccount(tenantId: string, a: AccountInsert): Promise<string>;
  /** Alta en bloque (importación). Devuelve los ids en el mismo orden. */
  insertAccounts(tenantId: string, rows: AccountInsert[]): Promise<string[]>;
  /** Borra lo creado por una importación (deshacer). */
  deleteAccountsByImport(importId: string): Promise<number>;
  updateAccount(id: string, p: AccountPatch): Promise<boolean>;
  deleteAccount(id: string): Promise<boolean>;
  /** Contacto, quedársela o soltarla (RPC account_touch). */
  touch(id: string, kind: 'contact' | 'claim' | 'release', note: string | null): Promise<Eligibility>;
  listTouches(accountId: string, limit: number): Promise<AccountTouch[]>;
  /** ¿Si la vendo yo, cuenta? (RPC account_eligibility_preview). */
  preview(accountId: string): Promise<Eligibility>;
  /** Decisión de un manager sobre una venta con conflicto. */
  decide(dossierId: string, decision: AccountDecision | null): Promise<boolean>;
  /** Campos del CRM (los define el admin; los lee todo el equipo). */
  listFields(tenantId: string): Promise<CrmField[]>;
  saveField(tenantId: string, f: CrmFieldRecord, id?: string): Promise<string>;
  archiveField(id: string, archived: boolean): Promise<boolean>;
  /** Cualificar (RPC account_qualify): libre o mía, o un/a gerente; no la reserva. */
  qualify(accountId: string, q: Qualification): Promise<void>;
  /** Completar con Google (RPC account_research): solo rellena huecos. */
  research(accountId: string, data: { placeId: string; phone: string | null; website: string | null; address: string | null; mapsUrl: string | null; hours: string[] | null; lat: number | null; lng: number | null; status: string | null }): Promise<void>;
  /** Investigación con IA (RPC account_ai_research): la guarda o la borra (null). Mismo permiso que completar con Google. */
  saveAiResearch(accountId: string, data: object | null, fill?: Partial<Record<'phone' | 'email' | 'instagram' | 'linkedin' | 'website', string>>): Promise<void>;
  getAiResearch(accountId: string): Promise<unknown>;
  getPriorityWeights(tenantId: string): Promise<Partial<Weights> | null>;
  savePriorityWeights(tenantId: string, w: Weights): Promise<void>;
  /** Solo al deshacer una importación (los campos que creó, ya sin valores). */
  deleteField(id: string): Promise<boolean>;
}
