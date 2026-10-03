#!/usr/bin/env bash
# Tests de integración del servicio admin contra Postgres + PostgREST + RLS reales
# (lo mismo que Supabase usa por debajo), con supabase-js y JWTs firmados por usuario.
# Requiere: psql, un Postgres accesible y el binario de PostgREST (POSTGREST_BIN).
set -euo pipefail
cd "$(dirname "$0")/../.."
ADMIN_URL="${ADMIN_DATABASE_URL:-postgres:///postgres}"
DB="${IT_DB:-salessuite_it}"
PGRST="${POSTGREST_BIN:-postgrest}"
SECRET="it-secret-it-secret-it-secret-0123456789"   # solo tests (>=32 chars)
PGHOST_URI="${IT_DB_URI_BASE:-postgres://authenticator:authenticator@127.0.0.1:5432}"

psql "$ADMIN_URL" -qc "drop database if exists $DB" -c "create database $DB"
DB_URL="${IT_DATABASE_URL:-postgres:///$DB}"
run() { psql "$DB_URL" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$1"; }
run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/tests/10_grants.sql
run supabase/seed.sql
run supabase/tests/30_it_users.sql
psql "$ADMIN_URL" -qc "do \$\$ begin
  if not exists (select from pg_roles where rolname='authenticator') then
    create role authenticator login password 'authenticator' noinherit; end if; end \$\$;" \
  -c "grant anon, authenticated, service_role to authenticator"

PGRST_DB_URI="$PGHOST_URI/$DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=crit \
  "$PGRST" > /tmp/postgrest-it.log 2>&1 &
PG_PID=$!
POSTGREST_URL=http://127.0.0.1:3000 PROXY_PORT=54321 node supabase/tests/it-proxy.mjs > /tmp/proxy-it.log 2>&1 &
PX_PID=$!
trap 'kill $PG_PID $PX_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf http://127.0.0.1:3000/ >/dev/null && break; sleep 0.2; done

SUPABASE_IT_URL=http://127.0.0.1:54321 SUPABASE_IT_JWT_SECRET="$SECRET" SUPABASE_IT_DB_URL="$DB_URL" \
  npx vitest run --no-file-parallelism src/lib/admin/service.supabase.test.ts src/lib/playbook/playbook.supabase.test.ts src/lib/partner/partner.supabase.test.ts

# Script de alta de tenants (service role) contra la misma API.
bash supabase/tests/bootstrap-it.sh "$DB_URL" http://127.0.0.1:54321 "$SECRET"
