/** Personas e importaciones en memoria (modo DEMO). Replica supabase/migrations/20261103000000_crm_people.sql (RLS y triggers). */
import { randomUUID } from 'node:crypto';
import { checkFields } from '../accounts/db-demo';
import { demoDb, type CrmContactRow, type CrmImportRow } from '../data/store';
import type { CrmDb } from './db';
import type { Contact, CrmImport, ImportMapping } from './types';
import type { Activity } from './followup';

const db = () => demoDb();
const iso = () => new Date().toISOString();
/** Dos interacciones en el mismo milisegundo no deben empatar (en Postgres, now() lleva microsegundos). */
let lastAt = 0;
const monotonic = () => { lastAt = Math.max(Date.now(), lastAt + 1); return new Date(lastAt).toISOString(); };
const roleOf = (t: string, u: string) => db().users.find((x) => x.id === u)?.memberships.find((m) => m.tenant_id === t)?.role ?? null;
const isMember = (t: string, u: string) => !!roleOf(t, u);
const isManager = (t: string, u: string) => ['admin', 'lead'].includes(roleOf(t, u) ?? '');

const toContact = (r: CrmContactRow): Contact => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, email: r.email, phone: r.phone, instagram: r.instagram, linkedin: r.linkedin, city: r.city, notes: r.notes,
  fields: r.fields as Contact['fields'], tags: r.tags, ownerId: r.owner_id, importId: r.import_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toImport = (r: CrmImportRow): CrmImport => ({
  id: r.id, tenantId: r.tenant_id, createdBy: r.created_by, fileName: r.file_name, target: r.target, headers: r.headers, rows: r.rows,
  mapping: r.mapping as unknown as ImportMapping, status: r.status, stats: r.stats, createdAt: r.created_at, doneAt: r.done_at,
});

