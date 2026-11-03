/**
 * Lo que necesita el asistente en el servidor: su estado (service role), WhatsApp, Whisper (OPENAI_API_KEY) y actuar
 * como la persona (contextAs). En demo, todo en memoria y un audio de ejemplo.
 */
import { createClient } from '@supabase/supabase-js';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { env } from '../env';
import { appMode } from '../mode';
import type { WhatsApp } from '../leads/whatsapp';
import type { AssistantDb } from './db';
import type { AssistantDeps } from './process';
import { fixtureTranscriber, whisper } from './transcribe';

export async function assistantDb(): Promise<AssistantDb | null> {
  if (appMode() === 'demo') return (await import('./db-demo')).demoAssistantDb();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  const { supabaseAssistantDb } = await import('./db-supabase');
  return supabaseAssistantDb(createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

async function tenantById(id: string) {
  if (appMode() === 'demo') {
    const { demoDb } = await import('../data/store');
    const slug = demoDb().tenant.find((t) => t.id === id)?.slug;
    return slug ? publicRepository().resolveTenantBySlug(slug) : null;
  }
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await sb.from('tenant').select('slug').eq('id', id).maybeSingle();
  return data?.slug ? publicRepository().resolveTenantBySlug(data.slug) : null;
}

export async function assistantDeps(db: AssistantDb, wa: WhatsApp | null, now = new Date()): Promise<AssistantDeps> {
  const key = env('OPENAI_API_KEY');
  return {
    db, wa, now,
    transcribe: key ? whisper(key) : appMode() === 'demo' ? fixtureTranscriber : null,
    actAs: async (tenantId, userId) => { const t = await tenantById(tenantId); return t ? contextAs(t, userId) : null; },
  };
}

/** Los recordatorios de la mañana (los llama /api/cron/leads cada 10 minutos). */
export async function reminderDeps(wa: WhatsApp | null, leadsSettings: (tenantId: string) => Promise<import('../leads/types').LeadSettings | null>, now = new Date()) {
  const db = await assistantDb();
  if (!db) return null;
  const { demoReminderDb, supabaseReminderDb } = await import('./reminders-db');
  const rdb = appMode() === 'demo' ? demoReminderDb()
    : supabaseReminderDb(createClient(env('PUBLIC_SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } }));
  const base = await assistantDeps(db, wa, now);
  return { db: rdb, assistant: db, wa, now, settings: leadsSettings, actAs: base.actAs };
}
