/** Zonas y cuentas (docs/ACCOUNTS.md) y campos del CRM (docs/CRM_DINAMICO.md). */
import type { FieldValues } from '../crm/fields';
import type { Qualification } from '../crm/priority';
export type ZoneKind = 'country' | 'region' | 'province' | 'city' | 'area';
export type AccountStatus = 'open' | 'customer' | 'blocked';
export type Eligibility = 'eligible' | 'claimed_by_other' | 'blocked' | 'out_of_zone' | 'no_account';
export type AccountDecision = 'approved' | 'rejected';
export type TouchKind = 'created' | 'contact' | 'dossier' | 'won' | 'lost' | 'claim' | 'release' | 'block' | 'unblock' | 'assign';

export interface Zone { id: string; tenantId: string; parentId: string | null; name: string; kind: ZoneKind; position: number }
/** Un movimiento de empresa (arreglos en bloque: ordenar ciudades). zoneId null = sin zona. */
export interface AccountMove { id: string; zoneId: string | null; notes: string | null; tags: string[] }
/** Arreglo de datos con su deshacer (crm_fix). */
export interface CrmFix { id: string; kind: 'zones'; summary: Record<string, unknown>; undo: { moves?: AccountMove[]; zoneIds?: string[] }; createdAt: string; undoneAt: string | null }
export interface ZoneAssignment { userId: string; zoneId: string }
export interface AccountRules { claimDays: number; strictZones: boolean; requireAccount: boolean }
export const DEFAULT_RULES: AccountRules = { claimDays: 30, strictZones: false, requireAccount: false };

export interface Account {
  id: string;
  tenantId: string;
  name: string;
  zoneId: string | null;
  segmentId: string | null;
  address: string | null;
  externalRef: string | null;
  notes: string | null;
  status: AccountStatus;
  blockedReason: string | null;
  ownerId: string | null;
  claimedUntil: string | null;
  lastTouchAt: string | null;
  lastTouchBy: string | null;
  wonAt: string | null;
  wonBy: string | null;
  wonDossierId: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Valores de los campos del CRM del espacio (clave → valor). */
  fields: FieldValues;
  /** Grupo al que pertenece (otra empresa). Un solo nivel. */
  parentId: string | null;
  /** Listas en las que está (p. ej. «proveedores-bodas»). */
  tags: string[];
  importId: string | null;
  /** Contacto de la empresa (docs/CRM_DINAMICO.md §10). */
  phone: string | null; email: string | null; instagram: string | null; facebook: string | null; linkedin: string | null; website: string | null; mapsUrl: string | null;
  /** Próximo paso (lo que sale en «Hoy»). */
  nextStep: string | null; nextStepAt: string | null; nextContactId: string | null; nextChannel: string | null;
  /** Cualificación para la prioridad (docs/CRM_DINAMICO.md §11). */
  qualification: Qualification;
  /** Google Places: horario y ubicación (para la ruta del día). */
  placeId: string | null; hours: string[] | null; lat: number | null; lng: number | null; placeStatus: string | null; placeAt: string | null;
  /** Google: valoración, reseñas y foto (nombre en Places; la imagen se pide al verla, §15). */
  placeRating: number | null; placeReviews: number | null; placePhoto: string | null;
  /** Lo que rellenó la ficha de Google elegida (campo → valor), para poder cambiarla o quitarla. */
  placeFilled: Record<string, string> | null;
  /** Investigación con IA (§13): cuándo se hizo la última (el detalle se lee aparte, con getAiResearch). */
  aiResearchAt: string | null;
}
export const ACCOUNT_CONTACT_KEYS = ['phone', 'email', 'instagram', 'facebook', 'linkedin', 'website', 'mapsUrl'] as const;
export type AccountContact = Partial<Pick<Account, (typeof ACCOUNT_CONTACT_KEYS)[number]>>;

export interface AccountTouch { id: string; accountId: string; userId: string | null; kind: TouchKind; note: string | null; createdAt: string }

/** Cómo ve la cuenta quien la mira (lista y ficha). */
export type AccountState = 'free' | 'mine' | 'taken' | 'my_customer' | 'customer' | 'blocked';
