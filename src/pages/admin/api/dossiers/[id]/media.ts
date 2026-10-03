import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/**
 * Personalizar (docs/PERSONALIZE.md). POST {step: 'sign', kind, type, size} → dónde subir ·
 * POST {step: 'attach', kind, url} → queda en la propuesta · DELETE {url} → se quita. Devuelve el estado del editor.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;
function fail(e: unknown) {
  if (e instanceof AdminError) return json({ error: e.message }, e.status);
  console.error('[media]', e);
  return json({ error: 'No se ha podido subir. Prueba otra vez.' }, 500);
}

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'No autenticado' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Content-Type debe ser application/json' }, 415);
  if (!UUID.test(params.id ?? '')) return json({ error: 'Propuesta no encontrada' }, 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (body.step === 'sign') return json(await admin.service.media.sign(params.id!, body as never));
    if (body.step === 'options') {
      await admin.service.media.options(params.id!, body as never);
      return json(await admin.service.getState(params.id!));
    }
    await admin.service.media.attach(params.id!, body as never);
    return json(await admin.service.getState(params.id!));
  } catch (e) { return fail(e); }
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'No autenticado' }, 401);
  if (!UUID.test(params.id ?? '')) return json({ error: 'Propuesta no encontrada' }, 404);
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  try {
    await admin.service.media.remove(params.id!, String(body.url ?? ''));
    return json(await admin.service.getState(params.id!));
  } catch (e) { return fail(e); }
};
