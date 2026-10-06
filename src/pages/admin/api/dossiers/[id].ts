import type { APIRoute } from 'astro';
import { builderOpSchema } from '~/lib/admin/ops';
import { AdminError } from '~/lib/admin/service';

/**
 * API del builder: GET estado · POST {op} → estado completo · DELETE dossier.
 * Solo JSON: un formulario cross-site no puede enviar application/json sin preflight CORS (CSRF).
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function fail(e: unknown) {
  if (e instanceof AdminError) return json({ error: e.message, details: e.details ?? [] }, e.status);
  console.error('[admin api]', e);
  return json({ error: 'Error inesperado' }, 500);
}

const UUID = /^[0-9a-f-]{36}$/i;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return json({ error: 'No autenticado' }, 401);
  if (!UUID.test(params.id ?? '')) return fail(new AdminError(404, 'Dossier no encontrado'));
  try { return json(await locals.admin.service.getState(params.id!)); } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.admin) return json({ error: 'No autenticado' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Content-Type debe ser application/json' }, 415);
  if (!UUID.test(params.id ?? '')) return fail(new AdminError(404, 'Dossier no encontrado'));
  const body = await request.json().catch(() => null);
  const parsed = builderOpSchema.safeParse(body);
  if (!parsed.success) {
    return fail(new AdminError(400, 'Datos no válidos', parsed.error.issues.map((i) => `${i.path.join('.') || 'op'}: ${i.message}`)));
  }
  try { return json(await locals.admin.service.apply(params.id!, parsed.data)); } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return json({ error: 'No autenticado' }, 401);
  if (!UUID.test(params.id ?? '')) return fail(new AdminError(404, 'Dossier no encontrado'));
  try {
    await locals.admin.service.deleteDossier(params.id!);
    return new Response(null, { status: 204 });
  } catch (e) { return fail(e); }
};
