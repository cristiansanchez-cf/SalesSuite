/**
 * OAuth 2.1 del servidor MCP (docs/MCP.md §OAuth): para añadir el CRM en claude.ai, ChatGPT, Claude Code, Cursor… con
 * un clic, entrando con la cuenta. Servidor de autorización propio (en la misma app):
 *  · descubrimiento: RFC 9728 (recurso protegido) y RFC 8414 (servidor de autorización);
 *  · registro dinámico de clientes públicos (RFC 7591), sin secreto: PKCE S256 obligatorio;
 *  · «Autorizar» en /admin/oauth/authorize con la sesión de la consola (y su login si no hay);
 *  · /oauth/token: código + verificador → token y token de refresco (rotación al refrescar).
 * Los tokens van a mcp_token (los mismos que las claves personales): se ven y se revocan en «Conecta tu IA».
 * Decisiones (aprendidas del Cerebro, AIBrains docs/fase-2-auth.md): el 401 con WWW-Authenticate y resource_metadata;
 * `resource` igual al carácter que la URL que se pega; /token acepta form-urlencoded; en loopback (Claude Code) el
 * puerto no cuenta; token de refresco siempre (si no, a reconectar cada hora).
 */
import { createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import { env } from '../env';
import { appMode } from '../mode';
import { hashToken, newToken } from './tokens';
import { nodeGet, safeUrl, type WebGet } from '../crm/website';

export const SCOPES = ['crm', 'offline_access'] as const;
export const ACCESS_TTL_S = 8 * 3600;
export const REFRESH_TTL_S = 90 * 86400;
export const CODE_TTL_S = 600;
export const MCP_PATH = '/api/mcp';

// ---------------------------------------------------------------- descubrimiento (puro)

export const resourceUrl = (origin: string) => `${origin}${MCP_PATH}`;
export function protectedResource(origin: string) {
  return { resource: resourceUrl(origin), authorization_servers: [origin], scopes_supported: [...SCOPES], bearer_methods_supported: ['header'], resource_name: 'Cofundo Ventas' };
}
export function authorizationServer(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/admin/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SCOPES],
    // CIMD: el client_id puede ser la URL de su ficha (lo que claude.ai usa por defecto, «la identidad publicada»).
    client_id_metadata_document_supported: true,
  };
}
export const wwwAuthenticate = (origin: string, error?: string) =>
  [`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"`, `scope="${SCOPES.join(' ')}"`, ...(error ? ['error="invalid_token"', `error_description="${error.replace(/"/g, "'")}"`] : [])].join(', ');

// ---------------------------------------------------------------- reglas (puras)

/** S256: base64url(sha256(verificador)) === reto. El verificador, 43–128 caracteres «unreserved» (RFC 7636). */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const BAD_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'blob:', 'ftp:', 'ws:', 'wss:']);
/**
 * Una dirección de vuelta que se puede registrar: https; http solo en loopback (Claude Code, VS Code); o el esquema
 * propio de una app de escritorio (cursor://…). Sin fragmento ni credenciales.
 */
