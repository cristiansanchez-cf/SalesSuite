/**
 * Lo que necesita el asistente en el servidor: su estado (service role), WhatsApp, Whisper (OPENAI_API_KEY) y actuar
 * como la persona (contextAs). En demo, todo en memoria y un audio de ejemplo.
 */
import { claudeScreenshotReader, fixtureScreenshotReader } from './screenshot';
import { claudeEditReader, fixtureEditReader } from './edits';
import { createClient } from '@supabase/supabase-js';
import { contextAs } from '../admin/auth';
import { publicRepository } from '../data';
import { env } from '../env';
import { appMode } from '../mode';
import type { WhatsApp } from '../leads/whatsapp';
import type { AssistantDb } from './db';
import type { AssistantDeps } from './process';
import { fixtureTranscriber, whisper } from './transcribe';
import { hubConfig, hubWhatsApp } from './hub-config';

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
    screenshot: env('AI_RESEARCH_FIXTURE') === '1' ? fixtureScreenshotReader : env('ANTHROPIC_API_KEY') ? claudeScreenshotReader(env('ANTHROPIC_API_KEY')!) : null,
    edits: env('AI_RESEARCH_FIXTURE') === '1' ? fixtureEditReader : env('ANTHROPIC_API_KEY') ? claudeEditReader(env('ANTHROPIC_API_KEY')!) : null,
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
  // Con el número del asistente, el recordatorio sale de ese número (docs/ASSISTANT.md §Un número para todas las empresas).
  const hub = hubConfig();
  return { db: rdb, assistant: db, wa: hub ? hubWhatsApp(wa) : wa, now, settings: leadsSettings, actAs: base.actAs, hub };
}

/**
 * «Probarlo ahora» (Mi cuenta): el recordatorio de la mañana de esta persona, ya, sin esperar a las 9 ni mirar si ya
 * se mandó hoy, y qué ha pasado (para ver por qué no llega sin mirar los registros del servidor).
 */
export async function testReminder(admin: import('../admin/auth').AdminContext, now = new Date()): Promise<import('./reminders').ReminderOutcome | { status: 'off' }> {
  const { leadsRuntime } = await import('../leads/server');
  const { remindOne } = await import('./reminders');
  const { localClock } = await import('../notify/daily');
  const rt = await leadsRuntime();
  const wa = 'error' in rt ? null : rt.whatsapp;
  const d = await reminderDeps(wa, (t) => ('error' in rt ? Promise.resolve(null) : rt.db.settings(t)), now);
  if (!d || !d.wa) return { status: 'no-number' };
  const mine = (await d.db.members()).filter((m) => m.userId === admin.session.userId);
  if (!mine.length) return { status: 'off' };
  const m = mine.find((x) => x.tenantId === admin.session.tenantId) ?? mine[0]!;
  return remindOne(d, m, localClock(now, m.timezone).day);
}
