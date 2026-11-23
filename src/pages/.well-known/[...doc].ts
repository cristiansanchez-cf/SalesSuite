/**
 * Metadatos OAuth públicos (docs/MCP.md §OAuth) como ruta de verdad: en Vercel, una dirección sin ruta sale con 404
 * forzado aunque el middleware conteste (así falló «Agregar conector» en claude.ai: no encontraba dónde registrarse).
 * Lo que dicen: src/lib/mcp/well-known.ts.
 */
import type { APIRoute } from 'astro';
import { wellKnown } from '~/lib/mcp/well-known';
import { requestOrigin } from '~/lib/http';

export const prerender = false;
export const GET: APIRoute = ({ request, url }) => wellKnown(url.pathname, requestOrigin(request, url)) ?? new Response('Not found', { status: 404 });
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'mcp-protocol-version, content-type' } });
