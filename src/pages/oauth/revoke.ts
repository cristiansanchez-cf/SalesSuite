/** Revocar (RFC 7009; docs/MCP.md §OAuth): el token o el refresco → la conexión deja de valer. Siempre 200. */
import type { APIRoute } from 'astro';
import { revokeByToken } from '~/lib/mcp/oauth';
import { bodyOf, CORS } from './_shared';

export const prerender = false;
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
export const POST: APIRoute = async ({ request }) => {
  const b = await bodyOf(request);
  if (b?.token && b.token.length <= 200) await revokeByToken(b.token).catch(() => {});
  return new Response(null, { status: 200, headers: CORS });
};
