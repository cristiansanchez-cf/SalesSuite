/** Personas, sus empresas e importaciones (docs/CRM_DINAMICO.md). Una implementación por usuario: en Supabase decide la RLS. */
import type { Activity, Channel, Outcome } from './followup';
import type { Contact, ContactInsert, ContactLink, ContactPatch, CrmImport } from './types';

export interface ContactFilter { ids?: string[]; tag?: string; q?: string; limit: number }

export interface CrmDb {
  listContacts(tenantId: string, f: ContactFilter): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | null>;
  insertContacts(tenantId: string, rows: ContactInsert[]): Promise<string[]>;
  updateContact(id: string, p: ContactPatch): Promise<boolean>;
  deleteContact(id: string): Promise<boolean>;
  listLinks(tenantId: string, f: { contactIds?: string[]; accountIds?: string[] }): Promise<ContactLink[]>;
  /** Alta o cambio de papel (upsert por persona + empresa). */
  saveLinks(tenantId: string, links: ContactLink[]): Promise<void>;
  removeLink(contactId: string, accountId: string): Promise<boolean>;
  createImport(tenantId: string, i: Pick<CrmImport, 'fileName' | 'target' | 'headers' | 'rows' | 'mapping'>): Promise<string>;
  getImport(id: string): Promise<CrmImport | null>;
  listImports(tenantId: string, limit: number): Promise<Array<Omit<CrmImport, 'rows'>>>;
  updateImport(id: string, p: Partial<Pick<CrmImport, 'mapping' | 'status' | 'stats' | 'doneAt'>>): Promise<boolean>;
  deleteContactsByImport(importId: string): Promise<number>;
  /** Interacciones de unas empresas, de la más reciente a la más antigua. */
  listActivities(tenantId: string, accountIds: string[], limit: number): Promise<Activity[]>;
  insertActivity(tenantId: string, a: { accountId: string; contactId: string | null; channel: Channel; outcome: Outcome; note: string | null; happenedAt?: string }): Promise<string>;
  deleteActivity(id: string): Promise<boolean>;
}
