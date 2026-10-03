/**
 * Avisos en memoria (modo DEMO). `demoEmit*` replican los triggers de
 * supabase/migrations/20261011000000_notifications.sql: mismas reglas, mismos datos.
 */
import { randomUUID } from 'node:crypto';
import { demoDb, type NotificationRow, type Role } from '../data/store';
import type { NotifyDb, NotifyJobDb } from './db';
import type { Notification } from './types';

const db = () => demoDb();
const toN = (r: NotificationRow): Notification => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, kind: r.kind, severity: r.severity, entityKey: r.entity_key, params: structuredClone(r.params),
  createdAt: r.created_at, readAt: r.read_at, dismissedAt: r.dismissed_at, emailedAt: r.emailed_at, resolvedAt: r.resolved_at,
});
const now = () => new Date().toISOString();

// ---------------------------------------------------------------- emisión (= triggers)
export function userLabel(id: string | null | undefined): string | null {
  const u = db().users.find((x) => x.id === id);
  return u ? (u.display_name || u.email) : null;
}
export function notifyRoles(tenantId: string, roles: Role[], kind: string, severity: 'action' | 'info', entity: string, params: Record<string, unknown>, except: string | null) {
  const s = db();
  for (const u of s.users) {
    const m = u.memberships.find((x) => x.tenant_id === tenantId);
    if (!m || !roles.includes(m.role) || u.id === except) continue;
    if (s.notification.some((n) => n.user_id === u.id && n.tenant_id === tenantId && n.kind === kind && n.entity_key === entity)) continue;
    s.notification.push({ id: randomUUID(), tenant_id: tenantId, user_id: u.id, kind, severity, entity_key: entity, params, created_at: now(),
      read_at: null, dismissed_at: null, emailed_at: null, resolved_at: null });
  }
}
export function resolveNotifications(tenantId: string, kind: string, entity: string) {
  for (const n of db().notification) if (n.tenant_id === tenantId && n.kind === kind && n.entity_key === entity && !n.resolved_at) n.resolved_at = now();
}

export function demoEmitContribution(op: 'insert' | 'update' | 'delete', c: { id: string; tenant_id: string; status: string; title: string; type: string; author_id: string }, oldStatus?: string) {
  if (op === 'insert' && c.status === 'pending') {
    notifyRoles(c.tenant_id, ['admin', 'lead'], 'contribution_pending', 'action', c.id, { title: c.title, type: c.type, author: userLabel(c.author_id) }, c.author_id);
  } else if (op === 'update' && oldStatus === 'pending' && c.status !== 'pending') {
    resolveNotifications(c.tenant_id, 'contribution_pending', c.id);
  } else if (op === 'delete' && c.status === 'pending') {
    resolveNotifications(c.tenant_id, 'contribution_pending', c.id);
  }
}

export function demoEmitMembership(tenantId: string, userId: string, role: Role, invitedBy: string | null | undefined) {
  if (!invitedBy) return;
  const inviterRole = db().users.find((u) => u.id === invitedBy)?.memberships.find((m) => m.tenant_id === tenantId)?.role;
  if (inviterRole === 'partner') {
    notifyRoles(tenantId, ['admin'], 'partner_referred', 'action', userId, { name: userLabel(userId), inviter: userLabel(invitedBy), inviterId: invitedBy }, invitedBy);
  } else if (inviterRole === 'lead') {
    notifyRoles(tenantId, ['admin'], 'member_added', 'info', userId, { name: userLabel(userId), role, inviter: userLabel(invitedBy) }, invitedBy);
  }
}

export function demoEmitStory(w: { id: string; tenant_id: string; status: string; title: string; outcome: string; author_id: string | null }) {
  if (w.status !== 'shared') return;
  notifyRoles(w.tenant_id, ['admin', 'lead'], 'story_shared', 'info', w.id, { title: w.title, outcome: w.outcome, author: userLabel(w.author_id) }, w.author_id);
}

// ---------------------------------------------------------------- lectura de cada persona
export function demoNotifyDb(): NotifyDb {
  const mine = (t: string, u: string) => db().notification.filter((n) => n.tenant_id === t && n.user_id === u);
  return {
    async list(t, u, { limit }) {
      return mine(t, u).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(toN);
    },
    async markRead(t, u, ids) {
      const at = now();
      for (const n of mine(t, u)) if (!n.read_at && (!ids || ids.includes(n.id))) n.read_at = at;
    },
    async dismiss(t, u, id) {
      const n = mine(t, u).find((x) => x.id === id);
      if (!n) return false;
      n.dismissed_at ??= now();
      n.read_at ??= n.dismissed_at;
      return true;
    },
    async getEmailPref(u) { return db().users.find((x) => x.id === u)?.notify_email ?? true; },
    async setEmailPref(u, on) { const x = db().users.find((y) => y.id === u); if (x) x.notify_email = on; },
    async getLocale(u) { return db().users.find((x) => x.id === u)?.locale ?? null; },
    async setLocale(u, l) { const x = db().users.find((y) => y.id === u); if (x) x.locale = l ?? undefined; },
  };
}

// ---------------------------------------------------------------- envío (cron)
export function demoNotifyJobDb(): NotifyJobDb {
  return {
    async unsent(before) {
      return db().notification.filter((n) => n.severity === 'action' && !n.emailed_at && n.created_at <= before).map(toN);
    },
    async forDigest(userIds, since) {
      return db().notification.filter((n) => userIds.includes(n.user_id) && !n.dismissed_at && (n.created_at >= since || !n.resolved_at)).map(toN);
    },
    async recipients(ids) {
      return db().users.filter((u) => ids.includes(u.id)).map((u) => ({
        userId: u.id, email: u.email, name: u.display_name || null, notifyEmail: u.notify_email ?? true, digestSentAt: u.digest_sent_at ?? null, locale: u.locale ?? null,
      }));
    },
    async digestDue(before) {
      const s = db();
      const withNotes = new Set(s.notification.filter((n) => !n.dismissed_at).map((n) => n.user_id));
      return s.users.filter((u) => withNotes.has(u.id) && (!u.digest_sent_at || u.digest_sent_at < before)).map((u) => u.id);
    },
    async tenants(ids) {
      const s = db();
      return s.tenant.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, name: t.name, hostname: s.domain.find((d) => d.tenant_id === t.id && d.is_primary)?.hostname ?? null }));
    },
    async markEmailed(ids, at) { for (const n of db().notification) if (ids.includes(n.id)) n.emailed_at ??= at; },
    async markDigest(userId, at) { const u = db().users.find((x) => x.id === userId); if (u) u.digest_sent_at = at; },
  };
}
