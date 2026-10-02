/**
 * Contrato del servicio contra Postgres + PostgREST + RLS reales vía supabase-js.
 * Se ejecuta con `npm run db:it` (supabase/tests/run-it.sh); sin esas env se omite.
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, test } from 'vitest';
import { supabaseAdminDb } from './db-supabase';
import { serviceContract } from './service.contract';
import { toPublicDossier, type PublicDossierRow } from '../data/mappers';

const URL = process.env.SUPABASE_IT_URL;
const SECRET = process.env.SUPABASE_IT_JWT_SECRET;
const DB_URL = process.env.SUPABASE_IT_DB_URL;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims: Record<string, unknown>): string {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${head}.${createHmac('sha256', SECRET!).update(head).digest('base64url')}`;
}
const client = (token: string) => createClient(URL!, jwt({ role: 'anon' }), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

if (!URL || !SECRET || !DB_URL) {
  describe.skip('servicio admin · supabase (sin entorno de integración)', () => { test('skip', () => {}); });
} else {
  serviceContract('supabase (Postgres + PostgREST + RLS)', () => ({
    enforcesRls: true,
    async reset() {
      execFileSync('psql', [DB_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-o', '/dev/null',
        '-c', 'truncate public.tenant cascade', '-f', 'supabase/seed.sql', '-f', 'supabase/tests/30_it_users.sql'], { env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
    },
    dbFor: (userId) => supabaseAdminDb(client(jwt({ role: 'authenticated', sub: userId }))),
    async publicGet(token, tenantId) {
      const { data, error } = await client(jwt({ role: 'anon' })).rpc('get_public_dossier', { p_token: token, p_tenant_id: tenantId });
      if (error) throw error;
      return data ? toPublicDossier(data as PublicDossierRow) : null;
    },
  }));
}
