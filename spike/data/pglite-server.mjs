// SPIKE (docs/SPIKE_DATA.md): PGlite servido por el protocolo de Postgres (pglite-socket),
// para que el PostgREST de verdad (y psql) se conecten a él sin instalar Postgres.
// Uso: PGLITE_PORT=55432 node spike/data/pglite-server.mjs [--it-users]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { bootPglite } from './pglite-apply.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const t0 = performance.now();
const db = await bootPglite({ log: () => {} });
// PostgREST entra como "authenticator" y cambia de rol por petición (como en Supabase).
await db.exec(`do $$ begin
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login password 'authenticator' noinherit; end if; end $$;
  grant anon, authenticated, service_role to authenticator;`);
if (process.argv.includes('--it-users')) await db.exec(readFileSync(join(ROOT, 'supabase/tests/30_it_users.sql'), 'utf8'));

const port = Number(process.env.PGLITE_PORT || 55432);
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: Number(process.env.PGLITE_MAX_CONN || 10) });
await server.start();
console.log(`pglite escuchando en 127.0.0.1:${port} (${Math.round(performance.now() - t0)} ms, rss ${Math.round(process.memoryUsage().rss / 1048576)} MB)`);
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
