/**
 * Modo DEMO: sin Supabase configurado, la app sirve los datos de supabase/seed/fixtures.json
 * aplicando EXACTAMENTE los mismos gates que el RPC public.get_public_dossier.
 * Sirve para desarrollo local y para el plan de verificación sin infraestructura.
 */
import { trackDemoView } from '../analytics/db-demo';
import type { PublicRepository } from './index';
import { toPublicDossier, toTenant, type PublicDossierRow } from './mappers';
import { demoDb, type DemoDb } from './store';

export function getPublicDossierFromRows(db: Pick<DemoDb, 'share_link' | 'dossier' | 'dossier_item' | 'module_version' | 'module'>, token: string, tenantId: string, now = new Date()): PublicDossierRow | null {
  const link = db.share_link.find((l) => l.token === token);
  if (!link || !link.is_active || (link.expires_at && new Date(link.expires_at) <= now)) return null;
  const d = db.dossier.find((x) => x.id === link.dossier_id);
  if (!d || d.status !== 'published' || d.tenant_id !== tenantId) return null;

  const items = db.dossier_item
    .filter((i) => i.dossier_id === d.id && i.visible)
    .map((i) => {
      const mv = db.module_version.find((v) => v.id === i.module_version_id)!;
      const m = db.module.find((x) => x.id === mv.module_id)!;
      return {
        id: i.id, position: i.position, block_type: m.block_type, module_key: m.key,
        default_props: mv.default_props, prop_overrides: i.prop_overrides,
        default_price: mv.default_price, price_override: i.price_override, currency: mv.default_currency,
      };
    });

  return {
    id: d.id, tenant_id: d.tenant_id, title: d.title, prospect_name: d.prospect_name, prospect_company: d.prospect_company,
    locale: d.locale, price_mode: d.price_mode, total_price: d.total_price,
    currency: d.currency, theme_override: d.theme_override, discount: (d.discount as PublicDossierRow['discount']) ?? null, media: (d as { client_media?: PublicDossierRow['media'] }).client_media ?? {}, items,
  };
}

export function demoRepository(): PublicRepository {
  const tenants = () => demoDb().tenant.filter((t) => t.status === 'active');
  return {
    mode: 'demo',
    async resolveTenantByHost(host) {
      const dom = demoDb().domain.find((d) => d.hostname === host);
      const t = dom && tenants().find((x) => x.id === dom.tenant_id);
      return t ? toTenant(t) : null;
    },
    async resolveTenantBySlug(slug) {
      const t = tenants().find((x) => x.slug === slug);
      return t ? toTenant(t) : null;
    },
    async getPublicDossier(token, tenantId) {
      const row = getPublicDossierFromRows(demoDb(), token, tenantId);
      return row ? toPublicDossier(row) : null;
    },
    async trackView(token, tenantId, input) {
      return trackDemoView(token, tenantId, input);
    },
  };
}
