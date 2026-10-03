import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotifyDb, NotifyJobDb } from './db';
import type { Notification } from './types';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}
type Row = Record<string, unknown>;
const toN = (r: Row): Notification => ({
  id: r.id as string, tenantId: r.tenant_id as string, userId: r.user_id as string, kind: r.kind as string,
  severity: r.severity as Notification['severity'], entityKey: r.entity_key as string, params: (r.params as Record<string, unknown>) ?? {},
  createdAt: r.created_at as string, readAt: (r.read_at as string) ?? null, dismissedAt: (r.dismissed_at as string) ?? null,
  emailedAt: (r.emailed_at as string) ?? null, resolvedAt: (r.resolved_at as string) ?? null,
});

/** Con la sesión del usuario: RLS limita a sus avisos y los grants a leído/descartado. */
export function supabaseNotifyDb(sb: SupabaseClient): NotifyDb {
  return {
    async list(t, u, { limit }) {
      return (check(await sb.from('notification').select('*').eq('tenant_id', t).eq('user_id', u).order('created_at', { ascending: false }).limit(limit)) ?? []).map(toN);
    },
    async markRead(t, u, ids) {
      let q = sb.from('notification').update({ read_at: new Date().toISOString() }).eq('tenant_id', t).eq('user_id', u).is('read_at', null);
      if (ids) q = q.in('id', ids);
      check(await q);
    },
    async dismiss(t, u, id) {
      const at = new Date().toISOString();
      const rows = check(await sb.from('notification').update({ dismissed_at: at }).eq('tenant_id', t).eq('user_id', u).eq('id', id).select('id, read_at')) ?? [];
      if (rows.length && !rows[0].read_at) check(await sb.from('notification').update({ read_at: at }).eq('id', id));
      return rows.length > 0;
    },
    async getEmailPref(u) {
      const r = check(await sb.from('users').select('notify_email').eq('id', u).maybeSingle()) as { notify_email: boolean } | null;
      return r?.notify_email ?? true;
    },
    async setEmailPref(u, on) { check(await sb.from('users').update({ notify_email: on }).eq('id', u)); },
    async getLocale(u) {
      const r = check(await sb.from('users').select('locale').eq('id', u).maybeSingle()) as { locale: string | null } | null;
      return r?.locale ?? null;
    },
    async setLocale(u, l) { check(await sb.from('users').update({ locale: l }).eq('id', u)); },
    async getDailyPref(u) {
      // Tolerante: si la migración 20261018 aún no se ha aplicado, valores por defecto (no rompe Mi cuenta).
      const { data: r, error } = await sb.from('users').select('daily_digest, timezone').eq('id', u).maybeSingle();
      if (error) return { daily: true, timezone: 'Europe/Madrid' };
      return { daily: (r?.daily_digest as boolean) ?? true, timezone: (r?.timezone as string) ?? 'Europe/Madrid' };
    },
    async setDailyPref(u, p) {
      const { error } = await sb.from('users').update({ daily_digest: p.daily, timezone: p.timezone }).eq('id', u);
      if (error) console.error('[daily-pref]', error.message);  // migración pendiente: no rompe el guardado del resto
    },
  };
}

