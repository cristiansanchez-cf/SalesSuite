/**
 * Rutas /api/v1 (docs/COMMISSIONS.md §1). El tenant lo fija la clave API, nunca el cuerpo.
 * En Supabase escriben con service role (solo servidor); en demo, en memoria.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';
import type { IngestDb } from './db';
import { hashKey } from './service';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function ingestDb(): Promise<IngestDb | Response> {
  if (appMode() === 'demo') return (await import('./db-demo')).demoIngestDb();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor' }, 503);
  const { supabaseIngestDb } = await import('./db-supabase');
  return supabaseIngestDb(createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/** Clave → tenant. Error genérico: no se distingue «no existe» de «revocada». */
export async function authenticateKey(req: Request, db: IngestDb): Promise<{ tenantId: string } | Response> {
  const m = /^Bearer\s+(ss_live_[A-Za-z0-9_-]{20,80})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return json({ error: 'Falta la clave API (Authorization: Bearer ss_live_…)' }, 401);
  const t = await db.tenantForKey(hashKey(m[1]));
  if (!t) return json({ error: 'Clave API no válida' }, 401);
  await db.touchKey(t.keyId).catch(() => {});
  return { tenantId: t.tenantId };
}

export async function readJson(req: Request): Promise<unknown | Response> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 2_000_000) return json({ error: 'Cuerpo demasiado grande (máx. 2 MB)' }, 413);
  try { return await req.json(); } catch { return json({ error: 'El cuerpo debe ser JSON' }, 400); }
}
