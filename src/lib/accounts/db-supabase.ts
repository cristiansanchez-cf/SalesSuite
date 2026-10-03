import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountsDb } from './db';
import { DEFAULT_RULES, type Account, type Eligibility, type TouchKind, type Zone, type ZoneKind } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    // Las reglas de Postgres llegan como «permission denied» para que el servicio las traduzca.
    if (res.error.code === '42501') throw new Error(`permission denied: ${res.error.message}`);
    throw new Error(`[supabase] ${res.error.message}`);
  }
  return res.data;
}
const ACCOUNT_COLS = 'id, tenant_id, name, zone_id, segment_id, address, external_ref, notes, status, blocked_reason, owner_id, claimed_until, last_touch_at, last_touch_by, won_at, won_by, won_dossier_id, created_by, created_at';
const toAccount = (r: Row): Account => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, zoneId: r.zone_id, segmentId: r.segment_id, address: r.address, externalRef: r.external_ref,
  notes: r.notes, status: r.status, blockedReason: r.blocked_reason, ownerId: r.owner_id, claimedUntil: r.claimed_until, lastTouchAt: r.last_touch_at,
  lastTouchBy: r.last_touch_by, wonAt: r.won_at, wonBy: r.won_by, wonDossierId: r.won_dossier_id, createdBy: r.created_by, createdAt: r.created_at,
});
const toZone = (r: Row): Zone => ({ id: r.id, tenantId: r.tenant_id, parentId: r.parent_id, name: r.name, kind: r.kind as ZoneKind, position: r.position });
/** Búsqueda por nombre sin comodines del usuario. */
const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export function supabaseAccountsDb(sb: SupabaseClient): AccountsDb {
  return {
    async listZones(t) { return (check(await sb.from('zone').select('*').eq('tenant_id', t)) ?? []).map(toZone); },
    async saveZone(t, z, id) {
      const row = { tenant_id: t, parent_id: z.parentId, name: z.name, kind: z.kind, position: z.position };
      if (id) {
        const rows = check(await sb.from('zone').update(row).eq('id', id).select('id')) ?? [];
        if (!rows.length) throw new Error('permission denied: zona');
        return id;
      }
      return (check(await sb.from('zone').insert(row).select('id').single()) as Row).id;
    },
    async deleteZone(id) { return (check(await sb.from('zone').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async listAssignments(t) {
      return (check(await sb.from('membership_zone').select('user_id, zone_id').eq('tenant_id', t)) ?? []).map((r: Row) => ({ userId: r.user_id, zoneId: r.zone_id }));
    },
    async setAssignments(t, userId, zoneIds) {
      check(await sb.from('membership_zone').delete().eq('tenant_id', t).eq('user_id', userId));
      if (zoneIds.length) check(await sb.from('membership_zone').insert(zoneIds.map((zone_id) => ({ tenant_id: t, user_id: userId, zone_id }))));
    },
    async getRules(t) {
      const r = check(await sb.from('account_rules').select('*').eq('tenant_id', t).maybeSingle()) as Row | null;
      return r ? { claimDays: r.claim_days, strictZones: r.strict_zones, requireAccount: r.require_account } : DEFAULT_RULES;
    },
    async saveRules(t, r) {
      check(await sb.from('account_rules').upsert({ tenant_id: t, claim_days: r.claimDays, strict_zones: r.strictZones, require_account: r.requireAccount, updated_at: new Date().toISOString() }));
    },
    async listAccounts(t, f) {
      let q = sb.from('account').select(ACCOUNT_COLS).eq('tenant_id', t);
      if (f.ids) q = q.in('id', f.ids.length ? f.ids : ['00000000-0000-0000-0000-000000000000']);
      if (f.zoneIds) q = q.in('zone_id', f.zoneIds.length ? f.zoneIds : ['00000000-0000-0000-0000-000000000000']);
      if (f.ownerId) q = q.eq('owner_id', f.ownerId);
      if (f.status) q = q.eq('status', f.status);
      if (f.q?.trim()) q = q.ilike('name', like(f.q.trim()));
      return (check(await q.order('name').limit(f.limit)) ?? []).map(toAccount);
    },
    async getAccount(id) {
      const r = check(await sb.from('account').select(ACCOUNT_COLS).eq('id', id).maybeSingle());
      return r ? toAccount(r) : null;
    },
    async insertAccount(t, a) {
      const r = check(await sb.from('account').insert({
        tenant_id: t, name: a.name, zone_id: a.zoneId, segment_id: a.segmentId, address: a.address, external_ref: a.externalRef, notes: a.notes,
        owner_id: a.ownerId ?? null,
      }).select('id').single()) as Row;
      return r.id;
    },
    async updateAccount(id, p) {
      const patch: Row = {};
      if (p.name !== undefined) patch.name = p.name;
      if (p.zoneId !== undefined) patch.zone_id = p.zoneId;
      if (p.segmentId !== undefined) patch.segment_id = p.segmentId;
      if (p.address !== undefined) patch.address = p.address;
      if (p.externalRef !== undefined) patch.external_ref = p.externalRef;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.status !== undefined) patch.status = p.status;
      if (p.blockedReason !== undefined) patch.blocked_reason = p.blockedReason;
      if (p.ownerId !== undefined) patch.owner_id = p.ownerId;
      if (p.claimedUntil !== undefined) patch.claimed_until = p.claimedUntil;
      return (check(await sb.from('account').update(patch).eq('id', id).select('id')) ?? []).length > 0;
    },
    async deleteAccount(id) { return (check(await sb.from('account').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async touch(id, kind, note) {
      return check(await sb.rpc('account_touch', { p_account: id, p_kind: kind, p_note: note })) as Eligibility;
    },
    async listTouches(accountId, limit) {
      return (check(await sb.from('account_touch').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(limit)) ?? [])
        .map((r: Row) => ({ id: r.id, accountId: r.account_id, userId: r.user_id, kind: r.kind as TouchKind, note: r.note, createdAt: r.created_at }));
    },
    async preview(accountId) { return check(await sb.rpc('account_eligibility_preview', { p_account: accountId })) as Eligibility; },
    async decide(dossierId, decision) {
      return (check(await sb.from('dossier').update({ account_decision: decision }).eq('id', dossierId).select('id')) ?? []).length > 0;
    },
  };
}
