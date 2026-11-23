/**
 * Claves personales del servidor MCP (docs/MCP.md): «Conecta tu IA». Cada clave es de una persona en un espacio y actúa
 * como ella (sus permisos de siempre). Se guarda solo el hash; la clave se enseña una vez al crearla. Gestionarlas: con la
 * sesión de la persona (RLS). Comprobarlas al llamar al MCP: con service role (no hay sesión).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import { env } from '../env';
import { appMode } from '../mode';
import { AdminError } from '../admin/service';

type Admin = NonNullable<App.Locals['admin']>;
export interface McpToken { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revoked: boolean; clientId: string | null }
export interface TokenOwner { id: string; tenantId: string; userId: string }

export const TOKEN_RE = /^ss_mcp_[A-Za-z0-9_-]{40,60}$/;
export const MAX_TOKENS = 10;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => `ss_mcp_${randomBytes(32).toString('base64url')}`;
const prefixOf = (token: string) => token.slice(0, 14);

const fromRow = (r: Record<string, unknown>): McpToken => ({
  id: r.id as string, name: r.name as string, prefix: r.prefix as string, createdAt: r.created_at as string, lastUsedAt: (r.last_used_at as string) ?? null,
  expiresAt: (r.expires_at as string) ?? null, revoked: !!r.revoked_at, clientId: (r.client_id as string) ?? null,
});

/** Las mías en este espacio (también las revocadas, para ver el historial), las más nuevas primero. */
export async function myTokens(admin: Admin): Promise<McpToken[]> {
  const { userId, tenantId } = admin.session;
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.from('mcp_token').select('id, name, prefix, created_at, last_used_at, expires_at, revoked_at, client_id')
      .eq('tenant_id', tenantId).eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) return [];
    return (data ?? []).map(fromRow);
  }
  return demoDb().mcp_token.filter((x) => x.tenant_id === tenantId && x.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => fromRow(r as unknown as Record<string, unknown>));
}

/** Una clave nueva («Claude», «ChatGPT del portátil»…). Devuelve la clave en claro: solo esta vez. */
export async function createToken(admin: Admin, rawName: string, opts: { clientId?: string | null; expiresAt?: string | null } = {}): Promise<{ token: string; id: string }> {
  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Mi IA';
  const active = (await myTokens(admin)).filter((x) => !x.revoked);
  if (active.length >= MAX_TOKENS) throw new AdminError(422, 'Como mucho 10 conexiones activas: revoca alguna');
  const token = newToken();
  const row = { tenant_id: admin.session.tenantId, user_id: admin.session.userId, name, token_hash: hashToken(token), prefix: prefixOf(token),
    client_id: opts.clientId ?? null, expires_at: opts.expiresAt ?? null };
  if (admin.mode === 'supabase' && admin.supabase) {
    const { data, error } = await admin.supabase.from('mcp_token').insert(row).select('id').single();
    if (error || !data) throw new AdminError(503, 'No se ha podido crear la conexión; prueba en un momento');
    return { token, id: data.id as string };
  }
  const id = randomUUID();
  demoDb().mcp_token.push({ id, ...row, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null });
  return { token, id };
}

/** Revocar una mía: deja de valer al momento. */
export async function revokeToken(admin: Admin, id: string): Promise<void> {
  const now = new Date().toISOString();
  if (admin.mode === 'supabase' && admin.supabase) {
    const { error } = await admin.supabase.from('mcp_token').update({ revoked_at: now }).eq('id', id).eq('user_id', admin.session.userId).is('revoked_at', null);
    if (error) throw new AdminError(503, 'No se ha podido revocar; prueba en un momento');
    return;
  }
  const r = demoDb().mcp_token.find((x) => x.id === id && x.user_id === admin.session.userId);
  if (r && !r.revoked_at) r.revoked_at = now;
}

/**
 * La clave → de quién es (sin sesión: service role). null si no existe, está revocada o caducada (sin distinguir: no se
 * da pista). Apunta cuándo se usó (como mucho una vez cada 5 minutos).
 */
export async function tokenOwner(token: string, now = new Date()): Promise<TokenOwner | null> {
  if (!TOKEN_RE.test(token)) return null;
  const hash = hashToken(token);
  const valid = (r: { revoked_at: string | null; expires_at: string | null }) => !r.revoked_at && (!r.expires_at || Date.parse(r.expires_at) > now.getTime());
  const stale = (last: string | null) => !last || now.getTime() - Date.parse(last) > 5 * 60_000;
  if (appMode() === 'demo') {
    const r = demoDb().mcp_token.find((x) => x.token_hash === hash);
    if (!r || !valid(r)) return null;
    if (stale(r.last_used_at)) r.last_used_at = now.toISOString();
    return { id: r.id, tenantId: r.tenant_id, userId: r.user_id };
  }
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return null;
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: r } = await sb.from('mcp_token').select('id, tenant_id, user_id, revoked_at, expires_at, last_used_at').eq('token_hash', hash).maybeSingle();
  if (!r || !valid(r as { revoked_at: string | null; expires_at: string | null })) return null;
  if (stale(r.last_used_at as string | null)) await sb.from('mcp_token').update({ last_used_at: now.toISOString() }).eq('id', r.id);
  return { id: r.id as string, tenantId: r.tenant_id as string, userId: r.user_id as string };
}
