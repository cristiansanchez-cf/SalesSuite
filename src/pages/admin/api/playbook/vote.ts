import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/** "Me funcionó / No" desde el guion del builder. Solo JSON (CSRF: ver middleware). */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Content-Type debe ser application/json' }, { status: 415 });
  try {
    await locals.admin.playbook.vote(await request.json().catch(() => null));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: e.message, details: e.details ?? [] }, { status: e.status });
    throw e;
  }
};
