import type { APIRoute } from 'astro';
import { AdminError } from '~/lib/admin/service';
import { localizeError } from '~/lib/i18n/errors';
import { LEAD_ERRORS } from '~/lib/leads/service';
import { EMAIL_LOGO_MAX_BYTES, emailLogoType } from '~/lib/leads/logo-upload';

/**
 * Sube el logo de los emails de los leads (Ajustes → Tus mensajes) y devuelve su dirección pública; el formulario la
 * pone en el campo y se guarda como siempre. Solo admin (lo comprueba uploadAsset). En demo no hay dónde subirlo.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const admin = locals.admin;
  if (!admin) return Response.json({ error: 'No autenticado' }, { status: 401 });
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AdminError(422, LEAD_ERRORS.noFile);
    if (file.size > EMAIL_LOGO_MAX_BYTES) throw new AdminError(422, LEAD_ERRORS.logoTooBig);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = emailLogoType(bytes);
    if (!type) throw new AdminError(422, LEAD_ERRORS.svgLogo);
    const name = `logo.${type === 'image/png' ? 'png' : 'jpg'}`;
    const url = await admin.tenantAdmin.uploadAsset({ name, type, bytes }, 'logo');
    return Response.json({ url }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: localizeError(e.message, locals.locale ?? 'es') }, { status: e.status });
    throw e;
  }
};
