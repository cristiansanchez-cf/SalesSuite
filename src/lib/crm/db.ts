/** Personas, sus empresas e importaciones (docs/CRM_DINAMICO.md). Una implementación por usuario: en Supabase decide la RLS. */
import type { ActivitySummary } from './pipeline';
import type { Activity, Channel, Outcome } from './followup';
import type { AccountLink, LinkWhen, Contact, ContactInsert, ContactLink, ContactPatch, CrmImport, PaymentRequest, PaymentRequestInsert } from './types';

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
  /** «Trabaja con» de una empresa (en cualquiera de los dos lados). */
  listAccountLinks(tenantId: string, accountId: string): Promise<AccountLink[]>;
  /** Alta o cambio de nota (una por pareja, sea cual sea el orden). */
  /** `note` undefined: se queda la que hubiera. */
  saveAccountLink(tenantId: string, aId: string, bId: string, note: string | null | undefined, when?: Partial<LinkWhen>): Promise<string>;
  removeAccountLink(id: string): Promise<boolean>;
  createImport(tenantId: string, i: Pick<CrmImport, 'fileName' | 'target' | 'headers' | 'rows' | 'mapping'>): Promise<string>;
  getImport(id: string): Promise<CrmImport | null>;
  listImports(tenantId: string, limit: number): Promise<Array<Omit<CrmImport, 'rows'>>>;
  updateImport(id: string, p: Partial<Pick<CrmImport, 'mapping' | 'status' | 'stats' | 'doneAt'>>): Promise<boolean>;
  deleteContactsByImport(importId: string): Promise<number>;
  /** Interacciones de unas empresas, de la más reciente a la más antigua. */
  listActivities(tenantId: string, accountIds: string[], limit: number): Promise<Activity[]>;
  /** La última interacción de verdad (no las notas) de cada empresa: lo único que necesita «se enfría». */
  lastActivities(tenantId: string, accountIds: string[]): Promise<Array<{ accountId: string; outcome: Activity['outcome']; happenedAt: string }>>;
  /** Resumen de interacciones por empresa (tablero, §34): vista crm_activity_summary. */
  activitySummary(tenantId: string, accountIds: string[]): Promise<ActivitySummary[]>;
  insertActivity(tenantId: string, a: { accountId: string; contactId: string | null; channel: Channel; outcome: Outcome; note: string | null; happenedAt?: string }): Promise<string>;
  deleteActivity(id: string): Promise<boolean>;
  /** Enlaces de pago de esas empresas (§35), lo último primero. */
  listPaymentRequests(tenantId: string, accountIds: string[]): Promise<PaymentRequest[]>;
  /** La base de datos copia tarifa y cupón y comprueba quién puede poner un precio a medida. */
  insertPaymentRequest(tenantId: string, r: PaymentRequestInsert): Promise<PaymentRequest>;
  /** Anular uno enviado (quien lo generó, o gerente/admin). */
  cancelPaymentRequest(tenantId: string, id: string): Promise<boolean>;
  /** Pagado por otra vía (gerente o admin): mismo efecto que el aviso de Stripe (§36). */
  markPaymentPaid(tenantId: string, id: string): Promise<'paid' | 'already' | 'missing'>;
  /** Ganada sin enlace (espacios sin Stripe; gerente o admin). */
  markWon(tenantId: string, accountId: string): Promise<void>;
}
