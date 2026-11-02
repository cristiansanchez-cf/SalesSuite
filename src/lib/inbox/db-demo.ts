/** Correos al CRM en memoria (modo DEMO). Replica supabase/migrations/20261221000000_inbound_email.sql. */
import { randomUUID } from 'node:crypto';
import { demoDb, demoRoleOf } from '../data/store';
import { demoLeadsStore } from '../leads/db-demo';
import type { InboundEmail, InboxServerDb, InboxUserDb } from './db';

interface Store { addresses: Array<{ token: string; tenantId: string; userId: string }>; emails: InboundEmail[] }
type G = typeof globalThis & { __demoInbox?: Store };
export function demoInboxStore(): Store { return ((globalThis as G).__demoInbox ??= { addresses: [], emails: [] }); }
export function resetDemoInbox(): void { delete (globalThis as G).__demoInbox; }
const newToken = () => randomUUID().replace(/-/g, '').slice(0, 24);
const domainOf = (e: string | null | undefined) => (e && e.includes('@') ? e.split('@')[1]!.toLowerCase() : null);

export function demoInboxServerDb(): InboxServerDb {
  const s = demoInboxStore();
  return {
    async address(token) { const a = s.addresses.find((x) => x.token === token); return a ? { tenantId: a.tenantId, userId: a.userId } : null; },
    async seen(t, u, m) { return s.emails.some((e) => e.tenantId === t && e.userId === u && e.messageId === m); },
    async record(x) {
      if (s.emails.some((e) => e.tenantId === x.tenantId && e.userId === x.userId && e.messageId === x.messageId)) return '';
      const id = randomUUID();
      s.emails.push({ ...structuredClone(x), id, createdAt: new Date().toISOString() });
      return id;
    },
    async internalDomains(t) {
      const st = demoLeadsStore().settings.find((x) => x.tenantId === t);
      return st ? [...new Set([domainOf(st.fromEmail), domainOf(st.replyTo), ...st.notifyEmails.map(domainOf)].filter((d): d is string => !!d))] : [];
    },
    async userEmail(u) { return demoDb().users.find((x) => x.id === u)?.email ?? null; },
  };
}

/** Con «sesión» de actorId (como la RLS). */
export function demoInboxUserDb(actorId: string): InboxUserDb {
  const s = demoInboxStore();
  const member = (t: string) => ['admin', 'lead', 'rep'].includes(demoRoleOf(t, actorId) ?? '') && demoDb().users.some((u) => u.id === actorId && u.memberships.some((m) => m.tenant_id === t));
  return {
    async myToken(t) {
      if (!member(t)) throw new Error('permission denied: Sin permiso para esta operación');
      let a = s.addresses.find((x) => x.tenantId === t && x.userId === actorId);
      if (!a) { a = { token: newToken(), tenantId: t, userId: actorId }; s.addresses.push(a); }
      return a.token;
    },
    async rotate(t) {
      if (!member(t)) throw new Error('permission denied: Sin permiso para esta operación');
      s.addresses = s.addresses.filter((x) => !(x.tenantId === t && x.userId === actorId));
      const a = { token: newToken(), tenantId: t, userId: actorId };
      s.addresses.push(a);
      return a.token;
    },
    async list(t, u, limit) {
      return s.emails.filter((e) => e.tenantId === t && e.userId === u && (u === actorId || ['admin', 'lead'].includes(demoRoleOf(t, actorId) ?? '')))
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit).map((e) => structuredClone(e));
    },
    async get(id) { const e = s.emails.find((x) => x.id === id && (x.userId === actorId || ['admin', 'lead'].includes(demoRoleOf(x.tenantId, actorId) ?? ''))); return e ? structuredClone(e) : null; },
    async update(id, p) {
      const e = s.emails.find((x) => x.id === id && x.userId === actorId);
      if (!e) return false;
      Object.assign(e, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
      return true;
    },
  };
}
