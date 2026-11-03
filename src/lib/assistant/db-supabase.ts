import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY, type AssistantDb } from './db';
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
  };
}
