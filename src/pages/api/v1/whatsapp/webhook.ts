import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { handleInbound } from '~/lib/leads/inbound';
import { json, leadsRuntime } from '~/lib/leads/server';
import { parseWebhook, validSignature } from '~/lib/leads/whatsapp';

/**
 * Webhook de WhatsApp Cloud API (docs/LEADS.md §WhatsApp). Un solo webhook para todas las empresas: el número que
 * recibe (phone_number_id) dice de qué espacio es. GET: verificación de Meta. POST: mensajes recibidos, firmados con el
 * App Secret (X-Hub-Signature-256). Siempre 200 rápido a lo que esté bien firmado, para que Meta no reintente.
 */
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const GET: APIRoute = async ({ url }) => {
  const verify = env('WHATSAPP_VERIFY_TOKEN');
  if (!verify) return new Response('Falta WHATSAPP_VERIFY_TOKEN', { status: 503 });
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && same(url.searchParams.get('hub.verify_token') ?? '', verify);
  return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('No', { status: 403 });
};

export const POST: APIRoute = async ({ request }) => {
  const secret = env('WHATSAPP_APP_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: 'too_large' }, 413);
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) return json({ error: 'bad_signature' }, 401);
  const rt = await leadsRuntime();
  if ('error' in rt) return json({ error: 'not_configured' }, 503);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  const { inbound, statuses } = parseWebhook(body);
  try {
    const r = await handleInbound(rt.db, inbound, new Date());
    for (const s of statuses.filter((x) => x.status === 'failed')) console.warn('[whatsapp] entrega fallida', s.id, s.error);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[whatsapp]', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
};
