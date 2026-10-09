/** Comisiones (docs/COMMISSIONS.md). Todos los importes en céntimos enteros. */
import type { Role } from '../admin/types';
import type { AccountDecision, Eligibility } from '../accounts/types';

export type EventKind = 'sale' | 'recurring' | 'volume' | 'metric' | 'refund';
export type EventStatus = 'pending' | 'confirmed' | 'void';

export interface RevenueEvent {
  id: string;
  tenantId: string;
  source: string;
  externalId: string;
  kind: EventKind;
  status: EventStatus;
  occurredAt: string;
  /** Importe bruto (venta, cuota, volumen procesado; en devoluciones, lo devuelto). */
  amountCents: number;
  /** Lo que ingresa la empresa: la base de los porcentajes. */
  revenueCents: number;
  currency: string;
  accountId: string | null;
  dossierId: string | null;
  sellerId: string | null;
  offer: string | null;
  metric: string | null;
  quantity: number | null;
  /** Devolución: evento original. */
  refundsEventId: string | null;
  note: string | null;
  createdAt: string;
}

export interface RuleWhen {
  kinds?: EventKind[];
  offers?: string[];
  zoneIds?: string[];
  minCents?: number;
  maxCents?: number;
  /** Meses desde que se ganó la cuenta: desde (incluido) … hasta (excluido). «6 primeros meses» = 0…6. */
  monthsFrom?: number;
  monthsTo?: number;
  /** Desde cuándo cuentan los meses: que se ganó la cuenta (por defecto) o su primer ingreso («6 meses desde la primera transacción»). */
  monthsAnchor?: 'won' | 'first';
  roles?: Role[];
}
export type RulePay =
  | { type: 'percent'; bps: number }
  | { type: 'fixed'; cents: number }
  | { type: 'bounty'; metric: string; threshold: number; cents: number };
export interface Rule { id: string; label: string; when: RuleWhen; pay: RulePay }
export interface Referral { bps: number; months: number }
export interface Plan { id: string; tenantId: string; name: string; isDefault: boolean; rules: Rule[]; referral: Referral | null; updatedAt: string }

export type EntryKind = 'commission' | 'referral' | 'bounty' | 'refund' | 'adjustment';
export type EntryStatus = 'pending' | 'approved' | 'paid' | 'void' | 'ineligible';
export interface Entry {
  id: string;
  tenantId: string;
  userId: string;
  eventId: string | null;
  dedupeKey: string;
  kind: EntryKind;
  ruleId: string | null;
  ruleLabel: string | null;
  baseCents: number;
  amountCents: number;
  currency: string;
  period: string;
  status: EntryStatus;
  reason: string | null;
  accountId: string | null;
  payoutId: string | null;
  createdAt: string;
}
export type EntryDraft = Omit<Entry, 'id' | 'tenantId' | 'payoutId' | 'createdAt'>;

export interface Payout { id: string; tenantId: string; userId: string; period: string; totalCents: number; currency: string; status: 'open' | 'paid'; paidAt: string | null; createdAt: string }

/** Lo que el motor necesita saber del mundo (lo carga el servicio). */
export interface EngineContext {
  plans: Plan[];
  /** Plan asignado a cada persona (si no, el de por defecto). */
  planOf: Map<string, string>;
  members: Map<string, { role: Role; invitedBy: string | null; joinedAt: string | null }>;
  accounts: Map<string, { zoneId: string | null; wonAt: string | null; wonBy: string | null; ownerId: string | null; status: string; firstAt?: string | null }>;
  dossiers: Map<string, { authorId: string | null; accountId: string | null; eligibility: Eligibility | null; decision: AccountDecision | null }>;
  zones: Array<{ id: string; parentId: string | null }>;
  /** Líneas ya guardadas (para devoluciones y deduplicación). */
  existing: Entry[];
}
export interface EngineResult { entries: EntryDraft[]; skipped: Array<{ eventId: string; reason: string }> }

/** Cupón del catálogo (docs/COMMISSIONS.md §6). */
export interface Coupon {
  id: string; tenantId: string; code: string; label: string; kind: 'percent' | 'fixed' | 'free_months'; value: number;
  maxUses: number | null; validUntil: string | null; active: boolean; note: string | null; uses: number;
}

/** Condiciones de una persona (opcionales: solo se enseñan cuando el admin las marca como acordadas). */
export interface MemberConditions { userId: string; visible: boolean; note: string | null; agreedAt: string | null }
/** Una foto del historial de condiciones (docs/FOUNDATIONS.md §9): qué se acordó y qué plan aplicaba. */
export interface ConditionsChange { userId: string; visible: boolean; note: string | null; plan: { name: string; rules: Rule[]; referral: Referral | null } | null; changedBy: string | null; changedAt: string }
/** team: no son condiciones acordadas con esta persona, sino las del equipo (plan por defecto con show_to_team). */
export interface MyConditions { visible: boolean; team?: boolean; note: string | null; agreedAt: string | null; plan: { name: string; rules: Rule[]; referral: Referral | null } | null }
