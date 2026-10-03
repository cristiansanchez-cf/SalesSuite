/**
 * Trabajo de emails (cron, docs/NOTIFICATIONS.md). Dos reglas para no llenar la bandeja:
 * 1. Inmediato: lo que pide una acción y es nuevo, agrupado en UN email por persona y espacio.
 * 2. Resumen semanal: lo que sigue abierto aunque ya lo vieras («te lo recuerdo») + las novedades de la semana.
 * Lo informativo nunca se envía suelto. Quien desactiva los emails solo ve la campana.
 */
import type { NotifyJobDb, Recipient, TenantInfo } from './db';
import type { Email, Mailer } from './mailer';
import { isOpen, renderNotification } from './render';
import type { Notification, NotificationView } from './types';

const MIN = 60_000;
const DAY = 86_400_000;
/** Margen antes de enviar: varios hechos seguidos van en un solo email, y si ya lo has visto en la app no se envía. */
export const GRACE_MS = 5 * MIN;
/** Lo que lleva abierto más de esto se repite en el resumen. */
export const STALE_MS = 2 * DAY;

export interface JobOptions { now: Date; fallbackOrigin: string; digest?: 'auto' | 'force' | 'skip' }
export interface JobResult { immediate: number; digests: number; skipped: number; failed: number }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const origin = (t: TenantInfo | undefined, fallback: string) => (t?.hostname ? `https://${t.hostname}` : fallback);
const hello = (r: Recipient) => (r.name ? `Hola, ${r.name.split(' ')[0]}:` : 'Hola:');

