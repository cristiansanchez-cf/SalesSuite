import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { processDue } from '~/lib/leads/job';
import { leadsRuntime } from '~/lib/leads/server';

/**
 * Cola de envíos de los leads (docs/LEADS.md §Envíos): cada minuto, con `Authorization: Bearer $CRON_SECRET`
 * (pg_cron de Supabase). Manda lo que ya toca: WhatsApp 1 y 2, respuestas automáticas y avisos. Nunca devuelve datos.
 */
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const GET: APIRoute = async ({ request }) => {
  const secret = env('CRON_SECRET');
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (secret ? !same(given, secret) : appMode() !== 'demo') {
    return Response.json({ error: secret ? 'No autorizado' : 'Falta CRON_SECRET en el servidor' }, { status: secret ? 401 : 503 });
  }
  const rt = await leadsRuntime();
  if ('error' in rt) return Response.json({ error: rt.error }, { status: 503 });
  const r = await processDue({ db: rt.db, mailer: rt.mailer, whatsapp: rt.whatsapp, now: new Date(), secret: rt.secret, mailerFor: rt.mailerFor, classifier: rt.classifier }, { limit: 100 });
  return Response.json({ ok: true, ...r, email: !!rt.mailer, whatsapp: !!rt.whatsapp });
};
