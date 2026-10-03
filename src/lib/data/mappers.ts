import { parseBrand } from '../brand';
import { parseTheme } from '../theme';
import type { PublicDossier, RenderItem, TenantContext } from '../types';

/** Filas snake_case (Postgres / fixtures) → modelos de la app. Compartido por demo y supabase. */
export interface TenantRow { id: string; slug: string; name: string; default_locale: string; theme_tokens: unknown; brand?: unknown }

export const toTenant = (r: TenantRow): TenantContext => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  defaultLocale: r.default_locale,
  themeTokens: parseTheme(r.theme_tokens),
  brand: parseBrand(r.brand),
});

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export interface PublicDossierRow {
  id: string; tenant_id: string; title: string; prospect_name: string | null; prospect_company: string | null;
  locale: string; price_mode: PublicDossier['priceMode']; total_price: number | string | null; currency: string;
  theme_override: unknown;
  discount?: PublicDossier['discount'];
  items: Array<{
    id: string; position: number | string; block_type: string; module_key: string;
    default_props: Record<string, unknown> | null; prop_overrides: Record<string, unknown> | null;
    default_price: number | string | null; price_override: number | string | null; currency: string;
  }>;
}

export const toPublicDossier = (r: PublicDossierRow): PublicDossier => ({
  id: r.id,
  tenantId: r.tenant_id,
  title: r.title,
  prospectName: r.prospect_name,
  prospectCompany: r.prospect_company,
  locale: r.locale,
  priceMode: r.price_mode,
  totalPrice: num(r.total_price),
  currency: r.currency,
  themeOverride: r.theme_override == null ? null : parseTheme(r.theme_override),
  discount: r.discount ?? null,
  items: r.items
    .map((i): RenderItem => ({
      id: i.id,
      position: Number(i.position),
      blockType: i.block_type,
      moduleKey: i.module_key,
      defaultProps: i.default_props ?? {},
      propOverrides: i.prop_overrides ?? {},
      defaultPrice: num(i.default_price),
      priceOverride: num(i.price_override),
      currency: i.currency,
    }))
    .sort((a, b) => a.position - b.position),
});
