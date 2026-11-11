/** Acceso a datos de los leads. Supabase (service role en la entrada y el cron; sesión del usuario en la consola) o memoria (demo). */
import type { Lead, LeadEvent, LeadMessage, LeadPatch, LeadSettings, MessagePatch, NewEvent, NewLead, NewMessage, NewSubmission, Submission, View } from './types';

/** Las pruebas que se mandan desde la consola (Leads entrantes → Conecta tu web) llevan esta idempotency_key. */
export const CONSOLE_TEST_PREFIX = 'console-test-';

export class DuplicateKey extends Error {}

export interface LeadsDb {
  settings(tenantId: string): Promise<LeadSettings | null>;
  settingsByWhatsappPhone(phoneId: string): Promise<LeadSettings | null>;
  saveSettings(s: LeadSettings): Promise<void>;
  /** Clave propia de Resend, cifrada (solo con service role). */
  resendKey(tenantId: string): Promise<string | null>;
  setResendKey(tenantId: string, sealed: string | null, hint: string | null, by: string | null): Promise<void>;

  submissionByKey(tenantId: string, key: string): Promise<Submission | null>;
  leadByEmail(tenantId: string, email: string, isTest: boolean): Promise<Lead | null>;
  leadsByPhone(tenantId: string, e164: string): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  insertLead(l: NewLead): Promise<Lead>;
  /** Devuelve false si no ha cambiado nada (sin permiso o no existe). */
  updateLead(id: string, patch: LeadPatch): Promise<boolean>;
  /** Lanza DuplicateKey si la clave de idempotencia ya existe. */
  insertSubmission(s: NewSubmission): Promise<string>;
  setSubmissionResponse(id: string, response: Record<string, unknown>): Promise<void>;
  countSubmissions(tenantId: string, by: { ipHash?: string; leadId?: string }, sinceIso: string): Promise<number>;
  submissions(leadId: string): Promise<Submission[]>;

  addEvent(e: NewEvent): Promise<void>;
  events(leadId: string): Promise<LeadEvent[]>;

  enqueue(ms: NewMessage[]): Promise<void>;
  messages(leadId: string): Promise<LeadMessage[]>;
  dueMessages(nowIso: string, limit: number, leadId?: string): Promise<LeadMessage[]>;
  /** pending → sending, solo si sigue pendiente (dos cron a la vez no mandan dos veces). */
  claimMessage(id: string): Promise<boolean>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  /** Cancela lo pendiente de un lead (todo o esos pasos). Devuelve cuántos. */
  cancelPending(leadId: string, steps: string[] | null): Promise<number>;

  /** La lista de supresión guarda el hash del valor (privacy.ts), nunca el email o el teléfono. */
  suppressed(tenantId: string, values: { email?: string | null; phone?: string | null }): Promise<{ email: boolean; whatsapp: boolean }>;
  suppress(tenantId: string, channel: 'email' | 'whatsapp' | 'all', value: string, reason: string): Promise<void>;

  /** Sin los anonimizados, salvo `anonymized` (las métricas). */
  list(tenantId: string, view: View, opts?: { q?: string; limit?: number; anonymized?: boolean }): Promise<Lead[]>;
  counts(tenantId: string): Promise<{ inbox: number; quarantine: number }>;
  /** Los tipos que le llegan (tipo, `event_type` y `intent` de sus últimos envíos): para no enseñar los de otra empresa. */
  usedKinds(tenantId: string): Promise<string[]>;
  /** El último envío que llegó de la web (pruebas incluidas): para saber si la web ya está conectada. */
  /** El último envío recibido; `external`: sin contar las pruebas mandadas desde la consola (CONSOLE_TEST_PREFIX). */
  lastSubmission(tenantId: string, opts?: { external?: boolean }): Promise<{ at: string; test: boolean } | null>;
}
