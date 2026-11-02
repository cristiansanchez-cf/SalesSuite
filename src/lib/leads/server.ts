/**
 * Lo que necesitan las rutas públicas de leads (endpoint, cron, webhook, baja): la base de datos con service role
 * (o la demo en memoria), Resend, WhatsApp y el secreto. Los secretos viven solo aquí, en el servidor.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';
import { demoMailer, resendMailer, type Mailer } from '../notify/mailer';
import type { LeadsDb } from './db';
import { leadsSecret, type PrivacyDb } from './privacy';
import { open } from './secret-box';
import { claudeClassifier, fixtureClassifier, type Classifier } from './classify';
import { cloudWhatsApp, demoWhatsApp, type WhatsApp } from './whatsapp';

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export interface LeadsRuntime {
  db: LeadsDb; mailer: Mailer | null; whatsapp: WhatsApp | null; secret: string; demo: boolean;
  /** Plazos de conservación y derechos (service role): privacy.ts. */
  privacy: PrivacyDb;
  /** Cuenta de Resend de cada empresa: la suya si guardó clave; si no, la de la plataforma. */
  mailerFor: (tenantId: string) => Promise<Mailer | null>;
  /** Clasificar cada lead con IA (si hay clave; con AI_RESEARCH_FIXTURE=1, la de pruebas). */
  classifier: Classifier | null;
}

/** null + motivo si falta configuración (el endpoint responde 503 y lo dice en los registros). */
export async function leadsRuntime(): Promise<LeadsRuntime | { error: string }> {
  if (appMode() === 'demo') {
    const { demoLeadsDb } = await import('./db-demo');
    const { demoPrivacyDb } = await import('./privacy-db-demo');
    return { db: demoLeadsDb(), privacy: demoPrivacyDb(), mailer: demoMailer, whatsapp: demoWhatsApp, secret: leadsSecret()!, demo: true, mailerFor: async () => demoMailer, classifier: classifierFromEnv() };
  }
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const secret = leadsSecret();
  if (!key) return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY' };
  if (!secret) return { error: 'Falta LEADS_SECRET (o CRON_SECRET)' };
  const { supabaseLeadsDb } = await import('./db-supabase');
  const { supabasePrivacyDb } = await import('./privacy-db-supabase');
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const mailer = env('RESEND_API_KEY') && env('RESEND_FROM') ? resendMailer(env('RESEND_API_KEY')!, env('RESEND_FROM')!) : null;
  const wa = env('WHATSAPP_TOKEN') ? cloudWhatsApp(env('WHATSAPP_TOKEN')!) : null;
  const db = supabaseLeadsDb(sb);
  return { db, privacy: supabasePrivacyDb(sb), mailer, whatsapp: wa, secret, demo: false, mailerFor: mailerFactory(db, mailer, secret), classifier: classifierFromEnv() };
}

/** Cloudflare Turnstile (opcional): solo si hay TURNSTILE_SECRET. */
export function turnstileVerifier(): ((token: string, ip: string | null) => Promise<boolean>) | null {
  const secret = env('TURNSTILE_SECRET');
  if (!secret) return null;
  return async (token, ip) => {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1200);
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: ctl.signal });
      return ((await r.json()) as { success?: boolean }).success === true;
    } finally { clearTimeout(timer); }
  };
}

/** IP del cliente detrás de Vercel (x-forwarded-for: la primera). Solo se usa su hash. */
export function clientIp(req: Request): string | null {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

/**
 * Resend por empresa (docs/LEADS.md §Resend). Con clave propia, envía su cuenta y el remitente por defecto es el de sus
 * ajustes (su dominio); sin ella, la cuenta de la plataforma. Se recuerda unos minutos por ejecución.
 */
export function mailerFactory(db: LeadsDb, platform: Mailer | null, secret: string, fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { at: number; m: Mailer | null }>();
  return async (tenantId: string): Promise<Mailer | null> => {
    const hit = cache.get(tenantId);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.m;
    const key = open(await db.resendKey(tenantId).catch(() => null), secret);
    let m = platform;
    if (key) {
      const s = await db.settings(tenantId);
      const from = s?.fromEmail ? (s.fromName ? `${s.fromName.replace(/[<>"]/g, '')} <${s.fromEmail}>` : s.fromEmail) : null;
      m = from ? resendMailer(key, from, fetchImpl) : null;
    }
    cache.set(tenantId, { at: Date.now(), m });
    return m;
  };
}

function classifierFromEnv(): Classifier | null {
  if (env('AI_RESEARCH_FIXTURE') === '1') return fixtureClassifier;
  const k = env('ANTHROPIC_API_KEY');
  return k ? claudeClassifier(k) : null;
}
