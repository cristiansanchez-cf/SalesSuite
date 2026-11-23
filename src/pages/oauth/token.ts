/**
 * Token OAuth (docs/MCP.md §OAuth): código + verificador PKCE → token (8 h) y refresco (90 días, con rotación).
 * Acepta form-urlencoded (lo que manda el estándar) y JSON.
 */
import type { APIRoute } from 'astro';
import { exchangeCode, OAuthError, refreshTokens } from '~/lib/mcp/oauth';
import { bodyOf, CORS, json, oauthError } from './_shared';

export const prerender = false;
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
export const POST: APIRoute = async ({ request }) => {
  const b = await bodyOf(request);
  if (!b) return oauthError('invalid_request', 'Cuerpo no válido');
  try {
    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.client_id || !b.redirect_uri || !b.code_verifier) return oauthError('invalid_request', 'Faltan code, client_id, redirect_uri o code_verifier');
      return json(await exchangeCode({ code: b.code, clientId: b.client_id, redirectUri: b.redirect_uri, verifier: b.code_verifier }));
    }
    if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token || !b.client_id) return oauthError('invalid_request', 'Faltan refresh_token o client_id');
      return json(await refreshTokens({ refreshToken: b.refresh_token, clientId: b.client_id }));
    }
    return oauthError('unsupported_grant_type', 'authorization_code o refresh_token');
  } catch (e) {
    if (e instanceof OAuthError) return oauthError(e.code, e.message);
    console.warn('[oauth/token]', e instanceof Error ? e.message : e);
    return oauthError('server_error', 'Algo ha fallado; prueba de nuevo', 500);
  }
};
