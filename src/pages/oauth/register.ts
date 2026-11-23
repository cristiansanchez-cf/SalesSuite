/**
 * Registro dinámico de clientes OAuth (RFC 7591; docs/MCP.md §OAuth): claude.ai, ChatGPT, Claude Code, Cursor… se
 * registran solos al añadir el conector. Clientes públicos (sin secreto): el PKCE es la protección.
 */
import type { APIRoute } from 'astro';
import { clientName, registerClient, validRedirect } from '~/lib/mcp/oauth';
import { CORS, json, oauthError } from './_shared';

export const prerender = false;
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
export const POST: APIRoute = async ({ request }) => {
  if (Number(request.headers.get('content-length') ?? 0) > 16384) return oauthError('invalid_client_metadata', 'Demasiado grande');
  let meta: Record<string, unknown>;
  try { meta = (await request.json()) as Record<string, unknown>; } catch { return oauthError('invalid_client_metadata', 'El cuerpo debe ser JSON'); }
  const uris = Array.isArray(meta?.redirect_uris) ? (meta.redirect_uris as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return oauthError('invalid_redirect_uri', 'redirect_uris: https, http en localhost o el esquema de una app');
  // Pida el método que pida, se le registra como público (none): no damos secretos y el PKCE es la protección.
  const c = await registerClient(clientName(meta.client_name, uris), uris);
  return json({
    client_id: c.clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: c.name, redirect_uris: c.redirectUris,
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
  }, 201);
};
