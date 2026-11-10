import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY, type AssistantDb, type HubSession } from './db';
import type { State } from './flow';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const check = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(`[supabase] ${r.error.message}`); return r.data; };

/** Con la service role (solo el webhook). */
export function supabaseAssistantDb(sb: SupabaseClient): AssistantDb {
  return {
    async membersByPhone(digits) {
      return ((check(await sb.rpc('assistant_member_by_phone', { p_digits: digits })) ?? []) as Row[]).map((r) => ({ tenantId: r.tenant_id, userId: r.user_id }));
    },
    async get(t, u) {
      const r = check(await sb.from('wa_assistant_state').select('state, seen, version').eq('tenant_id', t).eq('user_id', u).maybeSingle()) as Row | null;
      return r ? { state: (r.state ?? { step: 'idle' }) as State, seen: r.seen ?? [], version: r.version ?? 0 } : structuredClone(EMPTY);
    },
    async save(t, u, c, prev) {
      const row = { state: c.state, seen: c.seen.slice(-40), version: prev + 1, updated_at: new Date().toISOString() };
      if (prev === 0) {
        const r = await sb.from('wa_assistant_state').insert({ tenant_id: t, user_id: u, ...row });
        if (!r.error) return true;
        if (!/duplicate|23505/.test(r.error.message + (r.error as { code?: string }).code)) throw new Error(`[supabase] ${r.error.message}`);
        return false;
      }
      const rows = check(await sb.from('wa_assistant_state').update(row).eq('tenant_id', t).eq('user_id', u).eq('version', prev).select('version')) as Row[];
      return rows.length > 0;
    },
    async userLocale(u) {
      const r = check(await sb.from('users').select('locale').eq('id', u).maybeSingle()) as Row | null;
      return r?.locale ?? null;
    },
    async userProfile(u) {
      const r = check(await sb.from('users').select('display_name, locale, timezone').eq('id', u).maybeSingle()) as Row | null;
      return { name: r?.display_name ?? null, locale: r?.locale ?? null, timezone: r?.timezone ?? 'Europe/Madrid' };
    },
    async tenantNames(ids) {
      if (!ids.length) return {};
      const rows = (check(await sb.from('tenant').select('id, name').in('id', ids)) ?? []) as Row[];
      return Object.fromEntries(rows.map((r) => [r.id as string, r.name as string]));
    },
    async session(u) {
      const r = check(await sb.from('wa_assistant_session').select('tenant_id, chosen_at, asked_at, pending').eq('user_id', u).maybeSingle()) as Row | null;
      return r ? { tenantId: r.tenant_id ?? null, chosenAt: r.chosen_at ?? null, askedAt: r.asked_at ?? null, pending: (r.pending ?? []) as HubSession['pending'] } : null;
    },
    async saveSession(u, s) {
      check(await sb.from('wa_assistant_session').upsert({ user_id: u, tenant_id: s.tenantId, chosen_at: s.chosenAt, asked_at: s.askedAt, pending: s.pending.slice(-10), updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    },
  };
}
