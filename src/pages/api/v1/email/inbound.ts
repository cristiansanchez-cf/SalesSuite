import type { APIRoute } from 'astro';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { json } from '~/lib/leads/server';
import { verifySvix } from '~/lib/inbox/svix';
import { processReceived, type FullEmail, type ReceivedEvent } from '~/lib/inbox/process';
import { demoReceived, inboxRuntime } from '~/lib/inbox/server';

/**
 * POST /api/v1/email/inbound — webhook de Resend «email.received» (docs/CRM_DINAMICO.md §47): un correo que alguien del
 * equipo reenvía o pone en copia a su dirección «apuntar-…@». Firmado por Resend (Svix) con RESEND_INBOUND_SECRET.
 * Responde 200 aunque no lo apunte (dirección desconocida, sin empresa…); 5xx solo si hay que reintentar.
 * En demo, sin secreto, admite el correo entero en `demo_email` (para las pruebas).
 */
const MAX_BYTES = 262_144;

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  const secret = env('RESEND_INBOUND_SECRET');
  const demo = appMode() === 'demo';
  if (secret) {
    const ok = verifySvix(secret, { id: request.headers.get('svix-id'), timestamp: request.headers.get('svix-timestamp'), signature: request.headers.get('svix-signature') }, raw);
    if (!ok) return json({ error: 'bad_signature' }, 401);
  } else if (!demo) {
    console.error('[inbound] falta RESEND_INBOUND_SECRET');
    return json({ error: 'not_configured' }, 503);
  }
  let body: { type?: string; data?: ReceivedEvent; demo_email?: FullEmail };
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  if (body.type !== 'email.received' || !body.data?.email_id) return json({ ignored: true });
  if (demo && body.demo_email) demoReceived.set(body.data.email_id, body.demo_email);

  const rt = await inboxRuntime();
  if ('error' in rt) { console.error('[inbound]', rt.error); return json({ error: 'not_configured' }, 503); }
  try {
    const r = await processReceived(rt, body.data);
    return json({ ok: true, status: r.status });
  } catch (e) {
    console.error('[inbound]', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
};
