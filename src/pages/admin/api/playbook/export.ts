import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/** Exportación del playbook con formato de ficha del Cerebro de Ventas (solo admins). */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const data = await locals.admin.playbook.exportCards();
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="playbook.json"', 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
