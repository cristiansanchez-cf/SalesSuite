import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmDb } from './db';
import type { Contact, CrmImport } from './types';
import type { Activity } from './followup';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === '42501') throw new Error(`permission denied: ${res.error.message}`);
    throw new Error(`[supabase] ${res.error.message}`);
  }
  return res.data;
}
const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
const toContact = (r: Row): Contact => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, email: r.email, phone: r.phone, instagram: r.instagram, linkedin: r.linkedin, city: r.city, notes: r.notes,
  fields: r.fields ?? {}, tags: r.tags ?? [], ownerId: r.owner_id, importId: r.import_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toImport = (r: Row): CrmImport => ({
  id: r.id, tenantId: r.tenant_id, createdBy: r.created_by, fileName: r.file_name, target: r.target, headers: r.headers ?? [], rows: r.rows ?? [],
  mapping: r.mapping ?? {}, status: r.status, stats: r.stats ?? {}, createdAt: r.created_at, doneAt: r.done_at,
});
const toActivity = (r: Row): Activity => ({
  id: r.id, accountId: r.account_id, contactId: r.contact_id, userId: r.user_id, channel: r.channel, outcome: r.outcome, note: r.note, happenedAt: r.happened_at,
});
const contactRow = (t: string, c: Partial<Contact>) => ({
  tenant_id: t, name: c.name, email: c.email ?? null, phone: c.phone ?? null, instagram: c.instagram ?? null, linkedin: c.linkedin ?? null, city: c.city ?? null,
  notes: c.notes ?? null, fields: c.fields ?? {}, tags: c.tags ?? [], owner_id: c.ownerId ?? null, import_id: c.importId ?? null,
});
/** En bloques: PostgREST y el tamaño de las peticiones agradecen trozos de unos cientos. */
const chunks = <T,>(xs: T[], n = 300) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** PostgREST corta en 1000 filas por petición (db-max-rows): se pide por páginas hasta el límite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function paged(build: () => any, limit: number, page = 1000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < limit; from += page) {
    const part = (check(await build().range(from, Math.min(from + page, limit) - 1)) ?? []) as Row[];
    out.push(...part);
    if (part.length < Math.min(page, limit - from)) break;
  }
  return out;
}

