import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { env } from '~/lib/env';
import { appMode } from '~/lib/mode';
import { processDue } from '~/lib/leads/job';
import { purgeDue } from '~/lib/leads/privacy';
import { runReminders } from '~/lib/assistant/reminders';
import { reminderDeps } from '~/lib/assistant/server';
import { leadsRuntime } from '~/lib/leads/server';

/**
 * Cola de envíos de los leads (docs/LEADS.md §Envíos): cada minuto, con `Authorization: Bearer $CRON_SECRET`
 * (pg_cron de Supabase). Manda lo que ya toca: WhatsApp 1 y 2, respuestas automáticas y avisos. Una vez al día por
 * espacio, además, cumple los plazos de conservación (docs/LEADS.md §Privacidad). Nunca devuelve datos.
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
  const now = new Date();
  const r = await processDue({ db: rt.db, mailer: rt.mailer, whatsapp: rt.whatsapp, now, secret: rt.secret, mailerFor: rt.mailerFor, classifier: rt.classifier }, { limit: 100 });
  // El borrado diario no puede parar los envíos: si falla, se intenta en el siguiente minuto.
  let purged = 0;
  try { purged = (await purgeDue(rt.privacy, rt.db, now, rt.secret)).length; } catch (e) { console.error('[leads] borrado diario', e instanceof Error ? e.message : e); }
  // Recordatorios por WhatsApp de la mañana (docs/ASSISTANT.md §Recordatorios): cada 10 minutos basta.
  let reminders = 0;
  if (rt.whatsapp && (now.getUTCMinutes() % 10 === 0 || new URL(request.url).searchParams.get('reminders') === 'force')) {
    try {
      const deps = await reminderDeps(rt.whatsapp, (t) => rt.db.settings(t), now);
      if (deps) reminders = (await runReminders(deps)).sent;
    } catch (e) { console.error('[reminders]', e instanceof Error ? e.message : e); }
  }
  return Response.json({ ok: true, ...r, purged, reminders, email: !!rt.mailer, whatsapp: !!rt.whatsapp });
};
