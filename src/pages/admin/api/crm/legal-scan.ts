import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';

/** Titular desde el aviso legal de su web, para todas (docs/CRM_DINAMICO.md §25): una tanda por petición. Gratis. */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as { after?: unknown };
    return Response.json(await admin.crm.legalScan(body.after), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
