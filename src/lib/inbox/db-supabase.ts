import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundEmail, InboxServerDb, InboxUserDb } from './db';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`[supabase] ${r.error.message}`);
  return r.data;
}
const toEmail = (r: Row): InboundEmail => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, providerId: r.provider_id, messageId: r.message_id, receivedAt: r.received_at,
  fromAddr: r.from_addr, counterpart: r.counterpart, subject: r.subject, snippet: r.snippet, direction: r.direction, status: r.status,
  detail: r.detail, accountId: r.account_id, activityId: r.activity_id, createdAt: r.created_at,
});
const domainOf = (e: string | null | undefined) => (e && e.includes('@') ? e.split('@')[1]!.toLowerCase() : null);

/** Con la service role (solo el webhook). */
export function supabaseInboxServerDb(admin: SupabaseClient): InboxServerDb {
  return {
    async address(token) {
      const r = check(await admin.from('inbound_address').select('tenant_id, user_id').eq('token', token).maybeSingle()) as Row | null;
      return r ? { tenantId: r.tenant_id, userId: r.user_id } : null;
    },
    async seen(t, u, messageId) {
      const r = check(await admin.from('inbound_email').select('id').eq('tenant_id', t).eq('user_id', u).eq('message_id', messageId).maybeSingle());
      return !!r;
    },
    async record(x) {
      const r = check(await admin.from('inbound_email').upsert({
        tenant_id: x.tenantId, user_id: x.userId, provider_id: x.providerId, message_id: x.messageId, received_at: x.receivedAt, from_addr: x.fromAddr,
        counterpart: x.counterpart, subject: x.subject?.slice(0, 500) ?? null, snippet: x.snippet?.slice(0, 2000) ?? null, direction: x.direction, status: x.status,
        detail: x.detail?.slice(0, 500) ?? null, account_id: x.accountId, activity_id: x.activityId,
      }, { onConflict: 'tenant_id,user_id,message_id', ignoreDuplicates: true }).select('id').maybeSingle()) as Row | null;
      return r?.id ?? '';
    },
    async internalDomains(t) {
      const r = check(await admin.from('lead_settings').select('from_email, reply_to, notify_emails').eq('tenant_id', t).maybeSingle()) as Row | null;
      if (!r) return [];
      return [...new Set([domainOf(r.from_email), domainOf(r.reply_to), ...((r.notify_emails ?? []) as string[]).map(domainOf)].filter((d): d is string => !!d))];
    },
    async userEmail(u) {
      const r = check(await admin.from('users').select('email').eq('id', u).maybeSingle()) as Row | null;
      return r?.email ?? null;
    },
  };
}

/** Con la sesión de la persona (RLS). */
export function supabaseInboxUserDb(sb: SupabaseClient): InboxUserDb {
  return {
    async myToken(t) { return check(await sb.rpc('inbound_address_get', { p_tenant: t })) as string; },
    async rotate(t) { return check(await sb.rpc('inbound_address_rotate', { p_tenant: t })) as string; },
    async list(t, u, limit) {
      return ((check(await sb.from('inbound_email').select('*').eq('tenant_id', t).eq('user_id', u).order('received_at', { ascending: false }).limit(limit)) ?? []) as Row[]).map(toEmail);
    },
    async get(id) { const r = check(await sb.from('inbound_email').select('*').eq('id', id).maybeSingle()) as Row | null; return r ? toEmail(r) : null; },
    async update(id, p) {
      const patch: Row = {};
      if (p.status !== undefined) patch.status = p.status;
      if (p.accountId !== undefined) patch.account_id = p.accountId;
      if (p.activityId !== undefined) patch.activity_id = p.activityId;
      if (p.detail !== undefined) patch.detail = p.detail;
      return ((check(await sb.from('inbound_email').update(patch).eq('id', id).select('id')) ?? []) as Row[]).length > 0;
    },
  };
}
