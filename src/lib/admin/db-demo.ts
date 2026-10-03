import { randomBytes, randomUUID } from 'node:crypto';
import { demoDb, type DemoDb, type DossierRow, type PartnerAccountRow, type PartnerProfileRow, type ShareLinkRow } from '../data/store';
import type { AdminDb, AssetStore, Identity } from './db';
import type { CatalogVersion, DossierRecord, ItemRecord, LinkRecord, ModuleRecord, ModuleVersionRecord, PartnerAccount, PartnerProfile } from './types';
import { demoEmitMembership } from '../notify/db-demo';
import { demoAccountsOnDossier } from '../accounts/db-demo';
import { demoApplyCoupon, demoStripe } from '../commissions/db-demo';

export const newToken = () => randomBytes(24).toString('base64url');

const toDossier = (r: DossierRow): DossierRecord => ({
  id: r.id, tenantId: r.tenant_id, authorId: r.author_id, title: r.title,
  prospectName: r.prospect_name, prospectCompany: r.prospect_company, status: r.status, locale: r.locale,
  priceMode: r.price_mode, totalPrice: r.total_price, currency: r.currency,
  publishedAt: r.published_at ?? null, updatedAt: r.updated_at ?? null,
  outcome: r.outcome ?? 'open', outcomeNote: r.outcome_note ?? null, outcomeAt: r.outcome_at ?? null,
  segmentId: r.segment_id ?? null, nextStep: r.next_step ?? null, nextStepAt: r.next_step_at ?? null,
  partnerAccountId: r.partner_account_id ?? null,
  situation: r.situation ?? {},
  accountId: r.account_id ?? null,
  accountEligibility: (r.account_eligibility as DossierRecord['accountEligibility']) ?? null,
  accountDecision: r.account_decision ?? null,
  accountDecidedAt: r.account_decided_at ?? null,
  couponId: r.coupon_id ?? null,
  discount: r.discount ?? null,
  viewMode: r.view_mode ?? 'live',
  priceOptionId: r.price_option_id ?? null,
  clientMedia: r.client_media ?? {},
});

