import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { unsubscribeToken } from '~/lib/leads/intake';
import { leadsRuntime } from '~/lib/leads/server';
import { msgLocale } from '~/lib/leads/templates';

/**
 * Baja con un clic (docs/LEADS.md §Bajas): el enlace de cada email (y la cabecera List-Unsubscribe) lleva el lead y una
 * firma. Da de baja ese email de todo lo que envía el espacio. GET muestra la confirmación; POST es el «one-click» de Gmail.
 */
const TEXT = {
  es: { ok: 'Hecho: no te volveremos a escribir.', bad: 'El enlace no es válido.' },
  en: { ok: "Done: we won't write to you again.", bad: 'This link is not valid.' },
  fr: { ok: "C'est fait : nous ne t'écrirons plus.", bad: "Ce lien n'est pas valide." },
};
const page = (msg: string, status: number) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${msg}</title><body style="font-family:system-ui;max-width:32rem;margin:20vh auto;padding:0 1rem;font-size:18px">${msg}</body>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

async function run(url: URL) {
  const rt = await leadsRuntime();
  if ('error' in rt) return { ok: false, locale: 'es' };
  const id = url.searchParams.get('l') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !t) return { ok: false, locale: 'es' };
  const want = unsubscribeToken(id, rt.secret);
  if (t.length !== want.length || !timingSafeEqual(Buffer.from(t), Buffer.from(want))) return { ok: false, locale: 'es' };
  const lead = await rt.db.getLead(id);
  if (!lead) return { ok: false, locale: 'es' };
  await rt.db.suppress(lead.tenantId, 'all', lead.email, 'Baja desde el enlace del email');
  await rt.db.cancelPending(lead.id, null);
  await rt.db.addEvent({ tenantId: lead.tenantId, leadId: lead.id, kind: 'suppressed', data: { channel: 'all', via: 'unsubscribe_link' } });
  return { ok: true, locale: lead.locale };
}

export const GET: APIRoute = async ({ url }) => {
  const r = await run(url);
  const t = TEXT[msgLocale(r.locale)];
  return page(r.ok ? t.ok : t.bad, r.ok ? 200 : 400);
};
export const POST: APIRoute = async ({ url }) => {
  const r = await run(url);
  return new Response(null, { status: r.ok ? 200 : 400 });
};
