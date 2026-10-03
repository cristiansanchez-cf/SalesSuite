import type { APIRoute } from 'astro';
import { appMode } from '~/lib/mode';
import { demoOutbox } from '~/lib/notify/mailer';

/**
 * SOLO modo demo: el último email «enviado» (en demo no sale nada), para verlo tal cual.
 *   /api/dev/outbox?tag=daily&to=rep@enjoy.test    (tag: immediate | digest | daily)
 * En producción responde 404: nunca expone emails reales.
 */
export const GET: APIRoute = ({ url }) => {
  if (appMode() !== 'demo') return new Response('Not found', { status: 404 });
  const tag = url.searchParams.get('tag');
  const to = url.searchParams.get('to');
  const last = [...demoOutbox()].reverse().find((e) => (!tag || e.tag === tag) && (!to || e.to === to));
  if (!last) return new Response('Sin emails todavía. Lanza /api/cron/notifications?daily=force', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (url.searchParams.get('format') === 'text') return new Response(`${last.subject}\n\n${last.text}`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(last.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-email-subject': encodeURIComponent(last.subject) } });
};
