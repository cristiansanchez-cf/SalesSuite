/** Solo modo demo: archivos personalizados de una propuesta, en memoria (ver demoAssets). En producción, 404. */
import type { APIRoute } from 'astro';
import { appMode } from '~/lib/mode';
import { demoMediaGet, demoMediaPut } from '~/lib/admin/db-demo';

export const GET: APIRoute = ({ params }) => {
  if (appMode() !== 'demo') return new Response('No encontrado', { status: 404 });
  const f = demoMediaGet(String(params.key));
  if (!f || !f.bytes.length) return new Response('No encontrado', { status: 404 });
  return new Response(f.bytes as unknown as BodyInit, { headers: { 'content-type': f.type, 'cache-control': 'private, max-age=3600' } });
};

export const PUT: APIRoute = async ({ params, request }) => {
  if (appMode() !== 'demo') return new Response('No encontrado', { status: 404 });
  const type = request.headers.get('content-type') ?? '';
  const ok = demoMediaPut(String(params.key), type, new Uint8Array(await request.arrayBuffer()));
  return ok ? new Response(null, { status: 200 }) : new Response('No permitido', { status: 403 });
};
