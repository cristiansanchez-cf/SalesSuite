/**
 * El calendario de una persona (docs/CALENDAR.md): /cal/<enlace>.ics. Sin sesión (lo piden Outlook o Google); el enlace
 * secreto es la llave. Si no existe, 404 sin más detalle.
 */
import type { APIRoute } from 'astro';
import { feedFor } from '~/lib/calendar/feed';
import { buildIcs } from '~/lib/calendar/ics';
import { calendarMessages } from '~/lib/i18n/messages/calendar';
import { requestOrigin } from '~/lib/http';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
  const token = String(params.file ?? '').replace(/\.ics$/i, '');
  const feed = await feedFor(token, requestOrigin(request, url)).catch(() => null);
  if (!feed) return new Response('No encontrado', { status: 404, headers: { 'cache-control': 'no-store' } });
  const labels = calendarMessages[feed.locale as keyof typeof calendarMessages] ?? calendarMessages.es;
  const body = buildIcs(feed.items, { timeZone: feed.timezone, now: new Date(), labels });
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="ventas.ics"',
      'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer',
    },
  });
};
