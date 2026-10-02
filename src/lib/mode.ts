import { env } from './env';

export type AppMode = 'supabase' | 'demo' | 'misconfigured';

/**
 * - supabase: PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY presentes.
 * - demo: sin Supabase, en desarrollo o con DEMO_MODE=1 explícito.
 * - misconfigured: build de producción sin Supabase y sin DEMO_MODE=1, o config a medias.
 *   El modo demo permite entrar como admin con un clic: jamás debe activarse por olvido.
 */
export function appMode(): AppMode {
  const url = env('PUBLIC_SUPABASE_URL');
  const anon = env('PUBLIC_SUPABASE_ANON_KEY');
  if (url && anon) return 'supabase';
  if (url || anon) return 'misconfigured';
  const prod = env('NODE_ENV') === 'production' || import.meta.env.PROD;
  return prod && env('DEMO_MODE') !== '1' ? 'misconfigured' : 'demo';
}

/** Problemas de configuración legibles (para /api/health y la página 503). Nunca incluye valores. */
export function configProblems(): string[] {
  const p: string[] = [];
  const url = env('PUBLIC_SUPABASE_URL');
  const anon = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!url && !anon) p.push('Faltan PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY (o DEMO_MODE=1 para una demo)');
  else if (!url) p.push('Falta PUBLIC_SUPABASE_URL');
  else if (!anon) p.push('Falta PUBLIC_SUPABASE_ANON_KEY');
  if (url && !/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) p.push('PUBLIC_SUPABASE_URL debe ser https');
  return p;
}
