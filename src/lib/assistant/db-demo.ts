/** Estado del asistente en memoria (demo y pruebas). Replica supabase/migrations/20261224000000_wa_assistant.sql. */
import { demoDb } from '../data/store';
import { EMPTY, type AssistantDb, type Conversation, type HubSession } from './db';

const KEY = Symbol.for('salessuite.demoAssistant');
const SKEY = Symbol.for('salessuite.demoAssistantSessions');
type G = typeof globalThis & { [KEY]?: Map<string, Conversation>; [SKEY]?: Map<string, HubSession> };
const store = () => ((globalThis as G)[KEY] ??= new Map());
const sessions = () => ((globalThis as G)[SKEY] ??= new Map());
export function resetDemoAssistant() { store().clear(); sessions().clear(); }
const digitsOf = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '');

export function demoAssistantDb(): AssistantDb {
  return {
    async membersByPhone(digits) {
      if (!/^\d{9,15}$/.test(digits)) return [];
      return demoDb().users.flatMap((u) => {
        const d = digitsOf(u.phone);
        if (d.length < 9 || !(d === digits || (digits.length > d.length && digits.endsWith(d)))) return [];
        return u.memberships.filter((m) => ['admin', 'lead', 'rep'].includes(m.role)).map((m) => ({ tenantId: m.tenant_id, userId: u.id }));
      });
    },
    async get(t, u) { return structuredClone(store().get(`${t}|${u}`) ?? EMPTY); },
    async save(t, u, c, prev) {
      const cur = store().get(`${t}|${u}`);
      if ((cur?.version ?? 0) !== prev) return false;
      store().set(`${t}|${u}`, structuredClone({ ...c, seen: c.seen.slice(-40), version: prev + 1 }));
      return true;
    },
    async userLocale(u) { return demoDb().users.find((x) => x.id === u)?.locale ?? null; },
    async userProfile(u) {
      const x = demoDb().users.find((y) => y.id === u);
      return { name: x?.display_name || null, locale: x?.locale ?? null, timezone: x?.timezone ?? 'Europe/Madrid' };
    },
    async tenantNames(ids) { return Object.fromEntries(demoDb().tenant.filter((t) => ids.includes(t.id)).map((t) => [t.id, t.name])); },
    async session(u) { const s = sessions().get(u); return s ? structuredClone(s) : null; },
    async saveSession(u, s) { sessions().set(u, structuredClone({ ...s, pending: s.pending.slice(-10) })); },
  };
}
