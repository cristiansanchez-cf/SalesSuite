/** Acceso a datos de los leads. Supabase (service role en la entrada y el cron; sesión del usuario en la consola) o memoria (demo). */
import type { Lead, LeadEvent, LeadMessage, LeadPatch, LeadSettings, MessagePatch, NewEvent, NewLead, NewMessage, NewSubmission, Submission, View } from './types';

export class DuplicateKey extends Error {}

export interface LeadsDb {
  settings(tenantId: string): Promise<LeadSettings | null>;
  settingsByWhatsappPhone(phoneId: string): Promise<LeadSettings | null>;
  saveSettings(s: LeadSettings): Promise<void>;

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

  suppressed(tenantId: string, values: { email?: string | null; phone?: string | null }): Promise<{ email: boolean; whatsapp: boolean }>;
  suppress(tenantId: string, channel: 'email' | 'whatsapp' | 'all', value: string, reason: string): Promise<void>;

  list(tenantId: string, view: View, opts?: { q?: string; limit?: number }): Promise<Lead[]>;
  counts(tenantId: string): Promise<{ inbox: number; quarantine: number }>;
}
