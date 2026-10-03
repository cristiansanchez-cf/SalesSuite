import type { APIRoute } from 'astro';
import { ingestDb, json } from '~/lib/commissions/api';
import { handleStripe } from '~/lib/commissions/stripe';

/**
 * POST /api/v1/stripe/<id del espacio> — webhook de Stripe (docs/COMMISSIONS.md §Stripe). Lo autentica la firma
 * (Stripe-Signature con el secreto whsec_ del espacio), no una clave API: Stripe no manda cabeceras propias.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, params }) => {
  const tenantId = String(params.tenant ?? '');
  if (!UUID.test(tenantId)) return json({ error: 'Espacio no válido' }, 404);
  if (Number(request.headers.get('content-length') ?? 0) > 1_000_000) return json({ error: 'Cuerpo demasiado grande' }, 413);
  const db = await ingestDb();
  if (db instanceof Response) return db;
  const raw = await request.text();
  try {
    const r = await handleStripe(db, tenantId.toLowerCase(), raw, request.headers.get('stripe-signature'));
    return json(r.body, r.status);
  } catch (e) {
    // Fallo nuestro (base de datos…): 500 para que Stripe lo reintente.
    console.error('[stripe]', e instanceof Error ? e.message : e);
    return json({ error: 'No se ha podido registrar; Stripe lo reintentará' }, 500);
  }
};
