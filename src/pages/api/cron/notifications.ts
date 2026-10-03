import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { requestOrigin } from '~/lib/http';
import { runNotificationJob } from '~/lib/notify/job';
import { demoMailer, resendMailer } from '~/lib/notify/mailer';

/**
 * Emails de avisos (docs/NOTIFICATIONS.md): inmediato para lo que pide acción y resumen de los lunes.
 * Lo llama un cron con `Authorization: Bearer $CRON_SECRET` (Vercel Cron lo envía solo si CRON_SECRET existe).
 * ?digest=force|skip para forzar u omitir el resumen semanal; ?daily=force|skip, el diario. Nunca devuelve secretos ni datos de avisos.
 */
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const GET: APIRoute = async ({ request, url }) => {
  const secret = env('CRON_SECRET');
  const mode = appMode();
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (secret ? !same(given, secret) : mode !== 'demo') {
    return Response.json({ error: secret ? 'No autorizado' : 'Falta CRON_SECRET en el servidor' }, { status: secret ? 401 : 503 });
  }
  const digest = (['force', 'skip'].includes(url.searchParams.get('digest') ?? '') ? url.searchParams.get('digest') : 'auto') as 'force' | 'skip' | 'auto';
  const daily = (['force', 'skip'].includes(url.searchParams.get('daily') ?? '') ? url.searchParams.get('daily') : 'auto') as 'force' | 'skip' | 'auto';
  const fallbackOrigin = env('PUBLIC_SITE_URL') || requestOrigin(request, url);

  if (mode === 'demo') {
    const { demoNotifyJobDb } = await import('~/lib/notify/db-demo');
    const r = await runNotificationJob(demoNotifyJobDb(), demoMailer, { now: new Date(), fallbackOrigin, digest, daily });
    return Response.json({ mode, ...r });
  }

  const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM'].filter((k) => !env(k));
  if (missing.length) return Response.json({ error: `Faltan variables: ${missing.join(', ')}` }, { status: 503 });
  const { supabaseNotifyJobDb } = await import('~/lib/notify/db-supabase');
  const sb = createClient(env('PUBLIC_SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await runNotificationJob(supabaseNotifyJobDb(sb), resendMailer(env('RESEND_API_KEY')!, env('RESEND_FROM')!), { now: new Date(), fallbackOrigin, digest, daily });
  return Response.json({ mode, ...r }, { status: r.failed ? 502 : 200 });
};
