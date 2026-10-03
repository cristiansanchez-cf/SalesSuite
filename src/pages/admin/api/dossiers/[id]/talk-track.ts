import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/** Guion de venta del dossier (cualquier miembro que pueda ver el dossier). */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id ?? '')) return Response.json({ error: 'Dossier no encontrado' }, { status: 404 });
  try {
    return Response.json(await locals.admin.playbook.talkTrack(params.id!), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