function layout(title: string, intro: string, sections: Array<{ heading: string; items: NotificationView[] }>, base: string, footer: string) {
  const li = (n: NotificationView) => `<li style="margin:0 0 12px"><a href="${esc(base + '/admin/notifications/' + n.id)}" style="color:#0a0a0a;font-weight:600">${esc(n.title)}</a>${n.detail ? `<br><span style="color:#555">${esc(n.detail)}</span>` : ''}</li>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:Inter,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e0;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1><p style="margin:0 0 20px;line-height:1.5">${esc(intro)}</p>
${sections.filter((s) => s.items.length).map((s) => `<h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:20px 0 10px">${esc(s.heading)}</h2><ul style="padding-left:18px;margin:0">${s.items.map(li).join('')}</ul>`).join('')}
<p style="margin:24px 0 0"><a href="${esc(base)}/admin/notifications" style="display:inline-block;background:#0a0a0a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Ver avisos</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#777">${esc(footer)} <a href="${esc(base)}/admin/account" style="color:#777">Cambiar en Mi cuenta</a>.</p>
</div></body></html>`;
  const text = [title, '', intro, ...sections.filter((s) => s.items.length).flatMap((s) => ['', s.heading.toUpperCase(), ...s.items.map((n) => `- ${n.title}${n.detail ? ` (${n.detail})` : ''}: ${base}/admin/notifications/${n.id}`)]),
    '', `${footer} ${base}/admin/account`].join('\n');
  return { html, text };
}

const groupBy = <T, K>(xs: T[], key: (x: T) => K) => xs.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map<K, T[]>());

export async function runNotificationJob(db: NotifyJobDb, mailer: Mailer, o: JobOptions): Promise<JobResult> {
  const r: JobResult = { immediate: 0, digests: 0, skipped: 0, failed: 0 };
  const nowIso = o.now.toISOString();

  // ---- 1. inmediato
  const unsent = await db.unsent(new Date(o.now.getTime() - GRACE_MS).toISOString());
  const people = new Map((await db.recipients([...new Set(unsent.map((n) => n.userId))])).map((p) => [p.userId, p]));
  const tenants = new Map((await db.tenants([...new Set(unsent.map((n) => n.tenantId))])).map((t) => [t.id, t]));
  for (const [key, ns] of groupBy(unsent, (n) => `${n.userId}|${n.tenantId}`)) {
    const [userId, tenantId] = key.split('|');
    const who = people.get(userId);
    // Ya visto en la app, ya resuelto o sin emails: no se envía, pero queda marcado para no reconsiderarlo.
    const send = ns.filter((n) => isOpen(n) && !n.readAt).map(renderNotification);
    if (!who?.notifyEmail || !send.length) { await db.markEmailed(ns.map((n) => n.id), nowIso); r.skipped += ns.length; continue; }
    const t = tenants.get(tenantId);
    const { html, text } = layout(
      send.length === 1 ? send[0].title : `${send.length} cosas esperan tu respuesta en ${t?.name ?? 'tu espacio'}`,
      `${hello(who)} esto necesita que hagas algo.`,
      [{ heading: 'Pide tu acción', items: send }], origin(t, o.fallbackOrigin),
      'Te escribimos solo cuando algo necesita tu acción y, los lunes, un resumen.',
    );
    try {
      await mailer.send({ to: who.email, subject: send.length === 1 ? `${t?.name ?? 'Ventas'}: ${send[0].title}` : `${t?.name ?? 'Ventas'}: ${send.length} cosas esperan tu respuesta`, html, text, tag: 'immediate' });
      await db.markEmailed(ns.map((n) => n.id), nowIso);
      r.immediate++;
    } catch { r.failed++; }
  }

  // ---- 2. resumen semanal (lunes, o forzado)
  const due = o.digest === 'force' || (o.digest !== 'skip' && o.now.getUTCDay() === 1);
  if (!due) return r;
  const ids = await db.digestDue(new Date(o.now.getTime() - 6 * DAY).toISOString());
  if (!ids.length) return r;
  const since = new Date(o.now.getTime() - 7 * DAY).toISOString();
  const all = await db.forDigest(ids, since);
  const who2 = new Map((await db.recipients(ids)).map((p) => [p.userId, p]));
  const ten2 = new Map((await db.tenants([...new Set(all.map((n) => n.tenantId))])).map((t) => [t.id, t]));
  for (const userId of ids) {
    const who = who2.get(userId);
    const mine = all.filter((n) => n.userId === userId);
    if (!who) continue;
    if (!who.notifyEmail) { await db.markDigest(userId, nowIso); continue; }
    let ok = true;
    for (const [tenantId, ns] of groupBy(mine, (n: Notification) => n.tenantId)) {
      const views = ns.map(renderNotification);
      const pending = views.filter((n) => n.open && n.severity === 'action' && o.now.getTime() - Date.parse(n.createdAt) >= STALE_MS);
      const news = views.filter((n) => n.severity === 'info' && n.createdAt >= since && !n.readAt);
      if (!pending.length && !news.length) continue;
      const t = ten2.get(tenantId);
      const { html, text } = layout(
        `Tu resumen semanal de ${t?.name ?? 'Ventas'}`,
        `${hello(who)} ${pending.length ? `ya lo has visto, pero te lo recuerdo: ${pending.length === 1 ? 'hay 1 cosa abierta' : `hay ${pending.length} cosas abiertas`}.` : 'esto es lo nuevo de la semana.'}`,
        [{ heading: 'Sigue pendiente', items: pending }, { heading: 'Novedades de la semana', items: news }], origin(t, o.fallbackOrigin),
        'Te enviamos este resumen los lunes, solo si hay algo.',
      );
      try {
        await mailer.send({ to: who.email, subject: `${t?.name ?? 'Ventas'}: tu resumen semanal${pending.length ? ` (${pending.length} pendiente${pending.length === 1 ? '' : 's'})` : ''}`, html, text, tag: 'digest' });
        r.digests++;
      } catch { r.failed++; ok = false; }
    }
    // Si un envío falla, se reintenta en la próxima pasada.
    if (ok) await db.markDigest(userId, nowIso);
  }
  return r;
}
