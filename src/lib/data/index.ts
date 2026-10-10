import type { PublicDossier, TenantContext } from '../types';
import { demoRepository } from './demo';
import { appMode } from '../mode';
import { supabaseRepository } from './supabase';

/** Lecturas públicas (sin sesión): resolución de tenant y render de dossier por token. */
export interface PublicRepository {
  mode: 'supabase' | 'demo';
  resolveTenantByHost(host: string): Promise<TenantContext | null>;
  resolveTenantBySlug(slug: string): Promise<TenantContext | null>;
  /** null ⇔ 404 (token inexistente, revocado, expirado, dossier no publicado o de otro tenant). */
  getPublicDossier(token: string, tenantId: string): Promise<PublicDossier | null>;
  /**
   * Propuesta en otro idioma (docs/I18N.md §Contenido): textos traducidos de sus módulos por huella del original
   * (source_hash → ruta → texto). Vacío si el espacio no traduce al idioma de la propuesta o el enlace no vale.
   */
  getPublicContentI18n(token: string, tenantId: string): Promise<Record<string, Record<string, string>>>;
  /** Contacto de quien hizo la propuesta (docs/PERSONALIZE.md §Contacto del comercial); null si no lo ha puesto o el enlace no vale. */
  getPublicContact(token: string, tenantId: string): Promise<import('../contact').RepContact | null>;
  /** Registra (o amplía) una visita al enlace público. false = enlace no válido o límite superado. */
  trackView(token: string, tenantId: string, input: import('../analytics/types').TrackInput): Promise<boolean>;
}

let repo: PublicRepository | undefined;

/** El middleware corta antes con 503 si appMode() === 'misconfigured'. */
export function publicRepository(): PublicRepository {
  const mode = appMode();
  if (mode === 'misconfigured') throw new Error('Configuración incompleta: ver /api/health');
  if (repo?.mode !== mode) repo = mode === 'supabase' ? supabaseRepository() : demoRepository();
  return repo;
}
