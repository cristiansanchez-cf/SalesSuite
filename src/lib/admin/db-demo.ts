import { randomBytes, randomUUID } from 'node:crypto';
import { demoDb, type DemoDb, type DossierRow, type ShareLinkRow } from '../data/store';
import type { AdminDb } from './db';
import type { CatalogVersion, DossierRecord, ItemRecord, LinkRecord } from './types';

export const newToken = () => randomBytes(24).toString('base64url');

const toDossier = (r: DossierRow): DossierRecord => ({
  id: r.id, tenantId: r.tenant_id, authorId: r.author_id, title: r.title,
  prospectName: r.prospect_name, prospectCompany: r.prospect_company, status: r.status, locale: r.locale,
  priceMode: r.price_mode, totalPrice: r.total_price, currency: r.currency,
  publishedAt: r.published_at ?? null, updatedAt: r.updated_at ?? null,
});

const toLink = (l: ShareLinkRow): LinkRecord => ({
  id: l.id, dossierId: l.dossier_id, token: l.token, isActive: l.is_active, expiresAt: l.expires_at, createdAt: l.created_at ?? null,
});

/** AdminDb sobre el store en memoria. `getDb` inyectable para tests. */
export function demoAdminDb(getDb: () => DemoDb = demoDb): AdminDb {
  const db = getDb;
  const touch = (dossierId: string) => {
    const d = db().dossier.find((x) => x.id === dossierId);
    if (d) d.updated_at = new Date().toISOString();
  };

  return {
    async membershipRole(userId, tenantId) {
      return db().users.find((u) => u.id === userId)?.memberships.find((m) => m.tenant_id === tenantId)?.role ?? null;
    },
    async userNames(ids) {
      return new Map(db().users.filter((u) => ids.includes(u.id)).map((u) => [u.id, u.display_name || u.email]));
    },

    async listDossiers(tenantId) {
      return db().dossier.filter((d) => d.tenant_id === tenantId).map(toDossier);
    },
    async getDossier(id) {
      const d = db().dossier.find((x) => x.id === id);
      return d ? toDossier(d) : null;
    },
    async insertDossier(n) {
      const now = new Date().toISOString();
      const row: DossierRow = {
        id: randomUUID(), tenant_id: n.tenantId, author_id: n.authorId, title: n.title,
        prospect_name: n.prospectName, prospect_company: n.prospectCompany, prospect_meta: {},
        status: 'draft', locale: n.locale, price_mode: n.priceMode, total_price: n.totalPrice, currency: n.currency,
        theme_override: null, published_at: null, created_at: now, updated_at: now,
      };
      db().dossier.push(row);
      return toDossier(row);
    },
    async updateDossier(id, p) {
      const d = db().dossier.find((x) => x.id === id);
      if (!d) return null;
      if (p.title !== undefined) d.title = p.title;
      if (p.prospectName !== undefined) d.prospect_name = p.prospectName;
      if (p.prospectCompany !== undefined) d.prospect_company = p.prospectCompany;
      if (p.locale !== undefined) d.locale = p.locale;
      if (p.priceMode !== undefined) d.price_mode = p.priceMode;
      if (p.totalPrice !== undefined) d.total_price = p.totalPrice;
      if (p.currency !== undefined) d.currency = p.currency;
      if (p.status !== undefined) d.status = p.status;
      if (p.publishedAt !== undefined) d.published_at = p.publishedAt;
      d.updated_at = new Date().toISOString();
      return toDossier(d);
    },
    async deleteDossier(id) {
      const s = db();
      const before = s.dossier.length;
      s.dossier = s.dossier.filter((d) => d.id !== id);
      s.dossier_item = s.dossier_item.filter((i) => i.dossier_id !== id);
      s.share_link = s.share_link.filter((l) => l.dossier_id !== id);
      return s.dossier.length < before;
    },

    async listItems(dossierIds) {
      const s = db();
      return s.dossier_item.filter((i) => dossierIds.includes(i.dossier_id)).map((i): ItemRecord => {
        const v = s.module_version.find((x) => x.id === i.module_version_id)!;
        const m = s.module.find((x) => x.id === v.module_id)!;
        return {
          id: i.id, dossierId: i.dossier_id, position: i.position, visible: i.visible,
          priceOverride: i.price_override, propOverrides: i.prop_overrides,
          moduleVersionId: v.id, version: v.version, defaultProps: v.default_props, defaultPrice: v.default_price,
          currency: v.default_currency, moduleId: m.id, moduleKey: m.key, moduleName: m.name, blockType: m.block_type,
        };
      });
    },
    async insertItem(n) {
      const id = randomUUID();
      db().dossier_item.push({
        id, dossier_id: n.dossierId, module_version_id: n.moduleVersionId, position: n.position,
        visible: n.visible ?? true, price_override: n.priceOverride ?? null, prop_overrides: n.propOverrides ?? {},
      });
      touch(n.dossierId);
      return id;
    },
    async updateItem(id, p) {
      const i = db().dossier_item.find((x) => x.id === id);
      if (!i) return false;
      if (p.position !== undefined) i.position = p.position;
      if (p.visible !== undefined) i.visible = p.visible;
      if (p.priceOverride !== undefined) i.price_override = p.priceOverride;
      if (p.propOverrides !== undefined) i.prop_overrides = p.propOverrides;
      if (p.moduleVersionId !== undefined) i.module_version_id = p.moduleVersionId;
      touch(i.dossier_id);
      return true;
    },
    async updateItemPositions(updates) {
      for (const u of updates) {
        const i = db().dossier_item.find((x) => x.id === u.id);
        if (i) i.position = u.position;
      }
    },
    async deleteItem(id) {
      const s = db();
      const it = s.dossier_item.find((x) => x.id === id);
      if (!it) return false;
      s.dossier_item = s.dossier_item.filter((x) => x.id !== id);
      touch(it.dossier_id);
      return true;
    },

    async listCatalog(tenantId) {
      const s = db();
      return s.module
        .filter((m) => m.tenant_id === tenantId && m.is_catalog)
        .flatMap((m) => s.module_version
          .filter((v) => v.module_id === m.id && v.status === 'published')
          .map((v): CatalogVersion => ({
            moduleId: m.id, moduleKey: m.key, moduleName: m.name, description: m.description, blockType: m.block_type,
            versionId: v.id, version: v.version, defaultPrice: v.default_price, currency: v.default_currency,
          })));
    },

    async listLinks(dossierIds) {
      return db().share_link.filter((l) => dossierIds.includes(l.dossier_id)).map(toLink);
    },
    async insertLink(dossierId, expiresAt) {
      const row: ShareLinkRow = {
        id: randomUUID(), dossier_id: dossierId, token: newToken(), is_active: true, expires_at: expiresAt,
        created_at: new Date().toISOString(), revoked_at: null,
      };
      db().share_link.push(row);
      return toLink(row);
    },
    async revokeLink(id) {
      const l = db().share_link.find((x) => x.id === id);
      if (!l) return false;
      l.is_active = false;
      l.revoked_at = new Date().toISOString();
      return true;
    },
  };
}
