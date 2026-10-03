import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb, AssetStore, Identity } from './db';
import type { CatalogVersion, DossierRecord, ItemRecord, LinkRecord, MemberRecord, ModuleRecord, ModuleVersionRecord, PartnerAccount, PartnerProfile, Role } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

const DOSSIER_COLS = 'id, tenant_id, author_id, title, prospect_name, prospect_company, status, locale, price_mode, total_price, currency, published_at, updated_at, outcome, outcome_note, segment_id, next_step, next_step_at, partner_account_id, situation';
const ITEM_COLS = 'id, dossier_id, position, visible, price_override, prop_overrides, module_version_id, '
  + 'module_version!inner(id, version, default_props, default_price, default_currency, module!inner(id, key, name, block_type))';
const LINK_COLS = 'id, dossier_id, token, is_active, expires_at, created_at';

const toDossier = (r: Row): DossierRecord => ({
  id: r.id, tenantId: r.tenant_id, authorId: r.author_id, title: r.title,
  prospectName: r.prospect_name, prospectCompany: r.prospect_company, status: r.status, locale: r.locale,
  priceMode: r.price_mode, totalPrice: num(r.total_price), currency: r.currency,
  publishedAt: r.published_at, updatedAt: r.updated_at,
  outcome: r.outcome ?? 'open', outcomeNote: r.outcome_note ?? null,
  segmentId: r.segment_id ?? null, nextStep: r.next_step ?? null, nextStepAt: r.next_step_at ?? null,
  partnerAccountId: r.partner_account_id ?? null,
  situation: r.situation ?? {},
});

const PROFILE_COLS = 'tenant_id, user_id, module_ids, see_team_tips, welcome_note, expires_at, can_invite';
const ACCOUNT_COLS = 'id, tenant_id, user_id, name, segment_id, price_policy, price_adjust_pct, notes, position';
const toProfile = (r: Row): PartnerProfile => ({
  tenantId: r.tenant_id, userId: r.user_id, moduleIds: r.module_ids ?? [], seeTeamTips: r.see_team_tips, welcomeNote: r.welcome_note, expiresAt: r.expires_at,
  canInvite: r.can_invite ?? false,
});
const toAccount = (r: Row): PartnerAccount => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, name: r.name, segmentId: r.segment_id, pricePolicy: r.price_policy,
  priceAdjustPct: Number(r.price_adjust_pct), notes: r.notes, position: Number(r.position),
});

/** Fila de partner_items(): como dossier_item + versión, pero sin tarifa. */
const toPartnerItem = (r: Row): ItemRecord => ({
  id: r.id, dossierId: r.dossier_id, position: Number(r.position), visible: r.visible,
  priceOverride: num(r.price_override), propOverrides: r.prop_overrides ?? {},
  moduleVersionId: r.module_version_id, version: r.version, defaultProps: r.default_props ?? {}, defaultPrice: null,
  currency: r.currency, moduleId: r.module_id, moduleKey: r.module_key, moduleName: r.module_name, blockType: r.block_type,
});

const toItem = (r: Row): ItemRecord => {
  const v = r.module_version;
  const m = v.module;
  return {
    id: r.id, dossierId: r.dossier_id, position: Number(r.position), visible: r.visible,
    priceOverride: num(r.price_override), propOverrides: r.prop_overrides ?? {},
    moduleVersionId: v.id, version: v.version, defaultProps: v.default_props ?? {}, defaultPrice: num(v.default_price),
    currency: v.default_currency, moduleId: m.id, moduleKey: m.key, moduleName: m.name, blockType: m.block_type,
  };
};

const toLink = (r: Row): LinkRecord => ({
  id: r.id, dossierId: r.dossier_id, token: r.token, isActive: r.is_active, expiresAt: r.expires_at, createdAt: r.created_at,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}

function checkOne<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  const d = check(res);
  if (d == null) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
  return d as NonNullable<T>;
}

/**
 * `sb` DEBE ser un cliente con la sesión del usuario (no service role): la RLS es la última barrera.
 * `partner`: el colaborador no puede leer module_version (contiene la tarifa); catálogo e items van por RPC sin precios.
 */
