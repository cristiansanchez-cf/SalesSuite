/**
 * Lo que necesitan las rutas públicas de leads (endpoint, cron, webhook, baja): la base de datos con service role
 * (o la demo en memoria), Resend, WhatsApp y el secreto. Los secretos viven solo aquí, en el servidor.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';
import { demoMailer, resendMailer, type Mailer } from '../notify/mailer';
import type { LeadsDb } from './db';
import { cloudWhatsApp, demoWhatsApp, type WhatsApp } from './whatsapp';

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export interface LeadsRuntime { db: LeadsDb; mailer: Mailer | null; whatsapp: WhatsApp | null; secret: string; demo: boolean }

/** null + motivo si falta configuración (el endpoint responde 503 y lo dice en los registros). */
export async function leadsRuntime(): Promise<LeadsRuntime | { error: string }> {
  if (appMode() === 'demo') {
    const { demoLeadsDb } = await import('./db-demo');
    return { db: demoLeadsDb(), mailer: demoMailer, whatsapp: demoWhatsApp, secret: env('LEADS_SECRET') || 'demo-leads-secret', demo: true };
  }
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const secret = env('LEADS_SECRET') || env('CRON_SECRET');
  if (!key) return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY' };
  if (!secret) return { error: 'Falta LEADS_SECRET (o CRON_SECRET)' };
  const { supabaseLeadsDb } = await import('./db-supabase');
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const mailer = env('RESEND_API_KEY') && env('RESEND_FROM') ? resendMailer(env('RESEND_API_KEY')!, env('RESEND_FROM')!) : null;
  const wa = env('WHATSAPP_TOKEN') ? cloudWhatsApp(env('WHATSAPP_TOKEN')!) : null;
  return { db: supabaseLeadsDb(sb), mailer, whatsapp: wa, secret, demo: false };
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
