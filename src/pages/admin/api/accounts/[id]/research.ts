import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';
import { researchContext } from '~/lib/crm/research-context';

/**
 * Investigar con IA una empresa (docs/CRM_DINAMICO.md §13). Lo usa «Investigar zona» en la lista: el navegador las pide
 * de una en una (cada una tarda hasta un minuto) y enseña el progreso. `skipRecentDays`: no repetir las ya investigadas.
 */
export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const id = params.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: localizeError('Cuenta no encontrada', locals.locale ?? 'es') }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { skipRecentDays?: number };
  const days = Math.max(0, Math.min(Number(body.skipRecentDays) || 0, 365));
  try {
    const { account: a } = await admin.accounts.get(id);
    if (days && a.aiResearchAt && Date.now() - Date.parse(a.aiResearchAt) < days * 86_400_000) return Response.json({ skipped: 'recent' });
    const r = await admin.crm.aiRun(id, await researchContext(admin, a.segmentId));
    return Response.json({ ok: true, open: r.suggestions.filter((x) => x.status === 'open').length }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) {
      if (e.status === 403) return Response.json({ skipped: 'forbidden' });
      return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    }
    throw e;
  }
};
