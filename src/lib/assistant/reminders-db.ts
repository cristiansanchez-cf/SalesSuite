/** Quién recibe los recordatorios por WhatsApp y el registro de envíos: Supabase (service role) o memoria (demo). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoDb } from '../data/store';
import type { ReminderDb, ReminderMember } from './reminders';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const check = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(`[supabase] ${r.error.message}`); return r.data; };
const TEAM = ['admin', 'lead', 'rep'];

export function supabaseReminderDb(sb: SupabaseClient): ReminderDb {
  return {
    async members() {
      const users = (check(await sb.from('users').select('id, display_name, phone, locale, timezone').eq('wa_reminders', true).not('phone', 'is', null).limit(5000)) ?? []) as Row[];
      if (!users.length) return [];
      const byId = new Map(users.map((u) => [u.id as string, u]));
      const ms = (check(await sb.from('membership').select('user_id, tenant_id, role').in('user_id', [...byId.keys()]).in('role', TEAM)) ?? []) as Row[];
      return ms.map((m): ReminderMember => {
        const u = byId.get(m.user_id)!;
        return { tenantId: m.tenant_id, userId: m.user_id, phone: u.phone, name: u.display_name ?? null, locale: u.locale ?? null, timezone: u.timezone ?? 'Europe/Madrid' };
      });
    },
    async logged(days) {
      if (!days.length) return new Set();
      const rows = (check(await sb.from('wa_reminder_log').select('user_id, tenant_id, day').in('day', days)) ?? []) as Row[];
      return new Set(rows.map((r) => `${r.user_id}|${r.tenant_id}|${r.day}`));
    },
    async sentUsers(days) {
      if (!days.length) return new Set();
      const rows = (check(await sb.from('wa_reminder_log').select('user_id, day').in('day', days).gt('items', 0)) ?? []) as Row[];
      return new Set(rows.map((r) => `${r.user_id}|${r.day}`));
    },
    async mark(userId, tenantId, day, items) {
      check(await sb.from('wa_reminder_log').upsert({ user_id: userId, tenant_id: tenantId, day, items }, { onConflict: 'user_id,tenant_id,day', ignoreDuplicates: true }));
    },
  };
}

const LOG_KEY = Symbol.for('salessuite.demoReminders');
type G = typeof globalThis & { [LOG_KEY]?: Map<string, number> };
export const demoReminderLog = () => ((globalThis as G)[LOG_KEY] ??= new Map());
export function demoReminderDb(): ReminderDb {
  return {
    async members() {
      return demoDb().users.filter((u) => u.wa_reminders && u.phone).flatMap((u) => u.memberships.filter((m) => TEAM.includes(m.role))
        .map((m): ReminderMember => ({ tenantId: m.tenant_id, userId: u.id, phone: u.phone!, name: u.display_name || null, locale: u.locale ?? null, timezone: u.timezone ?? 'Europe/Madrid' })));
    },
    async logged(days) { return new Set([...demoReminderLog().keys()].filter((k) => days.includes(k.split('|')[2]))); },
    async sentUsers(days) { return new Set([...demoReminderLog()].filter(([k, n]) => n > 0 && days.includes(k.split('|')[2])).map(([k]) => { const [u, , day] = k.split('|'); return `${u}|${day}`; })); },
    async mark(userId, tenantId, day, items) { const k = `${userId}|${tenantId}|${day}`; if (!demoReminderLog().has(k)) demoReminderLog().set(k, items); },
  };
}
