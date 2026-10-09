/**
 * Cuentas en memoria (modo DEMO). Replica supabase/migrations/20261012000000_accounts.sql:
 * account_guard, account_audit, account_touch y dossier_account_sync, con las reglas de rules.ts.
 */
import { randomUUID } from 'node:crypto';
import { demoDb, type AccountRow, type CrmFieldRow, type DossierRow } from '../data/store';
import type { CrmField, FieldType } from '../crm/fields';
import { notifyRoles, resolveNotifications, userLabel } from '../notify/db-demo';
import type { AccountInsert, AccountsDb } from './db';
import { eligibility } from './rules';
import { DEFAULT_RULES, type Account, type AccountRules, type Eligibility, type TouchKind, type Zone, type ZoneKind } from './types';

const db = () => demoDb();
const now = () => new Date();
const iso = () => now().toISOString();
const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const toAccount = (r: AccountRow): Account => ({
  id: r.id, tenantId: r.tenant_id, name: r.name, zoneId: r.zone_id, segmentId: r.segment_id, address: r.address, externalRef: r.external_ref,
  notes: r.notes, status: r.status, blockedReason: r.blocked_reason, ownerId: r.owner_id, claimedUntil: r.claimed_until, lastTouchAt: r.last_touch_at,
  lastTouchBy: r.last_touch_by, wonAt: r.won_at, wonBy: r.won_by, wonDossierId: r.won_dossier_id, createdBy: r.created_by, createdAt: r.created_at,
  fields: (r.fields ?? {}) as Account['fields'], parentId: r.parent_id ?? null, tags: r.tags ?? [], importId: r.import_id ?? null,
  phone: r.phone ?? null, email: r.email ?? null, instagram: r.instagram ?? null, linkedin: r.linkedin ?? null, website: r.website ?? null, mapsUrl: r.maps_url ?? null,
  nextStep: r.next_step ?? null, nextStepAt: r.next_step_at ?? null, nextContactId: r.next_contact_id ?? null, nextChannel: r.next_channel ?? null,
  qualification: (r.qualification ?? {}) as Account['qualification'],
  placeId: r.place_id ?? null, hours: r.hours ?? null, lat: r.lat ?? null, lng: r.lng ?? null, placeStatus: r.place_status ?? null, placeAt: r.place_at ?? null,
  aiResearchAt: r.ai_research_at ?? null,
});
const CONTACT_COLS = { phone: 'phone', email: 'email', instagram: 'instagram', linkedin: 'linkedin', website: 'website', mapsUrl: 'maps_url' } as const;
function applyContact(row: AccountRow, c: AccountInsert['contact']) {
  for (const [k, col] of Object.entries(CONTACT_COLS)) { const v = c?.[k as keyof typeof CONTACT_COLS]; if (v !== undefined) (row as unknown as Record<string, unknown>)[col] = v; }
}
const toField = (r: CrmFieldRow): CrmField => ({
  id: r.id, tenantId: r.tenant_id, key: r.key, label: r.label, type: r.type as FieldType, options: r.options, group: r.grp, position: r.position,
  help: r.help, required: r.required, inList: r.in_list, filterable: r.filterable, segments: r.segments, archivedAt: r.archived_at,
  target: r.target ?? 'account', tags: r.tags ?? [], isStage: r.is_stage ?? false,
});
/** = trigger account_fields_check: solo claves de campos del espacio. */
export function checkFields(t: string, fields: Record<string, unknown>, target: 'account' | 'contact' = 'account') {
  const keys = new Set(db().crm_field.filter((f) => f.tenant_id === t && (f.target ?? 'account') === target).map((f) => f.key));
  const unknown = Object.keys(fields).find((k) => !keys.has(k));
  if (unknown) throw new Error(`check constraint: Campo desconocido: ${unknown}`);
  return { ...fields };
}
const toZone = (z: { id: string; tenant_id: string; parent_id: string | null; name: string; kind: string; position: number }): Zone =>
  ({ id: z.id, tenantId: z.tenant_id, parentId: z.parent_id, name: z.name, kind: z.kind as ZoneKind, position: z.position });

