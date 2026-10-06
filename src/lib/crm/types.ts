/** CRM, fase 2 (docs/CRM_DINAMICO.md): personas, su papel en cada empresa e importaciones. */
import type { FieldType, FieldValues } from './fields';

export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  linkedin: string | null;
  city: string | null;
  notes: string | null;
  fields: FieldValues;
  /** Listas en las que está (p. ej. «fbd»). */
  tags: string[];
  ownerId: string | null;
  importId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ContactInsert = Omit<Contact, 'id' | 'tenantId' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export type ContactPatch = Partial<Omit<ContactInsert, 'importId'>>;
/** Persona ↔ empresa, con su papel en esa empresa. */
export interface ContactLink { contactId: string; accountId: string; role: string | null }

/** A dónde va cada columna del CSV. */
export type ColumnMap =
  | { to: 'ignore' }
  | { to: 'core'; key: CoreKey }
  | { to: 'field'; key: string }
  | { to: 'new'; label: string; type: FieldType; isStage?: boolean };
/** Datos de serie (no son campos del CRM). */
export const ACCOUNT_CORE = ['name', 'city', 'address', 'externalRef', 'notes', 'owner', 'group'] as const;
export const CONTACT_CORE = ['name', 'company', 'role', 'city', 'email', 'phone', 'instagram', 'linkedin', 'notes', 'owner'] as const;
export type CoreKey = (typeof ACCOUNT_CORE)[number] | (typeof CONTACT_CORE)[number];

export interface ImportMapping {
  columns: Record<string, ColumnMap>;
  /** Valores de una columna de selección renombrados o unificados: valor del CSV → opción. */
  values: Record<string, Record<string, string>>;
  /** Opciones de una columna en su orden (p. ej. las etapas del embudo). Las que el mapeo nombre y falten van al final. */
  options?: Record<string, string[]>;
  /** Lista (etiqueta) que llevan todos los registros importados, p. ej. «fbd». */
  tag: string | null;
  /** Sector de las empresas que se crean (opcional). */
  segmentId: string | null;
}
export interface ImportStats {
  rows: number; duplicates: number; accountsCreated: number; accountsMerged: number; contactsCreated: number; contactsMerged: number;
  links: number; fieldsCreated: number; zonesCreated: number; noCompany: number; toNotes: number; unknownOwners: string[];
  /** Lo necesario para deshacer: lo creado se borra por import_id; lo fusionado vuelve a como estaba. */
  undo?: ImportUndo;
}
export interface ImportUndo {
  fieldIds: string[];
  zoneIds: string[];
  accounts: Array<{ id: string; before: { fields: FieldValues; tags: string[]; notes: string | null; zoneId: string | null; parentId: string | null } }>;
  contacts: Array<{ id: string; before: Omit<ContactPatch, 'ownerId' | 'name'> }>;
  /** Vínculos nuevos entre una persona y una empresa que ya existían (los demás se van con lo importado). */
  links: Array<{ contactId: string; accountId: string }>;
}
export interface CrmImport {
  id: string; tenantId: string; createdBy: string | null; fileName: string; target: 'account' | 'contact';
  headers: string[]; rows: string[][]; mapping: ImportMapping; status: 'draft' | 'done' | 'undone'; stats: Partial<ImportStats>;
  createdAt: string; doneAt: string | null;
}
