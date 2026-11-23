/**
 * Servidor MCP del CRM (docs/MCP.md): «Conecta tu IA». Streamable HTTP sin estado (cada petición, su servidor), JSON.
 * Autenticación: Authorization: Bearer ss_mcp_… (clave personal de una persona en un espacio; Mi cuenta → Conecta tu
 * IA). Actúa como esa persona: el contexto (sus permisos) se monta solo al usar una herramienta.
 * Sin cookies: el CSRF no aplica (lo salta el middleware) y el CORS es abierto (la llave es la clave, no el origen).
 */
import type { APIRoute } from 'astro';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { contextAs, type AdminContext } from '~/lib/admin/auth';
import { tenantById } from '~/lib/assistant/server';
import { buildMcpServer } from '~/lib/mcp/tools';
import { tokenOwner } from '~/lib/mcp/tokens';
import { wwwAuthenticate } from '~/lib/mcp/oauth';
import { requestOrigin } from '~/lib/http';
import { resolveLocale } from '~/lib/i18n/core';
import { withRequestLocale } from '~/lib/i18n/request';

export const prerender = false;

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, www-authenticate',
};
const withCors = (r: Response) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };
const err = (status: number, message: string, extra: Record<string, string> = {}) =>
  withCors(new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }), { status, headers: { 'content-type': 'application/json', ...extra } }));

export const OPTIONS: APIRoute = () => withCors(new Response(null, { status: 204 }));
// Sin estado: ni flujo de avisos (GET) ni sesiones que cerrar (DELETE).
export const GET: APIRoute = () => err(405, 'Method not allowed', { allow: 'POST, OPTIONS' });
export const DELETE: APIRoute = GET;

export const POST: APIRoute = async ({ request, url }) => {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  const owner = m ? await tokenOwner(m[1]) : null;
  // Sin token (o caducado): 401 con dónde autenticarse (RFC 9728). Claude solo lo mira en un 401, nunca en un 200.
  if (!owner) return err(401, 'Falta la clave o no vale (Mi cuenta → Conecta tu IA)', { 'www-authenticate': wwwAuthenticate(requestOrigin(request, url), m ? 'El token no vale o ha caducado' : undefined) });
  const tenant = await tenantById(owner.tenantId);
  if (!tenant) return err(401, 'El espacio de esta clave ya no existe');
  const locale = resolveLocale({ accept: request.headers.get('accept-language') });
  let admin: Promise<AdminContext> | null = null;
  const ctx = () => (admin ??= contextAs(tenant, owner.userId).then((a) => {
    if (!a) throw new Error('Sin acceso a este espacio');
    return a;
  }));
  return withRequestLocale(locale, async () => {
    const server = buildMcpServer(ctx, { space: tenant.name, locale });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try { return withCors(await transport.handleRequest(request)); } finally { void server.close().catch(() => {}); }
  });
};
