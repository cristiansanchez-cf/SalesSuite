import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';

/** Situar las ciudades en el mapa (docs/CRM_DINAMICO.md §16): una tanda por petición; el navegador repite hasta acabar. */
export const POST: APIRoute = async ({ locals }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  try {
    return Response.json(await admin.crm.zonesLocate(), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
