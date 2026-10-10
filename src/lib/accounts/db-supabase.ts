import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountInsert, AccountsDb } from './db';
import type { CrmField, FieldType } from '../crm/fields';
import { paged } from '../crm/db-supabase';
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
const ACCOUNT_COLS = 'id, tenant_id, name, zone_id, segment_id, address, external_ref, notes, status, blocked_reason, owner_id, claimed_until, last_touch_at, last_touch_by, won_at, won_by, won_dossier_id, created_by, created_at, fields, parent_id, tags, import_id, phone, email, instagram, facebook, linkedin, website, maps_url, next_step, next_step_at, next_contact_id, next_channel, qualification, place_id, hours, lat, lng, place_status, place_at, place_rating, place_reviews, place_photo, place_filled, ai_research_at';
const toAccount = (r: Row): Account => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, zoneId: r.zone_id, segmentId: r.segment_id, address: r.address, externalRef: r.external_ref,
  notes: r.notes, status: r.status, blockedReason: r.blocked_reason, ownerId: r.owner_id, claimedUntil: r.claimed_until, lastTouchAt: r.last_touch_at,
  lastTouchBy: r.last_touch_by, wonAt: r.won_at, wonBy: r.won_by, wonDossierId: r.won_dossier_id, createdBy: r.created_by, createdAt: r.created_at,
  fields: r.fields ?? {}, parentId: r.parent_id ?? null, tags: r.tags ?? [], importId: r.import_id ?? null,
  phone: r.phone ?? null, email: r.email ?? null, instagram: r.instagram ?? null, facebook: r.facebook ?? null, linkedin: r.linkedin ?? null, website: r.website ?? null, mapsUrl: r.maps_url ?? null,
  nextStep: r.next_step ?? null, nextStepAt: r.next_step_at ?? null, nextContactId: r.next_contact_id ?? null, nextChannel: r.next_channel ?? null,
  qualification: r.qualification ?? {},
  placeId: r.place_id ?? null, hours: r.hours ?? null, lat: r.lat ?? null, lng: r.lng ?? null, placeStatus: r.place_status ?? null, placeAt: r.place_at ?? null,
  placeRating: r.place_rating == null ? null : Number(r.place_rating), placeReviews: r.place_reviews ?? null, placePhoto: r.place_photo ?? null, placeFilled: (r.place_filled ?? null) as Record<string, string> | null,
  aiResearchAt: r.ai_research_at ?? null,
});
const CONTACT_COLS = { phone: 'phone', email: 'email', instagram: 'instagram', facebook: 'facebook', linkedin: 'linkedin', website: 'website', mapsUrl: 'maps_url' } as const;
const contactRow = (c: AccountInsert['contact']) => Object.fromEntries(Object.entries(CONTACT_COLS).filter(([k]) => c?.[k as keyof typeof CONTACT_COLS] !== undefined).map(([k, col]) => [col, c![k as keyof typeof CONTACT_COLS]]));
const toField = (r: Row): CrmField => ({
  id: r.id, tenantId: r.tenant_id, key: r.key, label: r.label, type: r.type as FieldType, options: r.options ?? [], group: r.grp, position: r.position,
  help: r.help, required: r.required, inList: r.in_list, filterable: r.filterable, segments: r.segments ?? [], archivedAt: r.archived_at,
  target: r.target ?? 'account', tags: r.tags ?? [], isStage: r.is_stage ?? false,
});
const accountRow = (t: string, a: AccountInsert) => ({
  tenant_id: t, name: a.name, zone_id: a.zoneId, segment_id: a.segmentId, address: a.address, external_ref: a.externalRef, notes: a.notes,
  owner_id: a.ownerId ?? null, fields: a.fields ?? {}, parent_id: a.parentId ?? null, tags: a.tags ?? [], import_id: a.importId ?? null,
  ...contactRow(a.contact),
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
    async insertZones(t, rows) {
      if (!rows.length) return [];
      return (check(await sb.from('zone').insert(rows.map((z) => ({ tenant_id: t, parent_id: z.parentId, name: z.name, kind: z.kind, position: z.position }))).select('id')) ?? []).map((r: Row) => r.id);
    },
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
      return (await paged(() => {
        let q = sb.from('account').select(ACCOUNT_COLS).eq('tenant_id', t);
        if (f.ids) q = q.in('id', f.ids.length ? f.ids : ['00000000-0000-0000-0000-000000000000']);
        if (f.zoneIds) q = q.in('zone_id', f.zoneIds.length ? f.zoneIds : ['00000000-0000-0000-0000-000000000000']);
        if (f.noZone) q = q.is('zone_id', null);
        if (f.ownerId) q = q.eq('owner_id', f.ownerId);
        if (f.status) q = q.eq('status', f.status);
        if (f.parentId) q = q.eq('parent_id', f.parentId);
        if (f.tag) q = q.contains('tags', [f.tag]);
        if (f.q?.trim()) q = q.ilike('name', like(f.q.trim()));
        return q.order('name').order('id');
      }, f.limit)).map(toAccount);
    },
    async getAccount(id) {
      const r = check(await sb.from('account').select(ACCOUNT_COLS).eq('id', id).maybeSingle());
      return r ? toAccount(r) : null;
    },
    async insertAccount(t, a) {
      const r = check(await sb.from('account').insert(accountRow(t, a)).select('id').single()) as Row;
      return r.id;
    },
    async insertAccounts(t, rows) {
      const ids: string[] = [];
      for (let i = 0; i < rows.length; i += 300) {
        ids.push(...(check(await sb.from('account').insert(rows.slice(i, i + 300).map((a) => accountRow(t, a))).select('id')) ?? []).map((r: Row) => r.id));
      }
      return ids;
    },
    async deleteAccountsByImport(importId) {
      return (check(await sb.from('account').delete().eq('import_id', importId).select('id')) ?? []).length;
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
      if (p.fields !== undefined) patch.fields = p.fields;
      if (p.parentId !== undefined) patch.parent_id = p.parentId;
      if (p.tags !== undefined) patch.tags = p.tags;
      Object.assign(patch, contactRow(p.contact));
      if (p.next !== undefined) Object.assign(patch, { next_step: p.next.step, next_step_at: p.next.at, next_contact_id: p.next.contactId, next_channel: p.next.channel });
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
    async listFields(t) {
      return (check(await sb.from('crm_field').select('*').eq('tenant_id', t).order('position').order('label')) ?? []).map(toField);
    },
    async saveField(t, f, id) {
      const row = { tenant_id: t, key: f.key, label: f.label, type: f.type, options: f.options, grp: f.group, position: f.position, help: f.help,
        required: f.required, in_list: f.inList, filterable: f.filterable, segments: f.segments,
        target: f.target, tags: f.tags, is_stage: f.isStage };
      if (id) {
        const rows = check(await sb.from('crm_field').update(row).eq('id', id).select('id')) ?? [];
        if (!rows.length) throw new Error('permission denied: Solo un admin del espacio');
        return id;
      }
      return (check(await sb.from('crm_field').insert(row).select('id').single()) as Row).id;
    },
    async deleteField(id) {
      return (check(await sb.from('crm_field').delete().eq('id', id).select('id')) ?? []).length > 0;
    },
    async qualify(id, q) { check(await sb.rpc('account_qualify', { p_account: id, p_qualification: q })); },
    async research(id, d) { check(await sb.rpc('account_research', { p_account: id, p_data: d })); },
    async saveAiResearch(id, d, fill) { check(await sb.rpc('account_ai_research', { p_account: id, p_data: d, p_fill: fill ?? null })); },
    async getAiResearch(id) {
      const r = check(await sb.from('account').select('ai_research').eq('id', id).maybeSingle()) as Row | null;
      return r?.ai_research ?? null;
    },
    async moveAccounts(t, moves) {
      const rows = moves.map((m) => ({ id: m.id, zone: m.zoneId, notes: m.notes, tags: m.tags }));
      return (check(await sb.rpc('crm_move_accounts', { p_tenant: t, p_moves: rows })) as number) ?? 0;
    },
    async saveFix(t, f) { return (check(await sb.from('crm_fix').insert({ tenant_id: t, kind: f.kind, summary: f.summary, undo: f.undo }).select('id').single()) as Row).id; },
    async listFixes(t, kind) {
      return ((check(await sb.from('crm_fix').select('id, kind, summary, undo, created_at, undone_at').eq('tenant_id', t).eq('kind', kind).order('created_at', { ascending: false }).limit(20)) ?? []) as Row[])
        .map((r) => ({ id: r.id, kind: r.kind, summary: r.summary ?? {}, undo: r.undo ?? {}, createdAt: r.created_at, undoneAt: r.undone_at ?? null }));
    },
    async markFixUndone(id) {
      return (check(await sb.from('crm_fix').update({ undone_at: new Date().toISOString() }).eq('id', id).is('undone_at', null).select('id')) ?? []).length > 0;
    },
    async getPriorityWeights(t) {
      const r = check(await sb.from('crm_settings').select('priority_weights').eq('tenant_id', t).maybeSingle()) as Row | null;
      return r?.priority_weights ?? null;
    },
    async savePriorityWeights(t, w) {
      check(await sb.from('crm_settings').upsert({ tenant_id: t, priority_weights: w, updated_at: new Date().toISOString() }));
    },
    async archiveField(id, archived) {
      return (check(await sb.from('crm_field').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select('id')) ?? []).length > 0;
    },
    async decide(dossierId, decision) {
      return (check(await sb.from('dossier').update({ account_decision: decision }).eq('id', dossierId).select('id')) ?? []).length > 0;
    },
  };
}
