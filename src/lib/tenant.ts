import type { TenantContext } from './types';
import type { PublicRepository } from './data';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: TenantContext | null }>();

export function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Host → tenant (tabla `domain`). Fallback a DEV_TENANT_SLUG solo para hosts locales,
 * nunca para un dominio público no mapeado (eso sería servir la marca equivocada).
 */
export async function resolveTenant(
  repo: PublicRepository,
  rawHost: string,
  opts: { devTenantSlug?: string; now?: number } = {},
): Promise<TenantContext | null> {
  const host = normalizeHost(rawHost);
  const now = opts.now ?? Date.now();
  const hit = cache.get(host);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  let value = host ? await repo.resolveTenantByHost(host) : null;
  if (!value && opts.devTenantSlug && LOCAL_HOSTS.has(host)) value = await repo.resolveTenantBySlug(opts.devTenantSlug);

  cache.set(host, { at: now, value });
  return value;
}

export function clearTenantCache(): void {
  cache.clear();
}
