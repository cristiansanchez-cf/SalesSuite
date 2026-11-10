import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { assistantDb, assistantDeps } from '~/lib/assistant/server';
import { digitsOf, processAssistant, teamMember } from '~/lib/assistant/process';
import { hubConfig, hubWhatsApp } from '~/lib/assistant/hub-config';
import { processHub } from '~/lib/assistant/hub';
import type { Member } from '~/lib/assistant/db';
import { handleInbound } from '~/lib/leads/inbound';
import { json, leadsRuntime } from '~/lib/leads/server';
import { parseWebhook, validSignature, type Inbound } from '~/lib/leads/whatsapp';

/**
 * Webhook de WhatsApp Cloud API (docs/LEADS.md §WhatsApp). Un solo webhook para todas las empresas: el número que
 * recibe (phone_number_id) dice de qué espacio es. GET: verificación de Meta. POST: mensajes recibidos, firmados con el
 * App Secret (X-Hub-Signature-256). Siempre 200 rápido a lo que esté bien firmado, para que Meta no reintente.
 * Lo que escribe alguien del equipo (su teléfono de Mi cuenta) va al asistente (docs/ASSISTANT.md), en segundo plano;
 * lo demás, a los leads. Lo que llega al número del asistente (ASSISTANT_WHATSAPP_PHONE_ID) es siempre del asistente: de
 * alguien del equipo de cualquier empresa (se le pregunta para cuál trabaja hoy) o, si no se le conoce, se ignora. En demo, sin App Secret, se acepta sin firma (para las pruebas) y el asistente contesta antes
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
  // El del número del asistente puede venir de otra app de Meta (con su propio App Secret).
  const secrets = [env('WHATSAPP_APP_SECRET'), env('ASSISTANT_WHATSAPP_APP_SECRET')].filter((x): x is string => !!x);
  const demo = appMode() === 'demo';
  if (!secrets.length && !demo) return json({ error: 'not_configured' }, 503);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: 'too_large' }, 413);
  const sig = request.headers.get('x-hub-signature-256');
  if (secrets.length && !secrets.some((x) => validSignature(raw, sig, x))) return json({ error: 'bad_signature' }, 401);
  const rt = await leadsRuntime();
  if ('error' in rt) return json({ error: 'not_configured' }, 503);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  const { inbound, statuses } = parseWebhook(body);
  try {
    // Quién escribe: alguien del equipo del espacio de ese número → asistente; si no, lead.
    const adb = await assistantDb();
    const hub = hubConfig();
    const team: Array<{ m: Inbound; member: Member }> = [];
    const hubTeam: Array<{ m: Inbound; members: Member[] }> = [];
    const leads: Inbound[] = [];
    for (const m of inbound) {
      if (hub && m.phoneId === hub.phoneId) {
        const members = adb ? await adb.membersByPhone(digitsOf(m.from)) : [];
        if (members.length) hubTeam.push({ m, members });
        continue;
      }
      const s = adb ? await rt.db.settingsByWhatsappPhone(m.phoneId) : null;
      const member = s && adb ? await teamMember(adb, s.tenantId, m.from) : null;
      if (member) team.push({ m, member }); else leads.push(m);
    }
    if ((team.length || hubTeam.length) && adb) {
      const run = async () => {
        const deps = await assistantDeps(adb, rt.whatsapp);
        for (const { m, member } of team) {
          try { await processAssistant({ ...deps, now: new Date() }, m.phoneId, member, m); } catch (e) { console.error('[assistant]', e instanceof Error ? e.message : e); }
        }
        const hubDeps = { ...deps, wa: hubWhatsApp(rt.whatsapp) };
        for (const { m, members } of hubTeam) {
          try { await processHub({ ...hubDeps, now: new Date() }, m.phoneId, members, m); } catch (e) { console.error('[assistant hub]', e instanceof Error ? e.message : e); }
        }
      };
      if (demo) await run(); else waitUntil(run());
    }
    const r = await handleInbound(rt.db, leads, new Date());
    for (const s of statuses.filter((x) => x.status === 'failed')) console.warn('[whatsapp] entrega fallida', s.id, s.error);
    return json({ ok: true, ...r, assistant: team.length + hubTeam.length });
  } catch (e) {
    console.error('[whatsapp]', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
};
