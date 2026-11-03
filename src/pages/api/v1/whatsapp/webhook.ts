import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { assistantDb, assistantDeps } from '~/lib/assistant/server';
import { processAssistant, teamMember } from '~/lib/assistant/process';
import type { Member } from '~/lib/assistant/db';
import { handleInbound } from '~/lib/leads/inbound';
import { json, leadsRuntime } from '~/lib/leads/server';
import { parseWebhook, validSignature, type Inbound } from '~/lib/leads/whatsapp';

/**
 * Webhook de WhatsApp Cloud API (docs/LEADS.md §WhatsApp). Un solo webhook para todas las empresas: el número que
 * recibe (phone_number_id) dice de qué espacio es. GET: verificación de Meta. POST: mensajes recibidos, firmados con el
 * App Secret (X-Hub-Signature-256). Siempre 200 rápido a lo que esté bien firmado, para que Meta no reintente.
 * Lo que escribe alguien del equipo (su teléfono de Mi cuenta) va al asistente (docs/ASSISTANT.md), en segundo plano;
 * lo demás, a los leads. En demo, sin App Secret, se acepta sin firma (para las pruebas) y el asistente contesta antes
 * de responder.
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
  const demo = appMode() === 'demo';
  if (!secret && !demo) return json({ error: 'not_configured' }, 503);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: 'too_large' }, 413);
  if (secret && !validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) return json({ error: 'bad_signature' }, 401);
  const rt = await leadsRuntime();
  if ('error' in rt) return json({ error: 'not_configured' }, 503);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  const { inbound, statuses } = parseWebhook(body);
  try {
    // Quién escribe: alguien del equipo del espacio de ese número → asistente; si no, lead.
    const adb = await assistantDb();
    const team: Array<{ m: Inbound; member: Member }> = [];
    const leads: Inbound[] = [];
    for (const m of inbound) {
      const s = adb ? await rt.db.settingsByWhatsappPhone(m.phoneId) : null;
      const member = s && adb ? await teamMember(adb, s.tenantId, m.from) : null;
      if (member) team.push({ m, member }); else leads.push(m);
    }
    if (team.length && adb) {
      const run = async () => {
        const deps = await assistantDeps(adb, rt.whatsapp);
        for (const { m, member } of team) {
          try { await processAssistant({ ...deps, now: new Date() }, m.phoneId, member, m); } catch (e) { console.error('[assistant]', e instanceof Error ? e.message : e); }
        }
      };
      if (demo) await run(); else waitUntil(run());
    }
    const r = await handleInbound(rt.db, leads, new Date());
    for (const s of statuses.filter((x) => x.status === 'failed')) console.warn('[whatsapp] entrega fallida', s.id, s.error);
    return json({ ok: true, ...r, assistant: team.length });
  } catch (e) {
    console.error('[whatsapp]', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
};
