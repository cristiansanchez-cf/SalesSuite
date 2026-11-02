/** Leads de las webs (docs/LEADS.md). */
import type { Attribution, LeadType } from './contract';
import type { EmailKind } from './normalize';

export const STAGES = ['new', 'contacted', 'replied', 'booked', 'meeting', 'opportunity', 'won', 'lost', 'nurture', 'discarded', 'spam'] as const;
export type Stage = (typeof STAGES)[number];
/** Etapas en las que la secuencia automática ya no tiene sentido (sigue una persona o se cerró). */
export const STOP_STAGES: Stage[] = ['replied', 'booked', 'meeting', 'opportunity', 'won', 'lost', 'nurture', 'discarded', 'spam'];

export interface LeadSettings {
  tenantId: string;
  enabled: boolean;
  brand: string;
  allowedOrigins: string[];
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  signerName: string | null;
  notifyEmails: string[];
  bookingUrl: string | null;
  videoUrl: string | null;
  whatsappPhoneId: string | null;
  whatsappEnabled: boolean;
  /** { wa1: { es: 'nombre_plantilla', en: …, fr: … }, wa2: {…} } — los nombres aprobados en Meta. */
  whatsappTemplates: Record<string, Record<string, string>>;
  timezone: string;
  sendFromHour: number;
  sendToHour: number;
  holidays: string[];
  /** Pista de la clave propia de Resend («re_…abcd»); null = usa la de la plataforma. */
  resendKeyHint?: string | null;
  /** Textos propios de la empresa por idioma (vacío = los de por defecto). */
  templates?: LeadTemplates;
  /** Qué vende la empresa y a quién (para clasificar los leads). */
  aiContext?: string | null;
  /** Firma del email automático (vacía = solo el nombre y la marca). */
  emailSignature?: EmailSignature;
  /** Vídeo y enlace de reserva por tipo de lead y por idioma (lo que falte: el del tipo «general» y luego los de arriba). */
  media?: LeadMedia;
}

export interface MediaLinks { video?: string; booking?: string }
/** { venue: { es: { video, booking }, en: {…} }, … } */
export type LeadMedia = Partial<Record<string, Partial<Record<'es' | 'en' | 'fr', MediaLinks>>>>;

export interface EmailSignature { name?: string; title?: string; phone?: string; address?: string; email?: string; website?: string; logoUrl?: string; legal?: string }

export type QuestionKey = 'venue' | 'dj' | 'festival' | 'wedding' | 'general';
export interface LocaleTexts { subject?: string; body?: string; wa1?: string; wa2?: string; questions?: Partial<Record<QuestionKey, string>> }
export type LeadTemplates = Partial<Record<'es' | 'en' | 'fr', LocaleTexts>>;

export interface Lead {
  id: string;
  tenantId: string;
  createdAt: string;
  isTest: boolean;
  email: string;
  emailKind: EmailKind;
  domain: string | null;
  name: string;
  phoneRaw: string | null;
  phoneE164: string | null;
  type: LeadType;
  locale: string;
  stage: Stage;
  stageAt: string;
  discardReason: string | null;
  quarantined: boolean;
  quarantineReasons: string[];
  validatedAt: string | null;
  validatedBy: string | null;
  score: number | null;
  scoreDetail: { fit: number; intent: number; band: string; detail: string[] } | null;
  facts: Record<string, unknown>;
  attributionFirst: Attribution | null;
  attributionLast: Attribution | null;
  consentMarketing: boolean;
  consentAds: boolean;
  whatsappOk: boolean;
  firstResponseAt: string | null;
  firstResponseMins: number | null;
  lastInboundAt: string | null;
  sequenceStoppedAt: string | null;
  sequenceStopReason: string | null;
  submissions: number;
  lastSubmissionAt: string;
  accountId: string | null;
  contactId: string | null;
}
export type NewLead = Omit<Lead, 'id' | 'createdAt' | 'stage' | 'stageAt' | 'discardReason' | 'validatedAt' | 'validatedBy' | 'firstResponseAt' | 'firstResponseMins'
  | 'lastInboundAt' | 'sequenceStoppedAt' | 'sequenceStopReason' | 'accountId' | 'contactId' | 'submissions' | 'lastSubmissionAt'> & { createdAt?: string };
export type LeadPatch = Partial<Omit<Lead, 'id' | 'tenantId' | 'createdAt' | 'isTest' | 'email'>>;

export interface Submission {
  id: string;
  tenantId: string;
  leadId: string;
  receivedAt: string;
  idempotencyKey: string;
  schema: string;
  isTest: boolean;
  type: LeadType;
  fields: Record<string, string>;
  message: string | null;
  consent: Record<string, unknown>;
  context: Record<string, unknown>;
  origin: string | null;
  ipHash: string | null;
  spamReasons: string[];
  response: Record<string, unknown>;
}
export type NewSubmission = Omit<Submission, 'id' | 'receivedAt'> & { receivedAt?: string };

export type EventKind = 'submission' | 'stage' | 'message_out' | 'message_in' | 'note' | 'validated' | 'quarantine' | 'suppressed';
export interface LeadEvent { id: string; tenantId: string; leadId: string; at: string; kind: EventKind; fromStage: string | null; toStage: string | null; byUser: string | null; data: Record<string, unknown> }
export type NewEvent = Omit<LeadEvent, 'id' | 'at' | 'fromStage' | 'toStage' | 'byUser'> & { at?: string; fromStage?: string | null; toStage?: string | null; byUser?: string | null };

export type Step = 'autoreply' | 'notify' | 'wa1' | 'wa2';
export type MsgStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
export interface LeadMessage {
  id: string; tenantId: string; leadId: string; createdAt: string; channel: 'email' | 'whatsapp'; step: Step; toAddr: string; sendAt: string;
  status: MsgStatus; attempts: number; sentAt: string | null; providerId: string | null; error: string | null; payload: Record<string, unknown>;
}
export type NewMessage = Pick<LeadMessage, 'tenantId' | 'leadId' | 'channel' | 'step' | 'toAddr' | 'sendAt'> & { payload?: Record<string, unknown> };
export type MessagePatch = Partial<Pick<LeadMessage, 'status' | 'attempts' | 'sentAt' | 'providerId' | 'error' | 'sendAt' | 'payload'>>;

export type View = 'inbox' | 'quarantine' | 'active' | 'closed' | 'test' | 'all';
