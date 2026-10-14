import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';

/** Buscador de ciudad (docs/CRM_DINAMICO.md §44): ciudades de cualquier país, en Google, para lo que no está ya. */
export const GET: APIRoute = async ({ locals, url }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  try {
    return Response.json({ items: await admin.crm.citySearch(url.searchParams.get('q') ?? '') }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
