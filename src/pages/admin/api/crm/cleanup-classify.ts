import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';
import { cleanupContext } from '~/lib/crm/research-context';

/** Limpiar con IA (docs/CRM_DINAMICO.md §17): la IA revisa una tanda de empresas. El navegador las manda por tandas. */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  try {
    return Response.json({ items: await admin.crm.cleanupClassify(body.ids, await cleanupContext(admin)) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es'), details: e.details }, { status: e.status });
    throw e;
  }
};