const toProfile = (r: PartnerProfileRow): PartnerProfile => ({
  tenantId: r.tenant_id, userId: r.user_id, moduleIds: [...r.module_ids], seeTeamTips: r.see_team_tips, welcomeNote: r.welcome_note, expiresAt: r.expires_at,
  canInvite: r.can_invite ?? false,
});
const toAccount = (r: PartnerAccountRow): PartnerAccount => ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id, name: r.name, segmentId: r.segment_id, pricePolicy: r.price_policy,
  priceAdjustPct: r.price_adjust_pct, notes: r.notes, position: r.position,
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
        theme_override: null, published_at: null, created_at: now, updated_at: now, partner_account_id: n.partnerAccountId ?? null,
        account_id: n.accountId ?? null, view_mode: 'test',
      };
      demoAccountsOnDossier(null, row);
      db().dossier.push(row);
      return toDossier(row);
    },
    async updateDossier(id, p) {
      const d = db().dossier.find((x) => x.id === id);
      if (!d) return null;
      const prev = { ...d };
      if (p.title !== undefined) d.title = p.title;
      if (p.prospectName !== undefined) d.prospect_name = p.prospectName;
      if (p.prospectCompany !== undefined) d.prospect_company = p.prospectCompany;
      if (p.locale !== undefined) d.locale = p.locale;
      if (p.priceMode !== undefined) d.price_mode = p.priceMode;
      if (p.totalPrice !== undefined) d.total_price = p.totalPrice;
      if (p.currency !== undefined) d.currency = p.currency;
      if (p.status !== undefined) d.status = p.status;
      if (p.publishedAt !== undefined) d.published_at = p.publishedAt;
      if (p.outcome !== undefined) d.outcome = p.outcome;
      if (p.outcomeNote !== undefined) d.outcome_note = p.outcomeNote;
      if (p.outcomeAt !== undefined) d.outcome_at = p.outcomeAt;
      if (p.segmentId !== undefined) d.segment_id = p.segmentId;
      if (p.nextStep !== undefined) d.next_step = p.nextStep;
      if (p.nextStepAt !== undefined) d.next_step_at = p.nextStepAt;
      if (p.situation !== undefined) d.situation = p.situation;
      if (p.accountId !== undefined) d.account_id = p.accountId;
      if (p.viewMode !== undefined) d.view_mode = p.viewMode;
      if (p.priceOptionId !== undefined) d.price_option_id = p.priceOptionId;
      if (p.clientMedia !== undefined) d.client_media = p.clientMedia;
      if (p.couponId !== undefined) demoApplyCoupon(d, p.couponId);  // = trigger dossier_coupon_apply
      demoAccountsOnDossier(prev, d);
      d.updated_at = new Date().toISOString();
      return toDossier(d);
    },
    async deleteDossier(id) {
      const s = db();
      const before = s.dossier.length;
      s.dossier = s.dossier.filter((d) => d.id !== id);
      s.dossier_item = s.dossier_item.filter((i) => i.dossier_id !== id);
      s.share_link = s.share_link.filter((l) => l.dossier_id !== id);
      s.dossier_contact = s.dossier_contact.filter((c) => c.dossier_id !== id);
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

    async listPriceOptions(tenantId) {
      return db().price_option.filter((o) => o.tenant_id === tenantId)
        .map((o) => ({ id: o.id, label: o.label, amount: o.amount, currency: o.currency, period: o.period, paymentLink: o.payment_link, segmentId: o.segment_id, position: o.position, active: o.active, kind: o.kind ?? null, isDefault: !!o.is_default }))
        .sort((a, b) => a.position - b.position || a.amount - b.amount);
    },
    async stripeWebhookStatus(tenantId) { return demoStripe.secrets.get(tenantId)?.at ?? null; },
    async setStripeWebhookSecret(tenantId, secret) {
      if (secret) demoStripe.secrets.set(tenantId, { secret, at: new Date().toISOString() }); else demoStripe.secrets.delete(tenantId);
    },
    async savePriceOption(tenantId, o, id) {
      const s = db();
      const row = { id: id ?? randomUUID(), tenant_id: tenantId, label: o.label, amount: o.amount, currency: o.currency, period: o.period, payment_link: o.paymentLink, segment_id: o.segmentId, position: o.position, active: o.active, kind: o.kind ?? null, is_default: !!o.isDefault };
      if (id && !s.price_option.some((x) => x.id === id && x.tenant_id === tenantId)) throw new Error('Tarifa no encontrada');
      s.price_option = [...s.price_option.filter((x) => x.id !== row.id), row];
      return row.id;
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

    // ---- cuenta del dossier
    async listContacts(ids) {
      return db().dossier_contact.filter((c) => ids.includes(c.dossier_id)).map((c) => ({
        id: c.id, dossierId: c.dossier_id, personaId: c.persona_id, name: c.name, stance: c.stance as 'aliado',
        email: c.email, phone: c.phone, notes: c.notes, position: Number(c.position), traits: c.traits ?? {},
      }));
    },
    async insertContact(dossierId, r) {
      const d = db().dossier.find((x) => x.id === dossierId)!;
      const id = randomUUID();
      db().dossier_contact.push({ id, tenant_id: d.tenant_id, dossier_id: dossierId, persona_id: r.personaId, name: r.name, stance: r.stance, email: r.email, phone: r.phone, notes: r.notes, position: r.position, traits: r.traits ?? {} });
      touch(dossierId);
      return id;
    },
    async updateContact(id, p) {
      const c = db().dossier_contact.find((x) => x.id === id);
      if (!c) return false;
      if (p.personaId !== undefined) c.persona_id = p.personaId;
      if (p.name !== undefined) c.name = p.name;
      if (p.stance !== undefined) c.stance = p.stance;
      if (p.email !== undefined) c.email = p.email;
      if (p.phone !== undefined) c.phone = p.phone;
      if (p.notes !== undefined) c.notes = p.notes;
      if (p.traits !== undefined) c.traits = p.traits;
      touch(c.dossier_id);
      return true;
    },
    async deleteContact(id) {
      const c = db().dossier_contact.find((x) => x.id === id);
      if (!c) return false;
      db().dossier_contact = db().dossier_contact.filter((x) => x.id !== id);
      touch(c.dossier_id);
      return true;
    },
    async segmentExists(t, id) { return db().segment.some((x) => x.tenant_id === t && x.id === id); },
    async personaExists(t, id) { return db().persona.some((x) => x.tenant_id === t && x.id === id); },

    // ---- gestión del tenant
    async getTenant(id) {
      const t = db().tenant.find((x) => x.id === id);
      return t ? { id: t.id, slug: t.slug, name: t.name, defaultLocale: t.default_locale, themeTokens: t.theme_tokens, brand: t.brand, tour: t.tour ?? [] } : null;
    },
    async updateTenant(id, p) {
      const t = db().tenant.find((x) => x.id === id);
      if (!t) return false;
      if (p.name !== undefined) t.name = p.name;
      if (p.defaultLocale !== undefined) t.default_locale = p.defaultLocale;
      if (p.themeTokens !== undefined) t.theme_tokens = p.themeTokens;
      if (p.brand !== undefined) t.brand = p.brand;
      return true;
    },

    async listMembers(tenantId) {
      return db().users.flatMap((u) => u.memberships
        .filter((m) => m.tenant_id === tenantId)
        .map((m) => ({ userId: u.id, email: u.email, displayName: u.display_name || null, role: m.role, invitedBy: m.invited_by ?? null, joinedAt: m.created_at ?? null, phone: u.phone ?? null })));
    },
    async addMember(tenantId, userId, role, inviter) {
      const u = db().users.find((x) => x.id === userId);
      if (!u || u.memberships.some((m) => m.tenant_id === tenantId)) return false;
      u.memberships.push({ tenant_id: tenantId, role, invited_by: inviter ?? null, created_at: new Date().toISOString() });
      demoEmitMembership(tenantId, userId, role, inviter);
      return true;
    },
    async setMemberRole(tenantId, userId, role) {
      const m = db().users.find((x) => x.id === userId)?.memberships.find((x) => x.tenant_id === tenantId);
      if (!m) return false;
      m.role = role;
      return true;
    },
    async removeMember(tenantId, userId) {
      const u = db().users.find((x) => x.id === userId);
      if (!u) return false;
      const before = u.memberships.length;
      u.memberships = u.memberships.filter((m) => m.tenant_id !== tenantId);
      // cascada membership → partner_profile → partner_account (dossier.partner_account_id → null)
      const s = db();
      const gone = new Set(s.partner_account.filter((a) => a.tenant_id === tenantId && a.user_id === userId).map((a) => a.id));
      s.partner_account = s.partner_account.filter((a) => !gone.has(a.id));
      s.partner_profile = s.partner_profile.filter((p) => !(p.tenant_id === tenantId && p.user_id === userId));
      for (const d of s.dossier) if (d.partner_account_id && gone.has(d.partner_account_id)) d.partner_account_id = null;
      return u.memberships.length < before;
    },

    async listModules(tenantId) {
      return db().module.filter((m) => m.tenant_id === tenantId).map((m): ModuleRecord => ({
        id: m.id, tenantId: m.tenant_id, key: m.key, blockType: m.block_type, name: m.name, description: m.description, isCatalog: m.is_catalog,
      }));
    },
    async listModuleVersions(tenantId) {
      const ids = new Set(db().module.filter((m) => m.tenant_id === tenantId).map((m) => m.id));
      return db().module_version.filter((v) => ids.has(v.module_id)).map((v): ModuleVersionRecord => ({
        id: v.id, moduleId: v.module_id, version: v.version, status: v.status,
        defaultProps: v.default_props, defaultPrice: v.default_price, currency: v.default_currency,
      }));
    },
    async versionUsage(tenantId) {
      const s = db();
      const dossiers = new Set(s.dossier.filter((d) => d.tenant_id === tenantId).map((d) => d.id));
      const out = new Map<string, number>();
      for (const i of s.dossier_item) if (dossiers.has(i.dossier_id)) out.set(i.module_version_id, (out.get(i.module_version_id) ?? 0) + 1);
      return out;
    },
    async insertModule(m) {
      const s = db();
      if (s.module.some((x) => x.tenant_id === m.tenantId && x.key === m.key)) throw new Error('duplicate key: module (tenant_id, key)');
      const id = randomUUID();
      s.module.push({ id, tenant_id: m.tenantId, key: m.key, block_type: m.blockType, name: m.name, description: m.description, is_catalog: m.isCatalog });
      return id;
    },
    async updateModule(id, p) {
      const m = db().module.find((x) => x.id === id);
      if (!m) return false;
      if (p.name !== undefined) m.name = p.name;
      if (p.description !== undefined) m.description = p.description;
      if (p.isCatalog !== undefined) m.is_catalog = p.isCatalog;
      return true;
    },
    async insertModuleVersion(v) {
      const s = db();
      if (s.module_version.some((x) => x.module_id === v.moduleId && x.version === v.version)) throw new Error('duplicate key: module_version (module_id, version)');
      const id = randomUUID();
      s.module_version.push({ id, module_id: v.moduleId, version: v.version, status: v.status, default_props: v.defaultProps, default_price: v.defaultPrice, default_currency: v.currency });
      return id;
    },
    async updateModuleVersion(id, p) {
      const v = db().module_version.find((x) => x.id === id);
      if (!v) return false;
      // Misma regla que el trigger module_version_immutable de Postgres.
      const contentChange = p.defaultProps !== undefined || p.defaultPrice !== undefined || p.currency !== undefined;
      if (v.status !== 'draft' && (contentChange || p.status === 'draft')) throw new Error('module_version ya no es draft: crea una versión nueva');
      if (p.defaultProps !== undefined) v.default_props = p.defaultProps;
      if (p.defaultPrice !== undefined) v.default_price = p.defaultPrice;
      if (p.currency !== undefined) v.default_currency = p.currency;
      if (p.status !== undefined) v.status = p.status;
      return true;
    },

    // ---- colaboradores
    async getPartnerProfile(tenantId, userId) {
      const r = db().partner_profile.find((x) => x.tenant_id === tenantId && x.user_id === userId);
      return r ? toProfile(r) : null;
    },
    async listPartnerProfiles(tenantId) {
      return db().partner_profile.filter((x) => x.tenant_id === tenantId).map(toProfile);
    },
    async upsertPartnerProfile(p) {
      const s = db();
      // Misma regla que el trigger partner_profile_check.
      const role = s.users.find((u) => u.id === p.userId)?.memberships.find((m) => m.tenant_id === p.tenantId)?.role;
      if (role !== 'partner') throw new Error('El perfil de colaborador requiere rol partner');
      const row: PartnerProfileRow = {
        tenant_id: p.tenantId, user_id: p.userId, module_ids: [...p.moduleIds], see_team_tips: p.seeTeamTips, welcome_note: p.welcomeNote, expires_at: p.expiresAt,
        can_invite: p.canInvite,
      };
      const i = s.partner_profile.findIndex((x) => x.tenant_id === p.tenantId && x.user_id === p.userId);
      if (i >= 0) s.partner_profile[i] = row; else s.partner_profile.push(row);
      return true;
    },
    async listPartnerAccounts(tenantId, userId) {
      return db().partner_account.filter((x) => x.tenant_id === tenantId && (!userId || x.user_id === userId)).map(toAccount);
    },
    async savePartnerAccount(a) {
      const s = db();
      if (!s.partner_profile.some((x) => x.tenant_id === a.tenantId && x.user_id === a.userId)) throw new Error('violates foreign key: partner_account → partner_profile');
      const row: PartnerAccountRow = {
        id: a.id ?? randomUUID(), tenant_id: a.tenantId, user_id: a.userId, name: a.name, segment_id: a.segmentId,
        price_policy: a.pricePolicy, price_adjust_pct: a.priceAdjustPct, notes: a.notes, position: a.position,
      };
      const i = s.partner_account.findIndex((x) => x.id === row.id);
      if (i >= 0) s.partner_account[i] = row; else s.partner_account.push(row);
      return row.id;
    },
    async partnerInvitePartner(tenantId, inviterId, userId) {
      // Misma regla que la RPC public.partner_invite_partner.
      const s = db();
      const me = s.partner_profile.find((x) => x.tenant_id === tenantId && x.user_id === inviterId);
      if (!me?.can_invite) throw new Error('No tienes permiso para invitar colaboradores');
      const u = s.users.find((x) => x.id === userId);
      if (!u || u.memberships.some((m) => m.tenant_id === tenantId)) throw new Error('duplicate key: Esa persona ya tiene acceso');
      u.memberships.push({ tenant_id: tenantId, role: 'partner', invited_by: inviterId, created_at: new Date().toISOString() });
      demoEmitMembership(tenantId, userId, 'partner', inviterId);
      s.partner_profile.push({ tenant_id: tenantId, user_id: userId, module_ids: [...me.module_ids], see_team_tips: false, welcome_note: null, expires_at: me.expires_at, can_invite: false });
    },
    async deletePartnerAccount(id) {
      const s = db();
      const before = s.partner_account.length;
      s.partner_account = s.partner_account.filter((x) => x.id !== id);
      for (const d of s.dossier) if (d.partner_account_id === id) d.partner_account_id = null;  // on delete set null
      return s.partner_account.length < before;
    },
  };
}

