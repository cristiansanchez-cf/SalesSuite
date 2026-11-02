/**
 * Correos al CRM (docs/CRM_DINAMICO.md §47): lo que necesita el webhook de Resend. Variables de entorno:
 * - INBOUND_EMAIL_DOMAIN: el dominio de las direcciones «apuntar-…@» (el de recepción de Resend: p. ej. in.cofundo.io).
 * - RESEND_INBOUND_SECRET: el secreto de firma del webhook «email.received» (whsec_…).
 * - RESEND_API_KEY: la de la plataforma (para leer el cuerpo del correo recibido).
 */
import { createClient } from '@supabase/supabase-js';
import { contextAs } from '../admin/auth';
import { env } from '../env';
import { appMode } from '../mode';
import { publicRepository } from '../data';
import { leadsRuntime } from '../leads/server';
import type { FullEmail, ProcessDeps } from './process';
import { htmlToText } from './parse';

export const inboxDomain = () => (env('INBOUND_EMAIL_DOMAIN') ?? '').trim().toLowerCase() || null;

/** En demo no hay Resend: el webhook de prueba trae el correo entero y se guarda aquí hasta procesarlo. */
const DEMO_RECEIVED: Map<string, FullEmail> = ((globalThis as { __demoReceived?: Map<string, FullEmail> }).__demoReceived ??= new Map());
export const demoReceived = DEMO_RECEIVED;

/** Lee el correo recibido en Resend (GET /emails/receiving/{id}). */
export function resendReceiving(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (id: string): Promise<FullEmail | null> => {
    const r = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(`[resend] correo recibido ${id}: ${r.status}`);
    const e = (await r.json()) as { from: string; to: string[]; cc: string[] | null; subject: string; text: string | null; html: string | null; created_at: string; message_id: string };
    return { from: e.from, to: e.to ?? [], cc: e.cc ?? [], subject: e.subject ?? '', text: e.text ?? (e.html ? htmlToText(e.html) : ''), date: e.created_at, messageId: e.message_id };
  };
}

export async function inboxRuntime(now = new Date()): Promise<ProcessDeps | { error: string }> {
  const leads = await leadsRuntime();
  const leadsDb = 'error' in leads ? null : leads.db;
  const tenantById = async (id: string) => {
    if (appMode() === 'demo') {
      const { demoDb } = await import('../data/store');
      const slug = demoDb().tenant.find((t) => t.id === id)?.slug;
      return slug ? publicRepository().resolveTenantBySlug(slug) : null;
    }
    const sb = createClient(env('PUBLIC_SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await sb.from('tenant').select('slug').eq('id', id).maybeSingle();
    return data?.slug ? publicRepository().resolveTenantBySlug(data.slug) : null;
  };
  const actAs: ProcessDeps['actAs'] = async (tenantId, userId) => {
    const t = await tenantById(tenantId);
    return t ? contextAs(t, userId) : null;
  };
  if (appMode() === 'demo') {
    const { demoInboxServerDb } = await import('./db-demo');
    return { db: demoInboxServerDb(), fetchEmail: async (id) => DEMO_RECEIVED.get(id) ?? null, actAs, leads: leadsDb, inboxDomain: inboxDomain() ?? 'in.demo.cofundo.io', now };
  }
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const resend = env('RESEND_API_KEY');
  if (!key) return { error: 'Falta SUPABASE_SERVICE_ROLE_KEY' };
  if (!resend) return { error: 'Falta RESEND_API_KEY' };
  const { supabaseInboxServerDb } = await import('./db-supabase');
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { db: supabaseInboxServerDb(sb), fetchEmail: resendReceiving(resend), actAs, leads: leadsDb, inboxDomain: inboxDomain(), now };
}