export function demoCrmDb(actorId: string): CrmDb {
  const canEdit = (c: CrmContactRow) => isManager(c.tenant_id, actorId) || c.owner_id === actorId || c.created_by === actorId || c.owner_id === null;
  return {
    async listContacts(t, f) {
      if (!isMember(t, actorId)) return [];
      const q = f.q?.trim().toLowerCase();
      return db().crm_contact
        .filter((c) => c.tenant_id === t && (!f.ids || f.ids.includes(c.id)) && (!f.tag || c.tags.includes(f.tag)) && (!q || c.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, f.limit).map(toContact);
    },
    async getContact(id) {
      const c = db().crm_contact.find((x) => x.id === id);
      return c && isMember(c.tenant_id, actorId) ? toContact(c) : null;
    },
    async insertContacts(t, rows) {
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_contact');
      const s = db();
      const out = rows.map((c) => {
        const row: CrmContactRow = {
          id: randomUUID(), tenant_id: t, name: c.name, email: c.email ?? null, phone: c.phone ?? null, instagram: c.instagram ?? null, linkedin: c.linkedin ?? null,
          city: c.city ?? null, notes: c.notes ?? null, fields: checkFields(t, c.fields ?? {}, 'contact'), tags: c.tags ?? [], owner_id: c.ownerId ?? null,
          import_id: c.importId ?? null, created_by: actorId, created_at: iso(), updated_at: iso(),
        };
        return row;
      });
      s.crm_contact.push(...out);
      return out.map((r) => r.id);
    },
    async updateContact(id, p) {
      const c = db().crm_contact.find((x) => x.id === id);
      if (!c || !canEdit(c)) return false;
      if (p.fields !== undefined) c.fields = checkFields(c.tenant_id, p.fields, 'contact');
      if (p.name !== undefined) c.name = p.name;
      if (p.email !== undefined) c.email = p.email;
      if (p.phone !== undefined) c.phone = p.phone;
      if (p.instagram !== undefined) c.instagram = p.instagram;
      if (p.linkedin !== undefined) c.linkedin = p.linkedin;
      if (p.city !== undefined) c.city = p.city;
      if (p.notes !== undefined) c.notes = p.notes;
      if (p.tags !== undefined) c.tags = p.tags;
      if (p.ownerId !== undefined) c.owner_id = p.ownerId;
      c.updated_at = iso();
      return true;
    },
    async deleteContact(id) {
      const s = db();
      const c = s.crm_contact.find((x) => x.id === id);
      if (!c || !isManager(c.tenant_id, actorId)) return false;
      s.crm_contact = s.crm_contact.filter((x) => x.id !== id);
      s.crm_contact_account = s.crm_contact_account.filter((l) => l.contact_id !== id);
      for (const a of s.crm_activity) if (a.contact_id === id) a.contact_id = null;
      for (const a of s.account) if (a.next_contact_id === id) a.next_contact_id = null;
      return true;
    },
    async listLinks(t, f) {
      if (!isMember(t, actorId)) return [];
      return db().crm_contact_account
        .filter((l) => l.tenant_id === t && (!f.contactIds || f.contactIds.includes(l.contact_id)) && (!f.accountIds || f.accountIds.includes(l.account_id)))
        .map((l) => ({ contactId: l.contact_id, accountId: l.account_id, role: l.role }));
    },
    async saveLinks(t, links) {
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_contact_account');
      const s = db();
      for (const l of links) {
        if (!s.crm_contact.some((c) => c.id === l.contactId && c.tenant_id === t) || !s.account.some((a) => a.id === l.accountId && a.tenant_id === t)) {
          throw new Error('violates foreign key: crm_contact_account');
        }
        const prev = s.crm_contact_account.find((x) => x.contact_id === l.contactId && x.account_id === l.accountId);
        if (prev) prev.role = l.role;
        else s.crm_contact_account.push({ tenant_id: t, contact_id: l.contactId, account_id: l.accountId, role: l.role, created_at: iso() });
      }
    },
    async removeLink(contactId, accountId) {
      const s = db();
      const l = s.crm_contact_account.find((x) => x.contact_id === contactId && x.account_id === accountId);
      if (!l || !isMember(l.tenant_id, actorId)) return false;
      s.crm_contact_account = s.crm_contact_account.filter((x) => x !== l);
      return true;
    },
    async createImport(t, i) {
      if (!isManager(t, actorId)) throw new Error('permission denied: crm_import');
      const row: CrmImportRow = { id: randomUUID(), tenant_id: t, created_by: actorId, file_name: i.fileName, target: i.target, headers: i.headers, rows: i.rows,
        mapping: i.mapping as unknown as Record<string, unknown>, status: 'draft', stats: {}, created_at: iso(), done_at: null };
      db().crm_import.push(row);
      return row.id;
    },
    async getImport(id) {
      const r = db().crm_import.find((x) => x.id === id);
      return r && isManager(r.tenant_id, actorId) ? toImport(r) : null;
    },
    async listImports(t, limit) {
      if (!isManager(t, actorId)) return [];
      return db().crm_import.filter((x) => x.tenant_id === t).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
        .map((r) => { const { rows: _r, ...rest } = toImport(r); void _r; return rest; });
    },
    async updateImport(id, p) {
      const r = db().crm_import.find((x) => x.id === id);
      if (!r || !isManager(r.tenant_id, actorId)) return false;
      if (p.mapping !== undefined) r.mapping = p.mapping as unknown as Record<string, unknown>;
      if (p.status !== undefined) r.status = p.status;
      if (p.stats !== undefined) r.stats = p.stats as Record<string, unknown>;
      if (p.doneAt !== undefined) r.done_at = p.doneAt;
      return true;
    },
    async listActivities(t, accountIds, limit) {
      if (!isMember(t, actorId)) return [];
      return db().crm_activity.filter((a) => a.tenant_id === t && accountIds.includes(a.account_id))
        .sort((a, b) => b.happened_at.localeCompare(a.happened_at)).slice(0, limit)
        .map((r) => ({ id: r.id, accountId: r.account_id, contactId: r.contact_id, userId: r.user_id, channel: r.channel as Activity['channel'], outcome: r.outcome as Activity['outcome'], note: r.note, happenedAt: r.happened_at }));
    },
    async insertActivity(t, a) {
      const s = db();
      if (!isMember(t, actorId)) throw new Error('permission denied: crm_activity');
      if (!s.account.some((x) => x.id === a.accountId && x.tenant_id === t)) throw new Error('violates foreign key: crm_activity account');
      const row = { id: randomUUID(), tenant_id: t, account_id: a.accountId, contact_id: a.contactId, user_id: actorId, channel: a.channel, outcome: a.outcome,
        note: a.note, happened_at: a.happenedAt ?? monotonic(), created_at: iso() };
      s.crm_activity.push(row);
      return row.id;
    },
    async deleteActivity(id) {
      const s = db();
      const a = s.crm_activity.find((x) => x.id === id);
      if (!a || (a.user_id !== actorId && !isManager(a.tenant_id, actorId))) return false;
      s.crm_activity = s.crm_activity.filter((x) => x.id !== id);
      return true;
    },
    async deleteContactsByImport(importId) {
      const s = db();
      const gone = s.crm_contact.filter((c) => c.import_id === importId && isManager(c.tenant_id, actorId)).map((c) => c.id);
      s.crm_contact = s.crm_contact.filter((c) => !gone.includes(c.id));
      s.crm_contact_account = s.crm_contact_account.filter((l) => !gone.includes(l.contact_id));
      for (const a of s.crm_activity) if (a.contact_id && gone.includes(a.contact_id)) a.contact_id = null;
      return gone.length;
    },
  };
}
