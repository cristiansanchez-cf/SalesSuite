import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';

/** Buscar clientes (docs/CRM_DINAMICO.md §19): importa una tanda de lo marcado (el navegador manda tandas y enseña el progreso) o une un sitio a una empresa que ya tienes («Es la misma»). */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { sweep?: unknown; ids?: unknown; owner?: unknown; link?: unknown; place?: unknown };
  try {
    // «Es la misma»: une el sitio de Google a una empresa que ya tienes.
    if (body.link) return Response.json(await admin.crm.prospectLink(String(body.sweep ?? ''), String(body.place ?? ''), String(body.link)), { headers: { 'cache-control': 'no-store' } });
    return Response.json(await admin.crm.prospectImport(String(body.sweep ?? ''), body.ids, body.owner ?? 'me'), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
