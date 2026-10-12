/** Zonas y cuentas (docs/ACCOUNTS.md) y campos del CRM (docs/CRM_DINAMICO.md). */
import type { FieldValues } from '../crm/fields';
import type { Qualification } from '../crm/priority';
import type { PlaceResult } from '../crm/places';
export type ZoneKind = 'country' | 'region' | 'province' | 'city' | 'area';
export type AccountStatus = 'open' | 'customer' | 'blocked';
export type Eligibility = 'eligible' | 'claimed_by_other' | 'blocked' | 'out_of_zone' | 'no_account';
export type AccountDecision = 'approved' | 'rejected';
export type TouchKind = 'created' | 'contact' | 'dossier' | 'won' | 'lost' | 'claim' | 'release' | 'block' | 'unblock' | 'assign';

/**
 * Tipo de cliente (docs/CRM_DINAMICO.md §21): cada espacio define los suyos. «company» es el principal (no se borra,
 * se renombra: «Centro de buceo» en Oquea); los demás, los que el admin quiera («dj» en Enjoy).
 */
export type AccountKind = string;
export const BASE_KIND = 'company';
/** Qué ficha tiene cada tipo (§24): un local, una promotora o un DJ; cada uno con sus preguntas y su nota. */
export const PROFILES = ['venue', 'promoter', 'dj'] as const;
export type Profile = (typeof PROFILES)[number];
export interface KindDef { key: string; label: string; plural: string; icon: string; profile?: Profile }
export const KIND_ICONS = ['building2', 'store', 'music', 'mic', 'users', 'heart-handshake', 'party-popper', 'ticket', 'hotel', 'utensils', 'wine', 'waves', 'anchor', 'fish', 'ship', 'briefcase', 'graduation-cap', 'heart', 'star', 'globe'] as const;
export const DEFAULT_KINDS: KindDef[] = [{ key: BASE_KIND, label: 'Empresa', plural: 'Empresas', icon: 'building2', profile: 'venue' }];
/** La ficha de un tipo (si no se sabe, la de un local). */
export const profileOf = (kinds: KindDef[], key: string | null | undefined): Profile => kinds.find((k) => k.key === key)?.profile ?? 'venue';
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Lo guardado → lista válida: el principal siempre el primero, claves únicas, como mucho 12, iconos conocidos. */
export function normalizeKinds(raw: unknown): KindDef[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: KindDef[] = [];
  for (const x of list) {
    const r = (x ?? {}) as Record<string, unknown>;
    const key = String(r.key ?? '').trim();
    const label = String(r.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!KEY_RE.test(key) || !label || out.some((k) => k.key === key)) continue;
    const plural = String(r.plural ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || label;
    const icon = (KIND_ICONS as readonly string[]).includes(String(r.icon)) ? String(r.icon) : 'building2';
    const profile = (PROFILES as readonly string[]).includes(String(r.profile)) ? (r.profile as Profile) : 'venue';
    out.push({ key, label, plural, icon, profile });
  }
  const base = out.find((k) => k.key === BASE_KIND) ?? DEFAULT_KINDS[0];
  return [base, ...out.filter((k) => k.key !== BASE_KIND)].slice(0, 12);
}
/** Motivos de descarte: los de visitar (§23) primero; los de limpiar el CRM (§17) después. */
export const DISCARD_REASONS = ['no_fit', 'not_interested', 'avoid', 'closed', 'not_sector', 'partner', 'duplicate', 'other'] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];
export interface Zone { id: string; tenantId: string; parentId: string | null; name: string; kind: ZoneKind; position: number; /** Su punto en el mapa (§16). */ lat?: number | null; lng?: number | null }
/** Un movimiento de empresa (arreglos en bloque: ordenar ciudades). zoneId null = sin zona. */
export interface AccountMove { id: string; zoneId: string | null; notes: string | null; tags: string[] }
/** Arreglo de datos con su deshacer (crm_fix). */
export interface CrmFix { id: string; kind: 'zones' | 'classify'; summary: Record<string, unknown>; undo: { moves?: AccountMove[]; zoneIds?: string[]; kinds?: Array<{ id: string; kind: AccountKind; reason: DiscardReason | null; note: string | null }> }; createdAt: string; undoneAt: string | null }
/** Una búsqueda de clientes en Google Maps (docs/CRM_DINAMICO.md §19): lo que salió y lo que se importó (id de Google → empresa). */
export interface Sweep {
  id: string; tenantId: string; query: string; zoneId: string | null; zoneLabel: string; segmentId: string | null;
  /** Vacío en los listados (solo `found`); entero al abrir una. */
  results: PlaceResult[]; found: number; imported: Record<string, string>; createdBy: string | null; createdAt: string;
}
/** Un dato clave de una empresa: «fact» (cómo es) o «fit» (qué le encaja de lo que vendemos). */
/** Un punto de «Lo que sabemos». `key`: de lo más importante para vender (sale arriba, en grande). */
export interface AccountFact { id: string; text: string; kind: 'fact' | 'fit'; at: string; by: string | null; key?: boolean }
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
  /** Promotoras y DJs (§24): TikTok y su música (Spotify, SoundCloud). */
  tiktok: string | null; musicUrl: string | null;
  /** Titular (§25): razón social y CIF de la sociedad, del aviso legal de su web o a mano. */
  legalName: string | null; taxId: string | null;
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
  /** Tipo (§17): empresa de verdad o DJ/artista; y si está descartada (con motivo y nota; se puede recuperar). */
  kind: AccountKind; discardedAt: string | null; discardReason: DiscardReason | null; discardNote: string | null;
  /** «Lo que sabemos» (§20): datos clave, lo más nuevo primero. */
  facts: AccountFact[];
  /** Investigación con IA (§13): cuándo se hizo la última (el detalle se lee aparte, con getAiResearch). */
  aiResearchAt: string | null;
}
export const ACCOUNT_CONTACT_KEYS = ['phone', 'email', 'instagram', 'facebook', 'linkedin', 'website', 'mapsUrl', 'tiktok', 'musicUrl', 'legalName', 'taxId'] as const;
export type AccountContact = Partial<Pick<Account, (typeof ACCOUNT_CONTACT_KEYS)[number]>>;

export interface AccountTouch { id: string; accountId: string; userId: string | null; kind: TouchKind; note: string | null; createdAt: string }

/** Cómo ve la cuenta quien la mira (lista y ficha). */
export type AccountState = 'free' | 'mine' | 'taken' | 'my_customer' | 'customer' | 'blocked';
