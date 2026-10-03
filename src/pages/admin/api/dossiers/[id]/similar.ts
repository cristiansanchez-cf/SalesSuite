import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/** «En situaciones parecidas»: cierres documentados del equipo parecidos a la cuenta de este dossier. */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id ?? '')) return Response.json({ error: 'Dossier no encontrado' }, { status: 404 });
  try {
    const r = await locals.admin.evidence.forDossier(params.id!);
    return Response.json({ described: r.described, total: r.total, stories: r.stories, plays: r.plays }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
