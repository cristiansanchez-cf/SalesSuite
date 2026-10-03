import type { APIRoute } from 'astro';
import { configProblems, appMode } from '~/lib/mode';
import { env } from '~/lib/env';

/**
 * Salud para el balanceador y para diagnosticar la configuración tras desplegar.
 * Nunca devuelve valores de secretos: solo si están presentes.
 */
export const GET: APIRoute = async () => {
  const mode = appMode();
  let database: 'ok' | 'error' | 'skipped' = 'skipped';
  if (mode === 'supabase') {
    try {
      const { publicRepository } = await import('~/lib/data');
      await publicRepository().resolveTenantBySlug('__healthcheck__');
      database = 'ok';
    } catch {
      database = 'error';
    }
  }
  const body = {
    status: mode === 'misconfigured' || database === 'error' ? 'degraded' : 'ok',
    mode,
    database,
    problems: configProblems().filter(() => mode !== 'demo'),
    serviceRoleConfigured: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    emailConfigured: Boolean(env('RESEND_API_KEY') && env('RESEND_FROM')),
    cronConfigured: Boolean(env('CRON_SECRET')),
    version: env('APP_VERSION') ?? 'dev',
  };
  return Response.json(body, { status: body.status === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } });
};
