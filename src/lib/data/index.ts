import type { PublicDossier, TenantContext } from '../types';
import { demoRepository } from './demo';
import { supabaseRepository, supabaseConfigured } from './supabase';

/** Lecturas públicas (sin sesión): resolución de tenant y render de dossier por token. */
export interface PublicRepository {
  mode: 'supabase' | 'demo';
  resolveTenantByHost(host: string): Promise<TenantContext | null>;
  resolveTenantBySlug(slug: string): Promise<TenantContext | null>;
  /** null ⇔ 404 (token inexistente, revocado, expirado, dossier no publicado o de otro tenant). */
  getPublicDossier(token: string, tenantId: string): Promise<PublicDossier | null>;
}

let repo: PublicRepository | undefined;

export function publicRepository(): PublicRepository {
  repo ??= supabaseConfigured() ? supabaseRepository() : demoRepository();
  return repo;
}
