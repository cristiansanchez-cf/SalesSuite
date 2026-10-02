#!/usr/bin/env bash
# Valida migraciones + seed + RLS en un Postgres pelado (sin Supabase CLI).
# Uso: DATABASE_URL=postgres://… npm run db:test   (por defecto: base local "salessuite_test")
set -euo pipefail
cd "$(dirname "$0")/../.."
ADMIN_URL="${ADMIN_DATABASE_URL:-postgres:///postgres}"
DB="${TEST_DB:-salessuite_test}"
psql "$ADMIN_URL" -qc "drop database if exists $DB" -c "create database $DB"
URL="${DATABASE_URL:-postgres:///$DB}"
run() { psql "$URL" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$1"; }
run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/tests/10_grants.sql
run supabase/seed.sql
run supabase/tests/20_rls.test.sql
run supabase/tests/25_brand_team_storage.test.sql
echo "OK: migraciones + seed + aserciones RLS/RPC"
