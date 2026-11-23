/**
 * Metadatos OAuth públicos (docs/MCP.md §OAuth), servidos por el middleware (Astro no enruta carpetas con punto):
 *  · /.well-known/oauth-protected-resource[/api/mcp] (RFC 9728): dónde autenticarse para usar /api/mcp.
 *  · /.well-known/oauth-authorization-server[/…] (RFC 8414) y /.well-known/openid-configuration: el servidor de
 *    autorización (esta misma app). Algunos clientes prueban una u otra ruta: todas dicen lo mismo.
 */
import { authorizationServer, protectedResource } from './oauth';

const out = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
});

export function wellKnown(path: string, origin: string): Response | null {
  if (!path.startsWith('/.well-known/')) return null;
  if (path === '/.well-known/oauth-protected-resource' || path.startsWith('/.well-known/oauth-protected-resource/')) return out(protectedResource(origin));
  if (path === '/.well-known/oauth-authorization-server' || path.startsWith('/.well-known/oauth-authorization-server/') || path === '/.well-known/openid-configuration') return out(authorizationServer(origin));
  return null;
}