function roleOf(tenantId: string, userId: string | null) {
  return db().users.find((u) => u.id === userId)?.memberships.find((m) => m.tenant_id === tenantId)?.role ?? null;
}
const isManager = (t: string, u: string | null) => ['admin', 'lead'].includes(roleOf(t, u) ?? '');
function rulesOf(t: string): AccountRules {
  const r = db().account_rules.find((x) => x.tenant_id === t);
  return r ? { claimDays: r.claim_days, strictZones: r.strict_zones, requireAccount: r.require_account } : DEFAULT_RULES;
}
function eligibilityFor(t: string, accountId: string | null, userId: string): Eligibility {
  const s = db();
  const a = accountId ? s.account.find((x) => x.id === accountId && x.tenant_id === t) : null;
  if (accountId && !a) return 'no_account';
  return eligibility(a ? toAccount(a) : null, userId, rulesOf(t), {
    zones: s.zone.filter((z) => z.tenant_id === t).map(toZone),
    assignments: s.membership_zone.filter((m) => m.tenant_id === t).map((m) => ({ userId: m.user_id, zoneId: m.zone_id })),
    now: now(),
  });
}
function logTouch(a: { tenant_id: string; id: string }, userId: string | null, kind: TouchKind, note: string | null = null) {
  db().account_touch.push({ id: randomUUID(), tenant_id: a.tenant_id, account_id: a.id, user_id: userId, kind, note, created_at: iso() });
}

/** = trigger account_parent_check: un solo nivel de grupo. */
function checkParent(t: string, id: string, parentId: string | null | undefined) {
  if (!parentId) return;
  const s = db();
  if (parentId === id) throw new Error('check constraint: Una empresa no puede ser su propio grupo');
  const p = s.account.find((x) => x.id === parentId && x.tenant_id === t);
  if (!p) throw new Error('violates foreign key: account_parent_fk');
  if (p.parent_id) throw new Error('check constraint: Ese grupo ya está dentro de otro grupo');
  if (s.account.some((x) => x.parent_id === id)) throw new Error('check constraint: Esta empresa ya es grupo de otras');
}

/** = trigger dossier_account_sync (vinculación y resultado). La decisión la valida el servicio. */
export function demoAccountsOnDossier(prev: DossierRow | null, d: DossierRow) {
  const s = db();
  const seller = d.author_id;
  if (!prev) { d.account_eligibility = null; d.account_decision = null; d.account_decided_by = null; d.account_decided_at = null; }
  if (roleOf(d.tenant_id, seller) === 'partner') d.account_id = prev?.account_id ?? null;
  if (d.account_id && (!prev || prev.account_id !== d.account_id) && seller) {
    const a = s.account.find((x) => x.id === d.account_id);
    if (a) {
      const elig = eligibilityFor(d.tenant_id, a.id, seller);
      logTouch(a, seller, 'dossier', d.title);
      if (elig === 'eligible' && a.status !== 'customer') {
        a.owner_id = seller; a.claimed_until = plusDays(rulesOf(d.tenant_id).claimDays); a.last_touch_at = iso(); a.last_touch_by = seller;
      }
    }
  }
  if (prev && (prev.outcome ?? 'open') !== (d.outcome ?? 'open')) {
    const a = d.account_id ? s.account.find((x) => x.id === d.account_id) : undefined;
    if (d.outcome === 'won') {
      const elig: Eligibility = d.partner_account_id && !d.account_id ? 'eligible' : eligibilityFor(d.tenant_id, d.account_id ?? null, seller ?? '');
      d.account_eligibility = elig;
      if (a) {
        logTouch(a, seller, 'won', d.title);
        if (elig === 'eligible') Object.assign(a, { status: 'customer', won_at: iso(), won_by: seller, won_dossier_id: d.id, owner_id: seller, claimed_until: null, last_touch_at: iso(), last_touch_by: seller });
      }
      if (elig !== 'eligible') {
        notifyRoles(d.tenant_id, ['admin', 'lead'], 'account_conflict', 'action', d.id, {
          dossier: d.title, account: a?.name ?? null, seller: userLabel(seller), reason: elig, holder: userLabel(a?.won_by ?? a?.owner_id), blockedReason: a?.blocked_reason ?? null,
        }, null);
      }
    } else {
      d.account_eligibility = null; d.account_decision = null; d.account_decided_by = null; d.account_decided_at = null;
      resolveNotifications(d.tenant_id, 'account_conflict', d.id);
      if (prev.outcome === 'won' && a && a.won_dossier_id === d.id) {
        Object.assign(a, { status: 'open', won_at: null, won_by: null, won_dossier_id: null, claimed_until: plusDays(rulesOf(d.tenant_id).claimDays) });
      }
      if (d.outcome === 'lost' && a) logTouch(a, seller, 'lost', d.title);
    }
  }
}

