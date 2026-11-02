import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { publicRepository } from '~/lib/data';
import { env } from '~/lib/env';
import { requestHost } from '~/lib/http';
import { appMode } from '~/lib/mode';
import { resolveTenant } from '~/lib/tenant';
import { corsHeaders, originAllowed } from '~/lib/leads/cors';
import { intake } from '~/lib/leads/intake';
import { processDue } from '~/lib/leads/job';
import { clientIp, json, leadsRuntime, turnstileVerifier } from '~/lib/leads/server';

/**
 * POST /api/v1/leads — la única puerta de entrada de leads de las webs (docs/LEADS.md). Público y desde el navegador:
 * el espacio lo fija el dominio (enjoy.ventas.cofundo.io → Enjoy) y `brand` tiene que ser el suyo. CORS por lista
 * blanca del espacio. Responde en < 2 s; los envíos salen después, en segundo plano.
 */
const MAX_BYTES = 32_768;

async function context(request: Request, url: URL) {
  const host = requestHost(request, url.host);
  const tenant = await resolveTenant(publicRepository(), host, { devTenantSlug: env('DEV_TENANT_SLUG'), demoAnyHost: appMode() === 'demo' && env('DEMO_MODE') === '1' });
  const rt = await leadsRuntime();
  const settings = tenant && !('error' in rt) ? await rt.db.settings(tenant.id) : null;
  return { tenant, rt, settings };
}

export const OPTIONS: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get('origin');
  const { settings } = await context(request, url);
  const ok = !!settings && originAllowed(origin, settings.allowedOrigins);
  return new Response(null, { status: ok ? 204 : 403, headers: corsHeaders(origin, ok) });
};

export const POST: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get('origin');
  const { tenant, rt, settings } = await context(request, url);
  // Sin Origin (curl, servidor): se admite; desde un navegador, solo los orígenes de la lista.
  const allowed = !!settings && (!origin || originAllowed(origin, settings.allowedOrigins));
  const cors = corsHeaders(origin, allowed);
  if ('error' in rt) { console.error('[leads]', rt.error); return json({ error: 'not_configured' }, 503, cors); }
  if (!tenant || !settings) return json({ error: 'not_found' }, 404, cors);
  if (!allowed) return json({ error: 'origin_not_allowed' }, 403, cors);
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return json({ errors: { body: 'content_type' } }, 415, cors);
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ errors: { body: 'too_large' } }, 413, cors);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ errors: { body: 'invalid_json' } }, 400, cors); }

  try {
    const now = new Date();
    const r = await intake({
      db: rt.db, tenant: { id: tenant.id, name: tenant.name }, settings, now, origin, ip: clientIp(request), secret: rt.secret,
      baseUrl: `${url.protocol}//${requestHost(request, url.host)}`, whatsappReady: !!rt.whatsapp, turnstile: turnstileVerifier(),
    }, body);
    // Lo que toca ya (respuesta automática y aviso interno): en segundo plano, sin hacer esperar a la web.
    if (r.schedule && r.leadId) {
      waitUntil(processDue({ db: rt.db, mailer: rt.mailer, whatsapp: rt.whatsapp, now, secret: rt.secret, mailerFor: rt.mailerFor, classifier: rt.classifier }, { leadId: r.leadId })
        .catch((e) => console.error('[leads] envío inmediato', e instanceof Error ? e.message : e)));
    }
    return json(r.body, r.status, cors);
  } catch (e) {
    console.error('[leads]', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500, cors);
  }
};
