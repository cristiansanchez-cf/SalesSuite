/**
 * Estado de la configuración de los leads entrantes (docs/PLAN_AJUSTES.md): qué paso está sin empezar, a medias o hecho,
 * y qué le falta. Lo usan «Leads entrantes» (las tarjetas) y los ajustes (la lista de arriba y el botón de activar).
 */
import type { LeadSettings } from './types';

export type StepStatus = 'todo' | 'partial' | 'done';
export type StepKey = 'connect' | 'email' | 'messages' | 'whatsapp' | 'extras' | 'privacy';
export type StepNeed = 'required' | 'recommended' | 'optional';
/** Lo que falta, por clave (los textos van en i18n). */
export type Missing = 'lead' | 'resend' | 'sender' | 'notify' | 'texts' | 'signature' | 'waToken' | 'waPhone' | 'waTemplates' | 'waOn';
export interface SetupStep { key: StepKey; need: StepNeed; status: StepStatus; missing: Missing[] }

export interface Domain { name: string; status: string }
export interface SetupInput {
  settings: LeadSettings;
  /** Dominios de su propia cuenta de Resend (null si usa la de la plataforma o no se pudo leer). */
  domains: Domain[] | null;
  /** Hay un lead (real o de prueba) recibido. */
  received: boolean;
  demo: boolean;
  /** La plataforma tiene su cuenta de Resend (RESEND_API_KEY y RESEND_FROM). */
  platformMail: boolean;
  /** La plataforma tiene el token de WhatsApp. */
  platformWa: boolean;
}

/** Lo obligatorio para activar: cómo sale el email (cuenta y dominio), quién recibe las respuestas y a quién avisar. */
export function readiness(st: LeadSettings, doms: Domain[] | null, o: { demo: boolean; platformMail: boolean }) {
  const fromDomain = st.fromEmail?.split('@')[1]?.toLowerCase() ?? null;
  const covers = (d: Domain) => d.status === 'verified' && !!fromDomain && (fromDomain === d.name || fromDomain.endsWith(`.${d.name}`));
  const resend = o.demo || (st.resendKeyHint ? !!doms && !!st.fromEmail && doms.some(covers) : o.platformMail);
  const sender = !!st.replyTo && (!st.resendKeyHint || !!st.fromEmail);
  const notify = st.notifyEmails.length > 0;
  return { resend, sender, notify, ready: resend && sender && notify };
}

const statusOf = (done: boolean, started: boolean): StepStatus => (done ? 'done' : started ? 'partial' : 'todo');
const hasMedia = (s: LeadSettings) => Object.values(s.media ?? {}).some((byLoc) => Object.values(byLoc ?? {}).some((x) => !!(x?.video || x?.booking)));

export function leadSetupSteps(x: SetupInput): SetupStep[] {
  const s = x.settings;
  const r = readiness(s, x.domains, x);
  const ownTexts = !!s.templates && Object.keys(s.templates).length > 0;
  const sig = !!s.emailSignature && Object.values(s.emailSignature).some((v) => !!String(v ?? '').trim());
  const waToken = x.demo || x.platformWa;
  const waTemplates = Object.values(s.whatsappTemplates?.wa1 ?? {}).some(Boolean);
  const waOn = waToken && !!s.whatsappPhoneId && s.whatsappEnabled;

  const connectMissing: Missing[] = x.received ? [] : ['lead'];
  const emailMissing = (['resend', 'sender', 'notify'] as const).filter((k) => !r[k]);
  const msgMissing: Missing[] = [...(ownTexts ? [] : ['texts' as const]), ...(sig ? [] : ['signature' as const])];
  const waMissing: Missing[] = [
    ...(waToken ? [] : ['waToken' as const]), ...(s.whatsappPhoneId ? [] : ['waPhone' as const]),
    ...(waTemplates ? [] : ['waTemplates' as const]), ...(s.whatsappEnabled ? [] : ['waOn' as const]),
  ];
  return [
    { key: 'connect', need: 'required', status: statusOf(x.received, s.allowedOrigins.length > 0), missing: connectMissing },
    { key: 'email', need: 'required', status: statusOf(r.ready, emailMissing.length < 3 && (!!s.fromEmail || !!s.replyTo || !!s.resendKeyHint)), missing: emailMissing },
    { key: 'messages', need: 'recommended', status: statusOf(ownTexts && sig, ownTexts || sig), missing: msgMissing },
    { key: 'whatsapp', need: 'optional', status: statusOf(waOn, !!s.whatsappPhoneId || waTemplates || s.whatsappEnabled), missing: waOn ? [] : waMissing },
    { key: 'extras', need: 'optional', status: statusOf(!!(s.videoUrl || s.bookingUrl) || hasMedia(s), false), missing: [] },
    // Los plazos llevan valores recomendados desde el principio.
    { key: 'privacy', need: 'optional', status: 'done', missing: [] },
  ];
}

/** Pasos obligatorios hechos / totales. */
export function requiredProgress(steps: SetupStep[]) {
  const req = steps.filter((s) => s.need === 'required');
  return { done: req.filter((s) => s.status === 'done').length, total: req.length };
}