export function supabaseCrmDb(sb: SupabaseClient): CrmDb {
  return {
    async listContacts(t, f) {
      const build = () => {
        let q = sb.from('crm_contact').select('*').eq('tenant_id', t);
        if (f.ids) q = q.in('id', f.ids.length ? f.ids : ['00000000-0000-0000-0000-000000000000']);
        if (f.tag) q = q.contains('tags', [f.tag]);
        if (f.q?.trim()) q = q.ilike('name', like(f.q.trim()));
        return q.order('name').order('id');
      };
      return (await paged(build, f.limit)).map(toContact);
    },
    async getContact(id) { const r = check(await sb.from('crm_contact').select('*').eq('id', id).maybeSingle()); return r ? toContact(r) : null; },
    async insertContacts(t, rows) {
      const ids: string[] = [];
      for (const part of chunks(rows)) ids.push(...(check(await sb.from('crm_contact').insert(part.map((c) => contactRow(t, c))).select('id')) ?? []).map((r: Row) => r.id));
      return ids;
    },
    async updateContact(id, p) {
      const patch: Row = {};
      for (const [k, col] of [['name', 'name'], ['email', 'email'], ['phone', 'phone'], ['instagram', 'instagram'], ['linkedin', 'linkedin'], ['city', 'city'], ['notes', 'notes'], ['fields', 'fields'], ['tags', 'tags'], ['ownerId', 'owner_id']] as const) {
        if ((p as Row)[k] !== undefined) patch[col] = (p as Row)[k];
      }
      return (check(await sb.from('crm_contact').update(patch).eq('id', id).select('id')) ?? []).length > 0;
    },
    async deleteContact(id) { return (check(await sb.from('crm_contact').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async listLinks(t, f) {
      const NONE = ['00000000-0000-0000-0000-000000000000'];
      // Muchos ids no caben en la URL: por trozos.
      const ids = f.contactIds ?? f.accountIds;
      const col = f.contactIds ? 'contact_id' : 'account_id';
      const groups = ids ? chunks(ids.length ? ids : NONE, 150) : [null];
      const out: Row[] = [];
      for (const g of groups) {
        out.push(...await paged(() => {
          let q = sb.from('crm_contact_account').select('contact_id, account_id, role').eq('tenant_id', t);
          if (g) q = q.in(col, g);
          if (f.contactIds && f.accountIds) q = q.in('account_id', f.accountIds.length ? f.accountIds : NONE);
          return q.order('contact_id').order('account_id');
        }, 20000));
      }
      return out.map((r: Row) => ({ contactId: r.contact_id, accountId: r.account_id, role: r.role }));
    },
    async saveLinks(t, links) {
      for (const part of chunks(links)) {
        check(await sb.from('crm_contact_account').upsert(part.map((l) => ({ tenant_id: t, contact_id: l.contactId, account_id: l.accountId, role: l.role })), { onConflict: 'contact_id,account_id' }));
      }
    },
    async removeLink(contactId, accountId) {
      return (check(await sb.from('crm_contact_account').delete().eq('contact_id', contactId).eq('account_id', accountId).select('contact_id')) ?? []).length > 0;
    },
    async listAccountLinks(t, accountId) {
      const rows = check(await sb.from('account_link').select('id, a_id, b_id, note, created_at, days, freq, role').eq('tenant_id', t)
        .or(`a_id.eq.${accountId},b_id.eq.${accountId}`).order('created_at').limit(500)) ?? [];
      return rows.map((r: Row) => ({ id: r.id, aId: r.a_id, bId: r.b_id, note: r.note, createdAt: r.created_at, days: r.days ?? [], freq: r.freq ?? null, role: r.role ?? null }));
    },
    async saveAccountLink(t, aId, bId, note, when) {
      const w = { ...(when?.days ? { days: when.days } : {}), ...(when && 'freq' in when ? { freq: when.freq ?? null } : {}), ...(when && 'role' in when ? { role: when.role ?? null } : {}) };
      // El índice único es por pareja sin orden (least/greatest): se busca la que haya y se actualiza, si no se crea.
      const prev = check(await sb.from('account_link').select('id').eq('tenant_id', t)
        .or(`and(a_id.eq.${aId},b_id.eq.${bId}),and(a_id.eq.${bId},b_id.eq.${aId})`).maybeSingle()) as Row | null;
      if (prev) { check(await sb.from('account_link').update({ ...(note !== undefined ? { note } : {}), ...w }).eq('id', prev.id)); return prev.id; }
      return (check(await sb.from('account_link').insert({ tenant_id: t, a_id: aId, b_id: bId, note: note ?? null, ...w }).select('id').single()) as Row).id;
    },
    async removeAccountLink(id) {
      return (check(await sb.from('account_link').delete().eq('id', id).select('id')) ?? []).length > 0;
    },
    async createImport(t, i) {
      return (check(await sb.from('crm_import').insert({ tenant_id: t, file_name: i.fileName, target: i.target, headers: i.headers, rows: i.rows, mapping: i.mapping }).select('id').single()) as Row).id;
    },
    async getImport(id) { const r = check(await sb.from('crm_import').select('*').eq('id', id).maybeSingle()); return r ? toImport(r) : null; },
    async listImports(t, limit) {
      return (check(await sb.from('crm_import').select('id, tenant_id, created_by, file_name, target, headers, mapping, status, stats, created_at, done_at').eq('tenant_id', t).order('created_at', { ascending: false }).limit(limit)) ?? [])
        .map((r: Row) => { const { rows: _rows, ...rest } = toImport({ ...r, rows: [] }); void _rows; return rest; });
    },
    async updateImport(id, p) {
      const patch: Row = {};
      if (p.mapping !== undefined) patch.mapping = p.mapping;
      if (p.status !== undefined) patch.status = p.status;
      if (p.stats !== undefined) patch.stats = p.stats;
      if (p.doneAt !== undefined) patch.done_at = p.doneAt;
      return (check(await sb.from('crm_import').update(patch).eq('id', id).select('id')) ?? []).length > 0;
    },
    async listActivities(t, accountIds, limit) {
      if (!accountIds.length) return [];
      const out: Row[] = [];
      for (const g of chunks(accountIds, 150)) {
        out.push(...await paged(() => sb.from('crm_activity').select('*').eq('tenant_id', t).in('account_id', g).order('happened_at', { ascending: false }).order('created_at', { ascending: false }).order('id'), limit));
      }
      return out.sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at))).slice(0, limit).map(toActivity);
    },
    async insertActivity(t, a) {
      const row: Row = { tenant_id: t, account_id: a.accountId, contact_id: a.contactId, channel: a.channel, outcome: a.outcome, note: a.note };
      if (a.happenedAt) row.happened_at = a.happenedAt;
      return (check(await sb.from('crm_activity').insert(row).select('id').single()) as Row).id;
    },
    async deleteActivity(id) { return (check(await sb.from('crm_activity').delete().eq('id', id).select('id')) ?? []).length > 0; },
    async deleteContactsByImport(importId) {
      return (check(await sb.from('crm_contact').delete().eq('import_id', importId).select('id')) ?? []).length;
    },
  };
}
