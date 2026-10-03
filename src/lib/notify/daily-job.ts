/**
 * Envío del resumen diario (docs/NOTIFICATIONS.md). Lo llama el cron cada 10 min: a cada persona le llega
 * entre las 7:00 y las 12:00 de su zona horaria, una vez al día por espacio y SOLO si hay algo que mover.
 */
import type { DailyMember, NotifyJobDb, TenantInfo } from './db';
import type { Mailer } from './mailer';
import { composeHref, dailyDue, dailyPlan, type DailyItem, type DailyOpen, type DailyPlan, type DailyReason } from './daily';
import { formatters, isLocale, type Locale } from '../i18n/core';
import { notifyMessages } from '../i18n/messages/notify';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MANAGERS = new Set(['admin', 'lead']);

export interface DailyResult { sent: number; empty: number; failed: number }

export function dailyEmail(p: {
  plan: DailyPlan; member: DailyMember; tenant: TenantInfo | undefined; base: string; names: Map<string, string>; now: Date;
}): { subject: string; html: string; text: string } {
  const L: Locale = isLocale(p.member.locale ?? '') ? (p.member.locale as Locale) : 'es';
  const M = notifyMessages[L];
  const D = M.daily;
  const f = formatters(L);
  const tz = p.member.timezone;
  const tenantName = p.tenant?.name ?? 'Ventas';
  const when = (iso: string) => f.date(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz });
  const rel = (iso: string) => f.relative(iso, p.now.getTime());
  const detail = (i: DailyItem) => {
    const d = i.dossier;
    const opened = (o: DailyOpen | null) => (o ? D.openedLine(o.opens, rel(o.lastAt)) : null);
    if (i.reason === 'overdue' || i.reason === 'today') return [`${d.nextStep || D.noStep} · ${when(d.nextStepAt!)}`, opened(i.opened)].filter(Boolean).join(' · ');
    if (i.reason === 'opened') return opened(i.opened)!;
    return D.publishedLine(rel(d.publishedAt!));
  };
  const SECTIONS: Array<{ reason: DailyReason; heading: string; color: string }> = [
    { reason: 'overdue', heading: D.overdue, color: '#b42318' },
    { reason: 'today', heading: D.today, color: '#1a1a1a' },
    { reason: 'opened', heading: D.opened, color: '#5b21b6' },
    { reason: 'noNextStep', heading: D.noNextStep, color: '#555' },
  ];
  // «Club Sol · Fiesta de verano», sin repetir la empresa si el título ya la lleva.
  const label = (i: DailyItem) => (i.dossier.company && !i.dossier.title.toLowerCase().includes(i.dossier.company.toLowerCase()) ? `${i.dossier.company} · ${i.dossier.title}` : i.dossier.title);
  const btn = 'display:inline-block;padding:6px 12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600';
  const li = (i: DailyItem) => `<li style="margin:0 0 16px;list-style:none">
<div style="font-weight:600">${esc(label(i))}</div><div style="color:#555;font-size:14px;margin:2px 0 8px">${esc(detail(i))}</div>
<a href="${esc(p.base + composeHref(i.dossier, i.reason))}" style="${btn};background:#1a1a1a;color:#fff">${esc(D.prepare)}</a>
<a href="${esc(`${p.base}/admin/dossiers/${i.dossier.id}`)}" style="${btn};background:#f4f2ef;color:#1a1a1a;margin-left:6px">${esc(D.open)}</a></li>`;
  const team = p.plan.team;
  const teamLines = team ? [
    team.overdue ? D.teamOverdue(team.overdue) : null,
    team.openedNoStep ? D.teamOpened(team.openedNoStep) : null,
    ...team.people.map((x) => D.teamPerson(p.names.get(x.userId) ?? '—', x.overdue)),
  ].filter((x): x is string => !!x) : [];
  const hello = M.email.hello(p.member.name ? p.member.name.split(' ')[0] : null);
  const html = `<!doctype html><html lang="${L}"><body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(D.title)} · ${esc(tenantName)}</h1><p style="margin:0 0 20px;line-height:1.5">${esc(`${hello} ${D.intro}`)}</p>
${SECTIONS.map((s) => {
    const items = p.plan.items.filter((i) => i.reason === s.reason);
    return items.length ? `<h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${s.color};margin:24px 0 12px">${esc(s.heading)} · ${items.length}</h2><ul style="padding:0;margin:0">${items.map(li).join('')}</ul>` : '';
  }).join('')}