export function supabaseAdminDb(sb: SupabaseClient, opts: { partner?: boolean } = {}): AdminDb {
  const base = full(sb);
  if (!opts.partner) return base;
  return {
    ...base,
    async listItems(dossierIds) {
      if (!dossierIds.length) return [];
      return (check(await sb.rpc('partner_items', { p_dossier_ids: dossierIds })) as Row[] ?? []).map(toPartnerItem);
    },
    async listCatalog(tenantId) {
      return (check(await sb.rpc('partner_catalog', { p_tenant: tenantId })) as Row[] ?? []).map((r): CatalogVersion => ({
        moduleId: r.module_id, moduleKey: r.module_key, moduleName: r.module_name, description: r.description, blockType: r.block_type,
        versionId: r.version_id, version: r.version, defaultPrice: null, currency: r.currency,
      }));
    },
    async listModuleVersions(tenantId) {
      return (check(await sb.rpc('partner_catalog', { p_tenant: tenantId })) as Row[] ?? []).map((r): ModuleVersionRecord => ({
        id: r.version_id, moduleId: r.module_id, version: r.version, status: 'published', defaultProps: r.default_props ?? {}, defaultPrice: null, currency: r.currency,
      }));
    },
    async versionUsage() { return new Map(); },
  };
}

function full(sb: SupabaseClient): AdminDb {
  return {
    async membershipRole(userId, tenantId) {
      const r = check(await sb.from('membership').select('role').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle());
      return (r?.role as Role) ?? null;
    },
    async userNames(ids) {
      if (!ids.length) return new Map();
      const rows = check(await sb.from('users').select('id, email, display_name').in('id', ids)) ?? [];
      return new Map(rows.map((u: Row) => [u.id, u.display_name || u.email]));
    },

    async listDossiers(tenantId) {
      return (check(await sb.from('dossier').select(DOSSIER_COLS).eq('tenant_id', tenantId)) ?? []).map(toDossier);
    },
    async getDossier(id) {
      const r = check(await sb.from('dossier').select(DOSSIER_COLS).eq('id', id).maybeSingle());
      return r ? toDossier(r) : null;
    },
    async insertDossier(n) {
      const r = checkOne(await sb.from('dossier').insert({
        tenant_id: n.tenantId, author_id: n.authorId, title: n.title, prospect_name: n.prospectName,
        prospect_company: n.prospectCompany, locale: n.locale, price_mode: n.priceMode, total_price: n.totalPrice, currency: n.currency,
        partner_account_id: n.partnerAccountId ?? null,
      }).select(DOSSIER_COLS).single());
      return toDossier(r);
    },
    async updateDossier(id, p) {
      const patch: Row = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.prospectName !== undefined) patch.prospect_name = p.prospectName;
      if (p.prospectCompany !== undefined) patch.prospect_company = p.prospectCompany;
      if (p.locale !== undefined) patch.locale = p.locale;
      if (p.priceMode !== undefined) patch.price_mode = p.priceMode;
      if (p.totalPrice !== undefined) patch.total_price = p.totalPrice;
      if (p.currency !== undefined) patch.currency = p.currency;
      if (p.status !== undefined) patch.status = p.status;
      if (p.publishedAt !== undefined) patch.published_at = p.publishedAt;
      if (p.outcome !== undefined) patch.outcome = p.outcome;
      if (p.outcomeNote !== undefined) patch.outcome_note = p.outcomeNote;
      if (p.outcomeAt !== undefined) patch.outcome_at = p.outcomeAt;
      if (p.segmentId !== undefined) patch.segment_id = p.segmentId;
      if (p.nextStep !== undefined) patch.next_step = p.nextStep;
      if (p.nextStepAt !== undefined) patch.next_step_at = p.nextStepAt;
      if (p.situation !== undefined) patch.situation = p.situation;
      const rows = check(await sb.from('dossier').update(patch).eq('id', id).select(DOSSIER_COLS)) ?? [];
      return rows[0] ? toDossier(rows[0]) : null;
    },
    async deleteDossier(id) {
      const rows = check(await sb.from('dossier').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    async listItems(dossierIds) {
      if (!dossierIds.length) return [];
      return (check(await sb.from('dossier_item').select(ITEM_COLS).in('dossier_id', dossierIds)) ?? []).map(toItem);
    },
    async insertItem(n) {
      const r = checkOne(await sb.from('dossier_item').insert({
        dossier_id: n.dossierId, module_version_id: n.moduleVersionId, position: n.position,
        visible: n.visible ?? true, price_override: n.priceOverride ?? null, prop_overrides: n.propOverrides ?? {},
      }).select('id').single());
      return r.id as string;
    },
    async updateItem(id, p) {
      const patch: Row = {};
      if (p.position !== undefined) patch.position = p.position;
      if (p.visible !== undefined) patch.visible = p.visible;
      if (p.priceOverride !== undefined) patch.price_override = p.priceOverride;
      if (p.propOverrides !== undefined) patch.prop_overrides = p.propOverrides;
      if (p.moduleVersionId !== undefined) patch.module_version_id = p.moduleVersionId;
      const rows = check(await sb.from('dossier_item').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async updateItemPositions(updates) {
      for (const u of updates) check(await sb.from('dossier_item').update({ position: u.position }).eq('id', u.id).select('id'));
    },
    async deleteItem(id) {
      const rows = check(await sb.from('dossier_item').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    async listCatalog(tenantId) {
      const rows = check(await sb.from('module_version')
        .select('id, version, default_price, default_currency, module!inner(id, key, name, description, block_type, is_catalog)')
        .eq('tenant_id', tenantId).eq('status', 'published').eq('module.is_catalog', true)) ?? [];
      return rows.map((r: Row): CatalogVersion => ({
        moduleId: r.module.id, moduleKey: r.module.key, moduleName: r.module.name, description: r.module.description,
        blockType: r.module.block_type, versionId: r.id, version: r.version, defaultPrice: num(r.default_price), currency: r.default_currency,
      }));
    },

    async listLinks(dossierIds) {
      if (!dossierIds.length) return [];
      return (check(await sb.from('share_link').select(LINK_COLS).in('dossier_id', dossierIds)) ?? []).map(toLink);
    },
    async insertLink(dossierId, expiresAt) {
      // El token lo genera Postgres (24 bytes aleatorios).
      return toLink(checkOne(await sb.from('share_link').insert({ dossier_id: dossierId, expires_at: expiresAt }).select(LINK_COLS).single()));
    },
    async revokeLink(id) {
      const rows = check(await sb.from('share_link').update({ is_active: false, revoked_at: new Date().toISOString() }).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    // ---- cuenta del dossier
    async listContacts(ids) {
      if (!ids.length) return [];
      const rows = check(await sb.from('dossier_contact').select('id, dossier_id, persona_id, name, stance, email, phone, notes, position, traits').in('dossier_id', ids)) ?? [];
      return rows.map((c: Row) => ({ id: c.id, dossierId: c.dossier_id, personaId: c.persona_id, name: c.name, stance: c.stance, email: c.email, phone: c.phone, notes: c.notes, position: Number(c.position), traits: c.traits ?? {} }));
    },
    async insertContact(dossierId, r) {
      const row = checkOne(await sb.from('dossier_contact').insert({
        dossier_id: dossierId, persona_id: r.personaId, name: r.name, stance: r.stance, email: r.email, phone: r.phone, notes: r.notes, position: r.position, traits: r.traits ?? {},
      }).select('id').single());
      return row.id as string;
    },
    async updateContact(id, p) {
      const patch: Row = {};
      if (p.personaId !== undefined) patch.persona_id = p.personaId;
      if (p.name !== undefined) patch.name = p.name;
      if (p.stance !== undefined) patch.stance = p.stance;
      if (p.email !== undefined) patch.email = p.email;
      if (p.phone !== undefined) patch.phone = p.phone;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.traits !== undefined) patch.traits = p.traits;
      const rows = check(await sb.from('dossier_contact').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async deleteContact(id) {
      const rows = check(await sb.from('dossier_contact').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async segmentExists(t, id) { return !!check(await sb.from('segment').select('id').eq('tenant_id', t).eq('id', id).maybeSingle()); },
    async personaExists(t, id) { return !!check(await sb.from('persona').select('id').eq('tenant_id', t).eq('id', id).maybeSingle()); },

    // ---- gestión del tenant
    async getTenant(id) {
      const r = check(await sb.from('tenant').select('id, slug, name, default_locale, theme_tokens, brand').eq('id', id).maybeSingle());
      return r ? { id: r.id, slug: r.slug, name: r.name, defaultLocale: r.default_locale, themeTokens: r.theme_tokens, brand: r.brand } : null;
    },
    async updateTenant(id, p) {
      const patch: Row = {};
      if (p.name !== undefined) patch.name = p.name;
      if (p.defaultLocale !== undefined) patch.default_locale = p.defaultLocale;
      if (p.themeTokens !== undefined) patch.theme_tokens = p.themeTokens;
      if (p.brand !== undefined) patch.brand = p.brand;
      const rows = check(await sb.from('tenant').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    async listMembers(tenantId) {
      const rows = check(await sb.from('membership').select('user_id, role, invited_by, created_at, users!membership_user_id_fkey!inner(email, display_name)').eq('tenant_id', tenantId)) ?? [];
      return rows.map((r: Row): MemberRecord => ({ userId: r.user_id, email: r.users.email, displayName: r.users.display_name, role: r.role, invitedBy: r.invited_by ?? null, joinedAt: r.created_at ?? null }));
    },
    async addMember(tenantId, userId, role) {
      // invited_by lo pone el trigger membership_set_inviter con la sesión.
      const rows = check(await sb.from('membership').insert({ tenant_id: tenantId, user_id: userId, role }).select('user_id')) ?? [];
      return rows.length > 0;
    },
    async setMemberRole(tenantId, userId, role) {
      const rows = check(await sb.from('membership').update({ role }).eq('tenant_id', tenantId).eq('user_id', userId).select('user_id')) ?? [];
      return rows.length > 0;
    },
    async removeMember(tenantId, userId) {
      const rows = check(await sb.from('membership').delete().eq('tenant_id', tenantId).eq('user_id', userId).select('user_id')) ?? [];
      return rows.length > 0;
    },

    async listModules(tenantId) {
      const rows = check(await sb.from('module').select('id, tenant_id, key, block_type, name, description, is_catalog').eq('tenant_id', tenantId)) ?? [];
      return rows.map((m: Row): ModuleRecord => ({
        id: m.id, tenantId: m.tenant_id, key: m.key, blockType: m.block_type, name: m.name, description: m.description, isCatalog: m.is_catalog,
      }));
    },
    async listModuleVersions(tenantId) {
      const rows = check(await sb.from('module_version').select('id, module_id, version, status, default_props, default_price, default_currency').eq('tenant_id', tenantId)) ?? [];
      return rows.map((v: Row): ModuleVersionRecord => ({
        id: v.id, moduleId: v.module_id, version: v.version, status: v.status,
        defaultProps: v.default_props ?? {}, defaultPrice: num(v.default_price), currency: v.default_currency,
      }));
    },
    async versionUsage(tenantId) {
      const rows = check(await sb.from('dossier_item').select('module_version_id').eq('tenant_id', tenantId)) ?? [];
      const out = new Map<string, number>();
      for (const r of rows as Row[]) out.set(r.module_version_id, (out.get(r.module_version_id) ?? 0) + 1);
      return out;
    },
    async insertModule(m) {
      const r = checkOne(await sb.from('module').insert({
        tenant_id: m.tenantId, key: m.key, block_type: m.blockType, name: m.name, description: m.description, is_catalog: m.isCatalog,
      }).select('id').single());
      return r.id as string;
    },
    async updateModule(id, p) {
      const patch: Row = {};
      if (p.name !== undefined) patch.name = p.name;
      if (p.description !== undefined) patch.description = p.description;
      if (p.isCatalog !== undefined) patch.is_catalog = p.isCatalog;
      const rows = check(await sb.from('module').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
    async insertModuleVersion(v) {
      const r = checkOne(await sb.from('module_version').insert({
        module_id: v.moduleId, version: v.version, status: v.status, default_props: v.defaultProps,
        default_price: v.defaultPrice, default_currency: v.currency,
      }).select('id').single());
      return r.id as string;
    },
    async updateModuleVersion(id, p) {
      const patch: Row = {};
      if (p.defaultProps !== undefined) patch.default_props = p.defaultProps;
      if (p.defaultPrice !== undefined) patch.default_price = p.defaultPrice;
      if (p.currency !== undefined) patch.default_currency = p.currency;
      if (p.status !== undefined) patch.status = p.status;
      const rows = check(await sb.from('module_version').update(patch).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },

    // ---- colaboradores
    async getPartnerProfile(tenantId, userId) {
      const r = check(await sb.from('partner_profile').select(PROFILE_COLS).eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle());
      return r ? toProfile(r) : null;
    },
    async listPartnerProfiles(tenantId) {
      return (check(await sb.from('partner_profile').select(PROFILE_COLS).eq('tenant_id', tenantId)) ?? []).map(toProfile);
    },
    async upsertPartnerProfile(p) {
      const rows = check(await sb.from('partner_profile').upsert({
        tenant_id: p.tenantId, user_id: p.userId, module_ids: p.moduleIds, see_team_tips: p.seeTeamTips, welcome_note: p.welcomeNote, expires_at: p.expiresAt,
        can_invite: p.canInvite,
      }).select('user_id')) ?? [];
      return rows.length > 0;
    },
    async listPartnerAccounts(tenantId, userId) {
      let q = sb.from('partner_account').select(ACCOUNT_COLS).eq('tenant_id', tenantId);
      if (userId) q = q.eq('user_id', userId);
      return (check(await q) ?? []).map(toAccount);
    },
    async savePartnerAccount(a) {
      const row = {
        tenant_id: a.tenantId, user_id: a.userId, name: a.name, segment_id: a.segmentId, price_policy: a.pricePolicy,
        price_adjust_pct: a.priceAdjustPct, notes: a.notes, position: a.position,
      };
      if (a.id) {
        const rows = check(await sb.from('partner_account').update(row).eq('id', a.id).select('id')) ?? [];
        if (!rows.length) throw new Error('[supabase] la escritura no devolvió fila (¿RLS?)');
        return a.id;
      }
      return (checkOne(await sb.from('partner_account').insert(row).select('id').single())).id as string;
    },
    async partnerInvitePartner(tenantId, _inviterId, userId) {
      check(await sb.rpc('partner_invite_partner', { p_tenant: tenantId, p_user: userId }));
    },
    async deletePartnerAccount(id) {
      const rows = check(await sb.from('partner_account').delete().eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
  };
}

/**
 * Invitaciones con la service role (solo servidor). Únicas operaciones privilegiadas:
 * buscar un usuario por email e invitarlo. La membership la crea después el admin con SU sesión (RLS).
 */
export function supabaseIdentity(url: string, serviceRoleKey: string): Identity {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async findOrInvite(email, { redirectTo }) {
      const e = email.trim().toLowerCase();
      const existing = check(await admin.from('users').select('id').ilike('email', e).maybeSingle());
      if (existing) return { userId: existing.id as string, invited: false };
      const { data, error } = await admin.auth.admin.inviteUserByEmail(e, { redirectTo });
      if (error || !data.user) throw new Error(`[supabase] invitación: ${error?.message ?? 'sin usuario'}`);
      return { userId: data.user.id, invited: true };
    },
  };
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'font/woff2': 'woff2', 'font/woff': 'woff',
};

/** Storage con la sesión del usuario: la política de storage.objects exige admin del tenant. */
export function supabaseAssets(sb: SupabaseClient): AssetStore {
  return {
    async upload(tenantId, file, kind) {
      const ext = EXT[file.type];
      if (!ext) throw new Error('TIPO_NO_PERMITIDO');
      const path = `${tenantId}/${kind}-${Date.now().toString(36)}.${ext}`;
      const { error } = await sb.storage.from('tenant-assets').upload(path, file.bytes, { contentType: file.type, upsert: false, cacheControl: '31536000' });
      if (error) throw new Error(`[supabase] storage: ${error.message}`);
      return { url: sb.storage.from('tenant-assets').getPublicUrl(path).data.publicUrl };
    },
  };
}