export function demoAccountsDb(actorId: string): AccountsDb {
  function insertOne(t: string, a: AccountInsert): string {
    const s = db();
    if (a.externalRef && s.account.some((x) => x.tenant_id === t && x.external_ref === a.externalRef)) throw new Error('duplicate key: account_ext_uidx');
    const manager = isManager(t, actorId);
    const row: AccountRow = {
      id: randomUUID(), tenant_id: t, name: a.name, zone_id: a.zoneId, segment_id: a.segmentId, address: a.address, external_ref: a.externalRef, notes: a.notes,
      status: 'open', blocked_reason: null, owner_id: null, claimed_until: null, last_touch_at: null, last_touch_by: null,
      won_at: null, won_by: null, won_dossier_id: null, created_by: actorId, created_at: iso(), fields: checkFields(t, a.fields ?? {}),
      parent_id: null, tags: a.tags ?? [], import_id: a.importId ?? null,
    };
    // = account_guard: el manager puede asignarla; el comercial se la queda.
    if (manager) { if (a.ownerId) { row.owner_id = a.ownerId; row.claimed_until = plusDays(rulesOf(t).claimDays); } }
    else Object.assign(row, { owner_id: actorId, claimed_until: plusDays(rulesOf(t).claimDays), last_touch_at: iso(), last_touch_by: actorId });
    checkParent(t, row.id, a.parentId);
    row.parent_id = a.parentId ?? null;
    applyContact(row, a.contact);
    s.account.push(row);
    logTouch(row, actorId, 'created');
    return row.id;
  }
  return {
    async listZones(t) { return db().zone.filter((z) => z.tenant_id === t).map(toZone); },
    async saveZone(t, z, id) {
      const s = db();
      if (s.zone.some((x) => x.tenant_id === t && x.id !== id && (x.parent_id ?? null) === (z.parentId ?? null) && x.name.toLowerCase() === z.name.toLowerCase())) {
        throw new Error('duplicate key: zone_name_uidx');
      }
      if (z.parentId && !s.zone.some((x) => x.id === z.parentId && x.tenant_id === t)) throw new Error('violates foreign key: zone parent');
      const row = { id: id ?? randomUUID(), tenant_id: t, parent_id: z.parentId, name: z.name, kind: z.kind, position: z.position };
      s.zone = [...s.zone.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async deleteZone(id) {
      const s = db();
      const gone = new Set([id]);
      for (let grew = true; grew;) { grew = false; for (const z of s.zone) if (z.parent_id && gone.has(z.parent_id) && !gone.has(z.id)) { gone.add(z.id); grew = true; } }
      const before = s.zone.length;
      s.zone = s.zone.filter((z) => !gone.has(z.id));
      s.membership_zone = s.membership_zone.filter((m) => !gone.has(m.zone_id));
      for (const a of s.account) if (a.zone_id && gone.has(a.zone_id)) a.zone_id = null;
      return s.zone.length < before;
    },
    async insertZones(t, rows) {
      const ids: string[] = [];
      for (const z of rows) ids.push(await this.saveZone(t, z));
      return ids;
    },
    async listAssignments(t) { return db().membership_zone.filter((m) => m.tenant_id === t).map((m) => ({ userId: m.user_id, zoneId: m.zone_id })); },
    async setAssignments(t, userId, zoneIds) {
      const s = db();
      s.membership_zone = [...s.membership_zone.filter((m) => !(m.tenant_id === t && m.user_id === userId)), ...zoneIds.map((zone_id) => ({ tenant_id: t, user_id: userId, zone_id }))];
    },
    async getRules(t) { return rulesOf(t); },
    async saveRules(t, r) {
      const s = db();
      s.account_rules = [...s.account_rules.filter((x) => x.tenant_id !== t), { tenant_id: t, claim_days: r.claimDays, strict_zones: r.strictZones, require_account: r.requireAccount }];
    },
    async listAccounts(t, f) {
      const q = f.q?.trim().toLowerCase();
      return db().account
        .filter((a) => a.tenant_id === t && (!f.ids || f.ids.includes(a.id)) && (!f.zoneIds || (a.zone_id && f.zoneIds.includes(a.zone_id)))
          && (!f.ownerId || a.owner_id === f.ownerId) && (!f.status || a.status === f.status) && (!q || a.name.toLowerCase().includes(q))
          && (!f.parentId || a.parent_id === f.parentId) && (!f.tag || (a.tags ?? []).includes(f.tag)))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .slice(0, f.limit).map(toAccount);
    },
    async getAccount(id) { const a = db().account.find((x) => x.id === id); return a ? toAccount(a) : null; },
    async insertAccount(t, a) { return insertOne(t, a); },
    async insertAccounts(t, rows) { return rows.map((a) => insertOne(t, a)); },
    async deleteAccountsByImport(importId) {
      const s = db();
      const gone = s.account.filter((a) => a.import_id === importId && isManager(a.tenant_id, actorId));
      for (const a of gone) await this.deleteAccount(a.id);
      return gone.length;
    },
    async updateAccount(id, p) {
      const a = db().account.find((x) => x.id === id);
      if (!a) return false;
      const manager = isManager(a.tenant_id, actorId);
      if (!manager && a.owner_id !== actorId) return false;  // = RLS (0 filas)
      const guarded = p.status !== undefined || p.blockedReason !== undefined || p.ownerId !== undefined || p.claimedUntil !== undefined;
      if (guarded && !manager) throw new Error('permission denied: Solo se puede cambiar la reserva de una cuenta desde sus acciones');
      const prev = { ...a };
      if (p.name !== undefined) a.name = p.name;
      if (p.zoneId !== undefined) a.zone_id = p.zoneId;
      if (p.segmentId !== undefined) a.segment_id = p.segmentId;
      if (p.address !== undefined) a.address = p.address;
      if (p.externalRef !== undefined) a.external_ref = p.externalRef;
      if (p.notes !== undefined) a.notes = p.notes;
      if (p.status !== undefined) a.status = p.status;
      if (p.blockedReason !== undefined) a.blocked_reason = p.blockedReason;
      if (p.ownerId !== undefined) a.owner_id = p.ownerId;
      if (p.claimedUntil !== undefined) a.claimed_until = p.claimedUntil;
      if (p.fields !== undefined) a.fields = checkFields(a.tenant_id, p.fields);
      if (p.parentId !== undefined) { checkParent(a.tenant_id, a.id, p.parentId); a.parent_id = p.parentId; }
      if (p.tags !== undefined) a.tags = p.tags;
      applyContact(a, p.contact);
      if (p.next !== undefined) Object.assign(a, { next_step: p.next.step, next_step_at: p.next.at, next_contact_id: p.next.contactId, next_channel: p.next.channel });
      // = account_audit
      if (a.status === 'blocked' && prev.status !== 'blocked') logTouch(a, actorId, 'block', a.blocked_reason);
      else if (prev.status === 'blocked' && a.status !== 'blocked') logTouch(a, actorId, 'unblock');
      if (a.owner_id !== prev.owner_id) logTouch(a, actorId, a.owner_id ? 'assign' : 'release', userLabel(a.owner_id));
      return true;
    },
    async deleteAccount(id) {
      const s = db();
      const a = s.account.find((x) => x.id === id);
      if (!a || !isManager(a.tenant_id, actorId)) return false;
      s.account = s.account.filter((x) => x.id !== id);
      for (const x of s.account) if (x.parent_id === id) x.parent_id = null;
      s.crm_contact_account = s.crm_contact_account.filter((l) => l.account_id !== id);
      s.crm_activity = s.crm_activity.filter((x) => x.account_id !== id);
      s.account_touch = s.account_touch.filter((x) => x.account_id !== id);
      for (const d of s.dossier) if (d.account_id === id) d.account_id = null;
      return true;
    },
    async touch(id, kind, note) {
      const a = db().account.find((x) => x.id === id);
      const role = a ? roleOf(a.tenant_id, actorId) : null;
      if (!a || !role || role === 'partner') throw new Error('permission denied: Cuenta no encontrada');
      if (kind === 'release') {
        if (a.owner_id !== actorId) throw new Error('permission denied: Solo quien la trabaja puede soltarla');
        a.owner_id = null; a.claimed_until = null;
        logTouch(a, actorId, 'release', note);
        return 'eligible';
      }
      const elig = eligibilityFor(a.tenant_id, a.id, actorId);
      logTouch(a, actorId, kind, note);
      if (elig === 'eligible') {
        a.owner_id = actorId;
        a.claimed_until = a.status === 'customer' ? null : plusDays(rulesOf(a.tenant_id).claimDays);
        a.last_touch_at = iso(); a.last_touch_by = actorId;
      }
      return elig;
    },
    async listTouches(accountId, limit) {
      return db().account_touch.filter((x) => x.account_id === accountId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
        .map((x) => ({ id: x.id, accountId: x.account_id, userId: x.user_id, kind: x.kind as TouchKind, note: x.note, createdAt: x.created_at }));
    },
    async preview(accountId) {
      const a = db().account.find((x) => x.id === accountId);
      if (!a || !['admin', 'lead', 'rep'].includes(roleOf(a.tenant_id, actorId) ?? '')) throw new Error('permission denied: Cuenta no encontrada');
      return eligibilityFor(a.tenant_id, a.id, actorId);
    },
    async listFields(t) {
      return db().crm_field.filter((f) => f.tenant_id === t).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, 'es')).map(toField);
    },
    async saveField(t, f, id) {
      const s = db();
      if (roleOf(t, actorId) !== 'admin') throw new Error('permission denied: Solo un admin del espacio');
      if (s.crm_field.some((x) => x.tenant_id === t && x.key === f.key && x.id !== id)) throw new Error('duplicate key: crm_field_tenant_id_key_key');
      const prev = id ? s.crm_field.find((x) => x.id === id && x.tenant_id === t) : undefined;
      if (id && !prev) return id;
      const row: CrmFieldRow = { id: id ?? randomUUID(), tenant_id: t, key: f.key, label: f.label, type: f.type, options: f.options, grp: f.group, position: f.position,
        help: f.help, required: f.required, in_list: f.inList, filterable: f.filterable, segments: f.segments, archived_at: prev?.archived_at ?? null, created_at: prev?.created_at ?? iso(),
        target: f.target, tags: f.tags, is_stage: f.isStage };
      s.crm_field = [...s.crm_field.filter((x) => x.id !== row.id), row];
      return row.id;
    },
    async deleteField(id) {
      const s = db();
      const f = s.crm_field.find((x) => x.id === id);
      if (!f || roleOf(f.tenant_id, actorId) !== 'admin') return false;
      s.crm_field = s.crm_field.filter((x) => x.id !== id);
      return true;
    },
    async qualify(id, q) {
      const a = db().account.find((x) => x.id === id);
      const role = a ? roleOf(a.tenant_id, actorId) : null;
      if (!a || !role || role === 'partner') throw new Error('permission denied: Cuenta no encontrada');
      if (!(isManager(a.tenant_id, actorId) || !a.owner_id || a.owner_id === actorId)) throw new Error('permission denied: Solo quien la trabaja o un/a gerente puede editarla');
      a.qualification = { ...q };
    },
    async research(id, d) {
      const a = db().account.find((x) => x.id === id);
      const role = a ? roleOf(a.tenant_id, actorId) : null;
      if (!a || !role || role === 'partner') throw new Error('permission denied: Cuenta no encontrada');
      if (!(isManager(a.tenant_id, actorId) || !a.owner_id || a.owner_id === actorId)) throw new Error('permission denied: Solo quien la trabaja o un/a gerente puede editarla');
      a.phone ||= d.phone; a.website ||= d.website; a.address ||= d.address; a.maps_url ||= d.mapsUrl;
      Object.assign(a, { place_id: d.placeId, hours: d.hours ?? a.hours ?? null, lat: d.lat ?? a.lat ?? null, lng: d.lng ?? a.lng ?? null, place_status: d.status, place_at: iso() });
    },
    async saveAiResearch(id, d, fill) {
      const a = db().account.find((x) => x.id === id);
      const role = a ? roleOf(a.tenant_id, actorId) : null;
      if (!a || !role || role === 'partner') throw new Error('permission denied: Cuenta no encontrada');
      if (!(isManager(a.tenant_id, actorId) || !a.owner_id || a.owner_id === actorId)) throw new Error('permission denied: Solo quien la trabaja o un/a gerente puede editarla');
      a.ai_research = d ? JSON.parse(JSON.stringify(d)) : null; a.ai_research_at = d ? iso() : null;
      if (fill) { a.phone ||= fill.phone ?? null; a.email ||= fill.email?.toLowerCase() ?? null; a.instagram ||= fill.instagram ?? null; a.linkedin ||= fill.linkedin ?? null; a.website ||= fill.website ?? null; }
    },
    async getAiResearch(id) {
      const a = db().account.find((x) => x.id === id);
      return a && roleOf(a.tenant_id, actorId) && roleOf(a.tenant_id, actorId) !== 'partner' ? JSON.parse(JSON.stringify(a.ai_research ?? null)) : null;
    },
    async getPriorityWeights(t) { return db().crm_settings.find((x) => x.tenant_id === t)?.priority_weights ?? null; },
    async savePriorityWeights(t, w) {
      if (roleOf(t, actorId) !== 'admin') throw new Error('permission denied: Solo un admin del espacio');
      const s = db();
      s.crm_settings = [...s.crm_settings.filter((x) => x.tenant_id !== t), { tenant_id: t, priority_weights: { ...w } }];
    },
    async archiveField(id, archived) {
      const f = db().crm_field.find((x) => x.id === id);
      if (!f || roleOf(f.tenant_id, actorId) !== 'admin') return false;
      f.archived_at = archived ? iso() : null;
      return true;
    },
    async decide(dossierId, decision) {
      const d = db().dossier.find((x) => x.id === dossierId);
      if (!d) return false;
      if (!isManager(d.tenant_id, actorId)) throw new Error('permission denied: Solo un/a admin o gerente decide sobre la comisión');
      d.account_decision = decision; d.account_decided_by = actorId; d.account_decided_at = iso();
      resolveNotifications(d.tenant_id, 'account_conflict', d.id);
      return true;
    },
  };
}