${teamLines.length ? `<h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:24px 0 12px">${esc(D.team)}</h2><ul style="padding-left:18px;margin:0 0 12px">${teamLines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul><a href="${esc(p.base)}/admin/inicio" style="${btn};background:#f4f2ef;color:#1a1a1a">${esc(D.seeTeam)}</a>` : ''}
<p style="margin:28px 0 0;font-size:12px;color:#777">${esc(D.footer)} <a href="${esc(p.base)}/admin/account#avisos" style="color:#777">${esc(D.account)}</a>.</p>
</div></body></html>`;
  const text = [
    `${D.title} · ${tenantName}`, '', `${hello} ${D.intro}`,
    ...SECTIONS.flatMap((s) => {
      const items = p.plan.items.filter((i) => i.reason === s.reason);
      return items.length ? ['', `${s.heading.toUpperCase()} · ${items.length}`, ...items.map((i) => `- ${label(i)}: ${detail(i)}\n  ${D.prepare}: ${p.base}${composeHref(i.dossier, i.reason)}`)] : [];
    }),
    ...(teamLines.length ? ['', D.team.toUpperCase(), ...teamLines.map((l) => `- ${l}`), `${p.base}/admin/inicio`] : []),
    '', `${D.footer} ${p.base}/admin/account#avisos`,
  ].join('\n');
  const n = p.plan.items.length;
  return { subject: n ? D.subject(tenantName, n) : D.subjectTeam(tenantName), html, text };
}

export async function runDailyDigest(db: NotifyJobDb, mailer: Mailer, o: { now: Date; fallbackOrigin: string; force?: boolean }): Promise<DailyResult> {
  const r: DailyResult = { sent: 0, empty: 0, failed: 0 };
  const members = await db.dailyMembers();
  const want = members.filter((m) => m.daily);
  if (!want.length) return r;
  // Días locales posibles hoy (según las zonas de cada uno) para consultar el registro de una vez.
  const days = [...new Set(want.map((m) => dailyDue(o.now, m.timezone, false).day))];
  const logged = await db.dailyLogged(days);
  const due = want.filter((m) => {
    const sent = logged.has(`${m.userId}|${m.tenantId}|${dailyDue(o.now, m.timezone, false).day}`);
    // force (pruebas y ?daily=force): sin esperar a la hora, pero nunca dos veces el mismo día.
    return o.force ? !sent : dailyDue(o.now, m.timezone, sent).due;
  });
  if (!due.length) return r;
  const tenantIds = [...new Set(due.map((m) => m.tenantId))];
  const [dossiers, visits, tenants] = await Promise.all([
    db.dailyDossiers(tenantIds), db.dailyOpens(tenantIds, new Date(o.now.getTime() - 86_400_000).toISOString()), db.tenants(tenantIds),
  ]);
  const opens = new Map<string, DailyOpen>();
  for (const v of visits) {
    const cur = opens.get(v.dossierId);
    opens.set(v.dossierId, { opens: (cur?.opens ?? 0) + 1, lastAt: !cur || v.lastSeenAt > cur.lastAt ? v.lastSeenAt : cur.lastAt });
  }
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const names = new Map(members.map((m) => [m.userId, m.name || m.email.split('@')[0]]));
  for (const m of due) {
    const day = dailyDue(o.now, m.timezone, false).day;
    const plan = dailyPlan({ userId: m.userId, manager: MANAGERS.has(m.role) }, dossiers.filter((d) => d.tenantId === m.tenantId), opens, o.now, m.timezone);
    if (!plan.items.length && !plan.team) { await db.markDaily(m.userId, m.tenantId, day, false); r.empty++; continue; }
    const t = tenantById.get(m.tenantId);
    const base = t?.hostname ? `https://${t.hostname}` : o.fallbackOrigin;
    const mail = dailyEmail({ plan, member: m, tenant: t, base, names, now: o.now });
    try {
      await mailer.send({ to: m.email, subject: mail.subject, html: mail.html, text: mail.text, tag: 'daily' });
      await db.markDaily(m.userId, m.tenantId, day, true);
      r.sent++;
    } catch { r.failed++; }
  }
  return r;
}