export function validRedirect(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (raw.length > 2000 || u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return !!u.hostname;
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !BAD_SCHEMES.has(u.protocol);
}
/** ¿Es la registrada? Igual al carácter; en loopback, el puerto no cuenta (Claude Code usa uno distinto cada vez). */
export function redirectMatches(registered: string[], given: string): boolean {
  if (registered.includes(given)) return true;
  let g: URL;
  try { g = new URL(given); } catch { return false; }
  if (g.protocol !== 'http:' || !LOOPBACK.has(g.hostname)) return false;
  return registered.some((r) => {
    try { const u = new URL(r); return u.protocol === 'http:' && u.hostname === g.hostname && u.pathname === g.pathname && u.search === g.search; } catch { return false; }
  });
}
/** El nombre que enseñamos («Claude», «ChatGPT»…): el que diga el cliente, limpio; si no, su dominio de vuelta. */
export function clientName(raw: unknown, redirects: string[]): string {
  const n = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  if (n) return n;
  try { return new URL(redirects[0]!).hostname || 'App'; } catch { return 'App'; }
}

// ---------------------------------------------------------------- CIMD (Client ID Metadata Documents)
// claude.ai no se registra: su client_id es una URL https con su ficha (nombre y vueltas). Se lee al usarla (con
// cuidado: solo webs públicas, 5 s, JSON) y se guarda en oauth_client (el código la referencia).

/** ¿Un client_id de CIMD? https, con ruta, sin fragmento ni credenciales, ya normalizada y como mucho 200 caracteres. */
export function isCimdId(id: string): boolean {
  if (id.length > 200 || !id.startsWith('https://')) return false;
  const u = safeUrl(id);
  return !!u && u.protocol === 'https:' && u.href === id && u.pathname.length > 1 && !u.hash && !/\/\.\.?(\/|$)/.test(u.pathname);
}
/** La ficha → el cliente. Tiene que decir que es ella misma (client_id igual a su URL) y traer vueltas válidas. */
export function parseCimd(id: string, doc: unknown): OAuthClient | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== id) return null;
  const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris.filter((x): x is string => typeof x === 'string') : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return null;
  return { clientId: id, name: clientName(d.client_name, uris), redirectUris: uris };
}
let cimdGet: WebGet = nodeGet(undefined, { accept: 'application/json', type: /json/i });
const cimdCache = new Map<string, { c: OAuthClient; at: number }>();
/** Pruebas: otra forma de leer la ficha. */
export function setCimdGet(g: WebGet) { cimdGet = g; cimdCache.clear(); }
async function readCimd(id: string): Promise<OAuthClient | null> {
  const hit = cimdCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.c;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await cimdGet(new URL(id), ctl.signal);
    if (r.status !== 200 || !r.body || r.body.length > 65_536) return null;
    const c = parseCimd(id, JSON.parse(r.body));
    if (!c) return null;
    cimdCache.set(id, { c, at: Date.now() });
    await saveClient(c);
    return c;
  } catch { return null; } finally { clearTimeout(t); }
}
async function saveClient(c: OAuthClient) {
  const db = sb();
  const row = { client_id: c.clientId, name: c.name, redirect_uris: c.redirectUris };
  if (!db) {
    const d = demoDb().oauth_client, i = d.findIndex((x) => x.client_id === c.clientId);
    if (i >= 0) Object.assign(d[i]!, row); else d.push({ ...row, created_at: new Date().toISOString(), last_used_at: null });
    return;
  }
  const { error } = await db.from('oauth_client').upsert(row, { onConflict: 'client_id' });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- almacén (service role; en demo, en memoria)

export interface OAuthClient { clientId: string; name: string; redirectUris: string[] }
export interface IssuedTokens { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }
type Sb = SupabaseClient;
let sbCache: Sb | null = null;
function sb(): Sb | null {
  if (appMode() === 'demo') return null;
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return (sbCache ??= createClient(env('PUBLIC_SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

export async function registerClient(name: string, redirectUris: string[]): Promise<OAuthClient> {
  const clientId = randomBytes(18).toString('base64url');
  const db = sb();
  if (!db) demoDb().oauth_client.push({ client_id: clientId, name, redirect_uris: redirectUris, created_at: new Date().toISOString(), last_used_at: null });
  else { const { error } = await db.from('oauth_client').insert({ client_id: clientId, name, redirect_uris: redirectUris }); if (error) throw new Error(error.message); }
  return { clientId, name, redirectUris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  // CIMD: la ficha de ahora; si no se puede leer, la última guardada (para no cortar un refresco por un fallo suyo).
  if (isCimdId(clientId)) { const c = await readCimd(clientId); if (c) return c; }
  else if (!/^[A-Za-z0-9_-]{16,64}$/.test(clientId)) return null;
  const db = sb();
  if (!db) { const c = demoDb().oauth_client.find((x) => x.client_id === clientId); return c ? { clientId: c.client_id, name: c.name, redirectUris: c.redirect_uris } : null; }
  const { data } = await db.from('oauth_client').select('client_id, name, redirect_uris').eq('client_id', clientId).maybeSingle();
  return data ? { clientId: data.client_id as string, name: data.name as string, redirectUris: data.redirect_uris as string[] } : null;
}

/** Tras «Autorizar»: el código de un solo uso (10 min). Devuelve el código en claro (va en la redirección). */
export async function createCode(i: { clientId: string; tenantId: string; userId: string; redirectUri: string; challenge: string; scope: string | null }): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  const row = { code_hash: hashToken(code), client_id: i.clientId, tenant_id: i.tenantId, user_id: i.userId, redirect_uri: i.redirectUri, code_challenge: i.challenge, scope: i.scope, expires_at: iso(CODE_TTL_S * 1000), used_at: null };
  const db = sb();
  if (!db) demoDb().oauth_code.push(row);
  else { const { error } = await db.from('oauth_code').insert(row); if (error) throw new Error(error.message); }
  return code;
}

export class OAuthError extends Error {
  constructor(public code: 'invalid_request' | 'invalid_grant' | 'invalid_client' | 'unsupported_grant_type' | 'invalid_client_metadata' | 'invalid_redirect_uri', message: string) { super(message); }
}

/** Código → tokens. Un solo uso: se marca antes de dar nada (dos llamadas a la vez, solo una gana). */
export async function exchangeCode(i: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<IssuedTokens> {
  const hash = hashToken(i.code);
  const db = sb();
  const now = new Date().toISOString();
  let row: { client_id: string; tenant_id: string; user_id: string; redirect_uri: string; code_challenge: string; scope: string | null; expires_at: string } | null = null;
  if (!db) {
    const r = demoDb().oauth_code.find((x) => x.code_hash === hash);
    if (r && !r.used_at) { r.used_at = now; row = r; }
  } else {
    const { data } = await db.from('oauth_code').update({ used_at: now }).eq('code_hash', hash).is('used_at', null)
      .select('client_id, tenant_id, user_id, redirect_uri, code_challenge, scope, expires_at').maybeSingle();
    row = data as typeof row;
  }
  if (!row) throw new OAuthError('invalid_grant', 'El código no vale (usado o desconocido)');
  if (Date.parse(row.expires_at) < Date.now()) throw new OAuthError('invalid_grant', 'El código ha caducado');
  if (row.client_id !== i.clientId) throw new OAuthError('invalid_grant', 'El código es de otro cliente');
  if (row.redirect_uri !== i.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri no coincide');
  if (!pkceOk(i.verifier, row.code_challenge)) throw new OAuthError('invalid_grant', 'PKCE no coincide');
  const client = await getClient(i.clientId);
  return issue({ tenantId: row.tenant_id, userId: row.user_id, clientId: i.clientId, name: client?.name ?? 'App' });
}

async function issue(i: { tenantId: string; userId: string; clientId: string; name: string }): Promise<IssuedTokens> {
  const access = newToken(), refresh = `ss_mcpr_${randomBytes(32).toString('base64url')}`;
  const row = { tenant_id: i.tenantId, user_id: i.userId, name: i.name.slice(0, 80), token_hash: hashToken(access), prefix: access.slice(0, 14), client_id: i.clientId,
    expires_at: iso(ACCESS_TTL_S * 1000), refresh_hash: hashToken(refresh), refresh_expires_at: iso(REFRESH_TTL_S * 1000) };
  const db = sb();
  if (!db) demoDb().mcp_token.push({ id: crypto.randomUUID(), ...row, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null });
  else { const { error } = await db.from('mcp_token').insert(row); if (error) throw new Error(error.message); }
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPES.join(' ') };
}

/** Refrescar: token y refresco nuevos en la misma conexión (el refresco anterior deja de valer). */
export async function refreshTokens(i: { refreshToken: string; clientId: string }): Promise<IssuedTokens> {
  if (!/^ss_mcpr_[A-Za-z0-9_-]{40,60}$/.test(i.refreshToken)) throw new OAuthError('invalid_grant', 'Token de refresco no válido');
  const hash = hashToken(i.refreshToken);
  const access = newToken(), refresh = `ss_mcpr_${randomBytes(32).toString('base64url')}`;
  const patch = { token_hash: hashToken(access), prefix: access.slice(0, 14), expires_at: iso(ACCESS_TTL_S * 1000), refresh_hash: hashToken(refresh), refresh_expires_at: iso(REFRESH_TTL_S * 1000) };
  const db = sb();
  const ok = (r: { client_id: string | null; revoked_at: string | null; refresh_expires_at?: string | null } | null) =>
    !!r && r.client_id === i.clientId && !r.revoked_at && !!r.refresh_expires_at && Date.parse(r.refresh_expires_at) > Date.now();
  if (!db) {
    const r = demoDb().mcp_token.find((x) => x.refresh_hash === hash);
    if (!r || !ok(r)) throw new OAuthError('invalid_grant', 'Token de refresco no válido');
    Object.assign(r, patch);
  } else {
    const { data: r } = await db.from('mcp_token').select('id, client_id, revoked_at, refresh_expires_at').eq('refresh_hash', hash).maybeSingle();
    if (!r || !ok(r as never)) throw new OAuthError('invalid_grant', 'Token de refresco no válido');
    // Solo si sigue siendo ese refresco (dos refrescos a la vez: gana uno).
    const { data: upd } = await db.from('mcp_token').update(patch).eq('id', r.id).eq('refresh_hash', hash).select('id').maybeSingle();
    if (!upd) throw new OAuthError('invalid_grant', 'Token de refresco no válido');
  }
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPES.join(' ') };
}

/** RFC 7009: revocar un token o un refresco (la conexión entera). Siempre 200: no se da pista de si existía. */
export async function revokeByToken(token: string): Promise<void> {
  const hash = hashToken(token);
  const now = new Date().toISOString();
  const db = sb();
  if (!db) { const r = demoDb().mcp_token.find((x) => x.token_hash === hash || x.refresh_hash === hash); if (r && !r.revoked_at) r.revoked_at = now; return; }
  await db.from('mcp_token').update({ revoked_at: now }).or(`token_hash.eq.${hash},refresh_hash.eq.${hash}`).is('revoked_at', null);
}