/** Invitaciones en demo: crea el usuario en memoria (aparece en el selector de login). */
export function demoIdentity(getDb: () => DemoDb = demoDb): Identity {
  return {
    async findOrInvite(email) {
      const e = email.trim().toLowerCase();
      const found = getDb().users.find((u) => u.email.toLowerCase() === e);
      if (found) return { userId: found.id, invited: false };
      const id = randomUUID();
      getDb().users.push({ id, email: e, display_name: '', memberships: [] });
      return { userId: id, invited: true };
    },
  };
}

/**
 * En demo no hay Storage: la marca usa URLs; lo personalizado de una propuesta (logo, fotos, vídeo) va a memoria
 * y se sirve en /demo-media/<clave> (solo en modo demo; se pierde al reiniciar, como todo lo demás).
 */
const DEMO_MEDIA = new Map<string, { type: string; bytes: Uint8Array }>();
let demoMediaBytes = 0;
export function demoMediaGet(key: string) { return DEMO_MEDIA.get(key) ?? null; }
export function demoMediaPut(key: string, type: string, bytes: Uint8Array): boolean {
  if (!/^[a-z0-9-]{8,80}$/.test(key) || !DEMO_MEDIA.has(key) || DEMO_MEDIA.get(key)!.type !== type) return false;
  if (demoMediaBytes + bytes.length > 200 * 1024 * 1024) return false;
  demoMediaBytes += bytes.length;
  DEMO_MEDIA.set(key, { type, bytes });
  return true;
}
export const demoAssets: AssetStore = {
  async upload() {
    throw new Error('DEMO_NO_STORAGE');
  },
  async signUpload(_tenantId, _path, type) {
    const key = randomUUID();
    DEMO_MEDIA.set(key, { type, bytes: new Uint8Array() });
    return { uploadUrl: `/demo-media/${key}`, publicUrl: `/demo-media/${key}` };
  },
  publicPrefix() { return '/demo-media/'; },
};
