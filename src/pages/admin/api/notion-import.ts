import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { notionFor } from '~/lib/notion/server';

/**
 * Importar desde Notion (docs/CRM_DINAMICO.md §48), solo el superadmin. Un paso por petición:
 * {step:'start', url} · {step:'read', id, index} · {step:'choices', id, choices} · {step:'run', id} ·
 * {step:'verify', id, index, accountId?} · {step:'undo', id}.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'No autenticado' }, 401);
  if (!admin.session.superadmin) return json({ error: 'Solo el superadmin' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Content-Type debe ser application/json' }, 415);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '');
  const index = Number(body.index);
  try {
    const n = notionFor(admin);
    switch (body.step) {
      case 'start': return json(await n.start({ url: body.url }));
      case 'read': return json(await n.read(id, index));
      case 'choices': return json({ choices: await n.setChoices(id, body.choices) });
      case 'run': return json(await n.run(id));
      case 'verify': return json(await n.verify(id, index, typeof body.accountId === 'string' ? body.accountId : null));
      case 'undo': return json(await n.undo(id));
      default: return json({ error: 'Paso no válido' }, 422);
    }
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.message }, e.status);
    console.error('[notion-import]', e instanceof Error ? e.message : e);
    return json({ error: 'No se ha podido hacer ahora' }, 500);
  }
};
