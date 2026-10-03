/** Contrato del playbook contra Postgres + PostgREST + RLS (npm run db:it). */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, test } from 'vitest';
import { supabaseAdminDb } from '../admin/db-supabase';
import { supabasePlaybookDb } from './db-supabase';
import { playbookContract } from './playbook.contract';

const URL = process.env.SUPABASE_IT_URL;
const SECRET = process.env.SUPABASE_IT_JWT_SECRET;
const DB_URL = process.env.SUPABASE_IT_DB_URL;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims: Record<string, unknown>): string {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${head}.${createHmac('sha256', SECRET!).update(head).digest('base64url')}`;
}
const client = (userId: string) => createClient(URL!, jwt({ role: 'anon' }), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${jwt({ role: 'authenticated', sub: userId })}` } },
});

if (!URL || !SECRET || !DB_URL) {
  describe.skip('playbook · supabase (sin entorno de integración)', () => { test('skip', () => {}); });
} else {
  playbookContract('supabase (Postgres + PostgREST + RLS)', () => ({
    enforcesRls: true,
    async reset() {
      execFileSync('psql', [DB_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-o', '/dev/null',
        '-c', 'truncate public.tenant cascade', '-f', 'supabase/seed.sql', '-f', 'supabase/tests/30_it_users.sql'],
      { env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
    },
    adminDbFor: (u) => supabaseAdminDb(client(u)),
    playbookDbFor: (u) => supabasePlaybookDb(client(u)),
  }));
}
