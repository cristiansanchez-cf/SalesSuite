import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { socialFor, THUMB_HOST } from '~/lib/social/server';

/**
 * Traer de sus redes (docs/PERSONALIZE.md §Traer de sus redes).
 * POST {step: 'list', platform?} → sus publicaciones y las propuestas · POST {step: 'more', key} → la página siguiente ·
 * POST {step: 'import', key, index, kind} → una
 * publicación como foto o vídeo (el editor las pide de una en una) · GET ?key=&thumb=<n> → la miniatura.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;
function fail(e: unknown) {
  if (e instanceof AdminError) return json({ error: e.message }, e.status);
  console.error('[social]', e instanceof Error ? e.message : e);
  return json({ ok: false, code: 'SERVER_ERROR' }, 500);
}

export const POST: APIRoute = async ({ params, locals, request }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'No autenticado' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Content-Type debe ser application/json' }, 415);
  if (!UUID.test(params.id ?? '')) return json({ error: 'Propuesta no encontrada' }, 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const svc = socialFor(admin);
    if (body.step === 'import') return json(await svc.importPost(params.id!, body));
    if (body.step === 'more') return json(await svc.more(params.id!, body));
    return json(await svc.list(params.id!, body));
  } catch (e) { return fail(e); }
};

export const GET: APIRoute = async ({ params, locals, url }) => {
  const admin = locals.admin;
  if (!admin) return new Response(null, { status: 401 });
  if (!UUID.test(params.id ?? '')) return new Response(null, { status: 404 });
  try {
    const src = await socialFor(admin).thumb(url.searchParams.get('key') ?? '', Number(url.searchParams.get('thumb')));
    if (!src || !THUMB_HOST.test(src)) return new Response(null, { status: 404 });
    const r = await fetch(src, { redirect: 'error' });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/^image\/(jpeg|png|webp|gif|heic|avif)/i.test(type)) return new Response(null, { status: 404 });
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return new Response(null, { status: 404 });
    return new Response(new Blob([bytes as BlobPart], { type }), { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
};
