import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';

/**
 * Foto de Google de una empresa (docs/CRM_DINAMICO.md §15): el servidor pide a Google la dirección pública de la imagen
 * (con la clave, que no sale de aquí) y manda al navegador allí. Solo el equipo con sesión; solo nombres de foto válidos.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const admin = locals.admin;
  if (!admin) return new Response(null, { status: 401 });
  try {
    const uri = await admin.crm.googlePhoto(url.searchParams.get('n') ?? '');
    if (!uri) return new Response(null, { status: 404, headers: { 'cache-control': 'private, max-age=3600' } });
    return new Response(null, { status: 302, headers: { location: uri, 'cache-control': 'private, max-age=86400' } });
  } catch (e) {
    if (e instanceof AdminError) return new Response(null, { status: e.status });
    throw e;
  }
};