/** SOLO con un cliente service role (cron). Ve todos los tenants. */
export function supabaseNotifyJobDb(sb: SupabaseClient): NotifyJobDb {
  return {
    async unsent(before) {
      return (check(await sb.from('notification').select('*').eq('severity', 'action').is('emailed_at', null).lte('created_at', before).limit(2000)) ?? []).map(toN);
    },
    async forDigest(userIds, since) {
      if (!userIds.length) return [];
      return (check(await sb.from('notification').select('*').in('user_id', userIds).is('dismissed_at', null)
        .or(`created_at.gte.${since},resolved_at.is.null`).limit(5000)) ?? []).map(toN);
    },
    async recipients(ids) {
      if (!ids.length) return [];
      return (check(await sb.from('users').select('id, email, display_name, notify_email, digest_sent_at, locale').in('id', ids)) ?? []).map((r: Row) => ({
        userId: r.id as string, email: r.email as string, name: (r.display_name as string) || null,
        notifyEmail: (r.notify_email as boolean) ?? true, digestSentAt: (r.digest_sent_at as string) ?? null, locale: (r.locale as string) ?? null,
      }));
    },
    async digestDue(before) {
      const users = check(await sb.from('users').select('id').or(`digest_sent_at.is.null,digest_sent_at.lt.${before}`).limit(5000)) ?? [];
      if (!users.length) return [];
      const ids = users.map((u: Row) => u.id as string);
      const withNotes = check(await sb.from('notification').select('user_id').in('user_id', ids).is('dismissed_at', null).limit(20000)) ?? [];
      return [...new Set(withNotes.map((r: Row) => r.user_id as string))];
    },
    async tenants(ids) {
      if (!ids.length) return [];
      const ts = check(await sb.from('tenant').select('id, name').in('id', ids)) ?? [];
      const ds = check(await sb.from('domain').select('tenant_id, hostname').in('tenant_id', ids).eq('is_primary', true)) ?? [];
      return ts.map((t: Row) => ({ id: t.id as string, name: t.name as string, hostname: (ds.find((d: Row) => d.tenant_id === t.id)?.hostname as string) ?? null }));
    },
    async markEmailed(ids, at) {
      for (let i = 0; i < ids.length; i += 200) check(await sb.from('notification').update({ emailed_at: at }).in('id', ids.slice(i, i + 200)).is('emailed_at', null));
    },
    async markDigest(userId, at) { check(await sb.from('users').update({ digest_sent_at: at }).eq('id', userId)); },
    async dailyMembers() {
      const ms = check(await sb.from('membership').select('user_id, tenant_id, role').limit(20000)) ?? [];
      const ids = [...new Set(ms.map((m: Row) => m.user_id as string))];
      const users = new Map<string, Row>();
      for (let i = 0; i < ids.length; i += 200) {
        for (const u of check(await sb.from('users').select('id, email, display_name, locale, notify_email, daily_digest, timezone').in('id', ids.slice(i, i + 200))) ?? []) users.set(u.id as string, u);
      }
      return ms.flatMap((m: Row) => {
        const u = users.get(m.user_id as string);
        return u ? [{
          userId: m.user_id as string, tenantId: m.tenant_id as string, role: m.role as string, email: u.email as string, name: (u.display_name as string) || null,
          locale: (u.locale as string) ?? null, timezone: (u.timezone as string) ?? 'Europe/Madrid', daily: (u.notify_email as boolean ?? true) && (u.daily_digest as boolean ?? true),
        }] : [];
      });
    },
    async dailyLogged(days) {
      if (!days.length) return new Set();
      const rows = check(await sb.from('daily_digest_log').select('user_id, tenant_id, day').in('day', days).limit(20000)) ?? [];
      return new Set(rows.map((r: Row) => `${r.user_id}|${r.tenant_id}|${r.day}`));
    },
    async dailyDossiers(tenantIds) {
      if (!tenantIds.length) return [];
      const rows = check(await sb.from('dossier').select('id, tenant_id, author_id, title, prospect_company, status, outcome, next_step, next_step_at, published_at')
        .in('tenant_id', tenantIds).eq('outcome', 'open').neq('status', 'archived').limit(20000)) ?? [];
      return rows.map((r: Row) => ({
        id: r.id as string, tenantId: r.tenant_id as string, authorId: (r.author_id as string) ?? null, title: r.title as string, company: (r.prospect_company as string) ?? null,
        status: r.status as string, outcome: r.outcome as 'open', nextStep: (r.next_step as string) ?? null, nextStepAt: (r.next_step_at as string) ?? null, publishedAt: (r.published_at as string) ?? null,
      }));
    },
    async dailyOpens(tenantIds, since) {
      if (!tenantIds.length) return [];
      return (check(await sb.from('dossier_view').select('dossier_id, last_seen_at').in('tenant_id', tenantIds).gte('started_at', since).limit(20000)) ?? [])
        .map((r: Row) => ({ dossierId: r.dossier_id as string, lastSeenAt: r.last_seen_at as string }));
    },
    async markDaily(userId, tenantId, day, emailed) {
      check(await sb.from('daily_digest_log').upsert({ user_id: userId, tenant_id: tenantId, day, emailed }, { onConflict: 'user_id,tenant_id,day', ignoreDuplicates: true }));
    },
  };
}
