import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';

/** Ordenar ciudades (docs/CRM_DINAMICO.md §14): clasificar con IA un trozo de textos. El navegador los manda por trozos. */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { raws?: unknown };
  try {
    return Response.json({ places: await admin.crm.zonesClassify(body.raws) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
