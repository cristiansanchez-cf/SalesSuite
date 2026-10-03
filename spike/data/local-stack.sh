#!/usr/bin/env bash
# SPIKE (docs/SPIKE_DATA.md): la app en modo "supabase" contra una pila LOCAL
#   base (Postgres local o PGlite) + PostgREST + gateway con auth mínimo.
# Uso: npm run build && BACKEND=postgres|pglite bash spike/data/local-stack.sh [comando…]
#   Sin comando, deja la app en :4321 hasta Ctrl+C. Con comando (p. ej. un smoke), lo ejecuta y apaga todo.
set -euo pipefail
cd "$(dirname "$0")/../.."
BACKEND="${BACKEND:-postgres}"
PGRST="${POSTGREST_BIN:-postgrest}"
SECRET="local-secret-local-secret-0123456789abcd"
LOG="${TMPDIR:-/tmp}/spike-data"; mkdir -p "$LOG"
PIDS=()
trap 'kill "${PIDS[@]}" 2>/dev/null || true' EXIT
ms() { echo $(( ($(date +%s%N) - T0) / 1000000 )); }
T0=$(date +%s%N)

if [ "$BACKEND" = pglite ]; then
  PORT=55432
  node spike/data/pglite-server.mjs --it-users > "$LOG/pglite.log" 2>&1 & PIDS+=($!)
  for _ in $(seq 1 100); do grep -q escuchando "$LOG/pglite.log" && break; sleep 0.1; done
  DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PORT/postgres?sslmode=disable"
  EXTRA="PGRST_DB_POOL=1 PGRST_DB_PREPARED_STATEMENTS=false PGRST_DB_CHANNEL_ENABLED=false"
else
  ADMIN_URL="${ADMIN_DATABASE_URL:-postgres:///postgres}"
  DB=salessuite_local
  psql "$ADMIN_URL" -qc "drop database if exists $DB" -c "create database $DB"
  run() { psql "postgres:///$DB" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$1"; }
  run supabase/tests/00_supabase_stub.sql
  for f in supabase/migrations/*.sql; do run "$f"; done
  run supabase/tests/10_grants.sql
  run supabase/seed.sql
  run supabase/tests/30_it_users.sql
  psql "$ADMIN_URL" -qc "do \$\$ begin if not exists (select from pg_roles where rolname='authenticator') then
    create role authenticator login password 'authenticator' noinherit; end if; end \$\$;" -c "grant anon, authenticated, service_role to authenticator"
  DB_URI="postgres://authenticator:authenticator@127.0.0.1:5432/$DB"
  EXTRA=""
fi
echo "base ($BACKEND) lista: $(ms) ms"

env $EXTRA PGRST_DB_URI="$DB_URI" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
  PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn "$PGRST" > "$LOG/postgrest.log" 2>&1 & PIDS+=($!)
JWT_SECRET="$SECRET" node spike/data/local-gateway.mjs > "$LOG/gateway.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 100); do curl -sf http://127.0.0.1:3000/ >/dev/null && grep -q ANON_KEY "$LOG/gateway.log" && break; sleep 0.1; done
ANON=$(sed -n 's/^ANON_KEY=//p' "$LOG/gateway.log")
echo "PostgREST + gateway listos: $(ms) ms"

PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 PUBLIC_SUPABASE_ANON_KEY="$ANON" DEV_TENANT_SLUG=enjoy HOST=127.0.0.1 PORT=4321 \
  node ./dist/server/entry.mjs > "$LOG/app.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 200); do curl -sf -o /dev/null http://127.0.0.1:4321/admin/login && break; sleep 0.05; done
echo "app (modo supabase, local) sirviendo /admin/login: $(ms) ms desde cero"
curl -s http://127.0.0.1:4321/api/health; echo

if [ $# -gt 0 ]; then "$@"; else wait; fi
