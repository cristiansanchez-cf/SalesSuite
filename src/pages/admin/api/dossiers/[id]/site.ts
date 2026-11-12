import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { requestOrigin } from '~/lib/http';
import { captureSite, shotProvider } from '~/lib/site-shot';
import { put } from '~/lib/social/server';

/** Su web (docs/PERSONALIZE.md §Su web). POST {url} → la captura de su web, ya en la propuesta. */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;

export const POST: APIRoute = async ({ params, locals, request, url }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'No autenticado' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Content-Type debe ser application/json' }, 415);
  if (!UUID.test(params.id ?? '')) return json({ error: 'Propuesta no encontrada' }, 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return json(await captureSite(admin, params.id!, body, { provider: shotProvider(), origin: requestOrigin(request, url), put }));
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.message }, e.status);
    console.error('[site-shot]', e instanceof Error ? e.message : e);
    return json({ ok: false, code: 'FAILED' }, 500);
  }
};
