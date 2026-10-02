import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from './db';
import type { CatalogVersion, DossierRecord, ItemRecord, LinkRecord, Role } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

const DOSSIER_COLS = 'id, tenant_id, author_id, title, prospect_name, prospect_company, status, locale, price_mode, total_price, currency, published_at, updated_at';
const ITEM_COLS = 'id, dossier_id, position, visible, price_override, prop_overrides, module_version_id, '
  + 'module_version!inner(id, version, default_props, default_price, default_currency, module!inner(id, key, name, block_type))';
const LINK_COLS = 'id, dossier_id, token, is_active, expires_at, created_at';

const toDossier = (r: Row): DossierRecord => ({
  id: r.id, tenantId: r.tenant_id, authorId: r.author_id, title: r.title,
  prospectName: r.prospect_name, prospectCompany: r.prospect_company, status: r.status, locale: r.locale,
  priceMode: r.price_mode, totalPrice: num(r.total_price), currency: r.currency,
  publishedAt: r.published_at, updatedAt: r.updated_at,
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

/** `sb` DEBE ser un cliente con la sesión del usuario (no service role): la RLS es la última barrera. */
export function supabaseAdminDb(sb: SupabaseClient): AdminDb {
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
      const r = check(await sb.from('dossier').insert({
        tenant_id: n.tenantId, author_id: n.authorId, title: n.title, prospect_name: n.prospectName,
        prospect_company: n.prospectCompany, locale: n.locale, price_mode: n.priceMode, total_price: n.totalPrice, currency: n.currency,
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
      const r = check(await sb.from('dossier_item').insert({
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
      return toLink(check(await sb.from('share_link').insert({ dossier_id: dossierId, expires_at: expiresAt }).select(LINK_COLS).single()));
    },
    async revokeLink(id) {
      const rows = check(await sb.from('share_link').update({ is_active: false, revoked_at: new Date().toISOString() }).eq('id', id).select('id')) ?? [];
      return rows.length > 0;
    },
  };
}
