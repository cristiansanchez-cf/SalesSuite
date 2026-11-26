/**
 * El enlace de prueba de una propuesta (criterio de Cristian, 26-nov-2026): para verla tal cual la verá el cliente, en
 * el móvil o mandándosela a un compañero, desde que se crea (también en borrador). Nunca cuenta ni avisa, y no es el que
 * se manda al cliente (ese es /d/<token>). Va firmado con un secreto del servidor: sin él no se puede adivinar.
 *
 *   /prueba/<dossierId>.<firma>
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { appMode } from '../mode';

const key = () => env('DOSSIER_TEST_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY') || (appMode() === 'demo' ? 'demo-test-links' : null);
const sign = (k: string, tenantId: string, dossierId: string) => createHmac('sha256', `dossier-test:${k}`).update(`${tenantId}:${dossierId}`).digest('base64url').slice(0, 22);

export function testToken(tenantId: string, dossierId: string): string | null {
  const k = key();
  return k ? `${dossierId}.${sign(k, tenantId, dossierId)}` : null;
}
export const testPath = (tenantId: string, dossierId: string) => { const t = testToken(tenantId, dossierId); return t ? `/prueba/${t}` : null; };

/** El id de la propuesta si la firma vale para este espacio; si no, null. */
export function readTestToken(tenantId: string, token: string): string | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})$/i.exec(token);
  const k = key();
  if (!m || !k) return null;
  const want = Buffer.from(sign(k, tenantId, m[1]!)), got = Buffer.from(m[2]!);
  return want.length === got.length && timingSafeEqual(want, got) ? m[1]! : null;
}

/** Quién la hizo (para verla con sus permisos), si es de este espacio y no está archivada. */
export async function testAuthor(tenantId: string, dossierId: string): Promise<string | null> {
  if (appMode() === 'demo') {
    const { demoDb } = await import('../data/store');
    const d = demoDb().dossier.find((x) => x.id === dossierId && x.tenant_id === tenantId);
    return d && d.status !== 'archived' ? d.author_id : null;
  }
  const k = env('SUPABASE_SERVICE_ROLE_KEY'), url = env('PUBLIC_SUPABASE_URL');
  if (!k || !url) return null;
  const sb = createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await sb.from('dossier').select('author_id, status').eq('id', dossierId).eq('tenant_id', tenantId).maybeSingle();
  const row = r.data as { author_id: string | null; status: string } | null;
  return row && row.status !== 'archived' ? row.author_id : null;
}
