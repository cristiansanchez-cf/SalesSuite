import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicRepository } from './index';
import { toPublicDossier, toTenant, type PublicDossierRow, type TenantRow } from './mappers';

import { env } from '../env';

const url = () => env('PUBLIC_SUPABASE_URL');
const anon = () => env('PUBLIC_SUPABASE_ANON_KEY');

/** Solo indica si hay credenciales; para decidir el modo usar appMode() (src/lib/mode.ts). */
export const supabaseConfigured = () => Boolean(url() && anon());

/**
 * El renderer público usa la clave ANON y solo puede llamar a los RPC security-definer
 * public.resolve_tenant / public.get_public_dossier (las tablas están cerradas a anon por RLS).
 * No hace falta service-role en el camino público.
 */
export function supabaseRepository(): PublicRepository {
  const client: SupabaseClient = createClient(url()!, anon()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenant = async (args: { p_host?: string; p_slug?: string }) => {
    const { data, error } = await client.rpc('resolve_tenant', { p_host: args.p_host ?? null, p_slug: args.p_slug ?? null });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as TenantRow | null;
    return row ? toTenant(row) : null;
  };

  return {
    mode: 'supabase',
    resolveTenantByHost: (host) => tenant({ p_host: host }),
    resolveTenantBySlug: (slug) => tenant({ p_slug: slug }),
    async getPublicDossier(token, tenantId) {
      const { data, error } = await client.rpc('get_public_dossier', { p_token: token, p_tenant_id: tenantId });
      if (error) throw error;
      return data ? toPublicDossier(data as PublicDossierRow) : null;
    },
    async trackView(token, tenantId, i) {
      const base = {
        p_token: token, p_tenant_id: tenantId, p_view: i.viewId, p_visitor: i.visitor, p_device: i.device,
        p_duration_ms: i.durationMs, p_scroll: i.scroll, p_sections: i.sections,
      };
      let { data, error } = await client.rpc('track_dossier_view', { ...base, p_ip_hash: i.ipHash ?? null, p_member: i.member ?? false });
      // Antes de la migración 20261021 la función no tiene los dos últimos parámetros.
      if (error && /track_dossier_view/.test(error.message)) ({ data, error } = await client.rpc('track_dossier_view', base));
      if (error) throw error;
      return data === true;
    },
  };
}
