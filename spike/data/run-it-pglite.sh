#!/usr/bin/env bash
# SPIKE (docs/SPIKE_DATA.md): los tests de integración de db:it, pero con PGlite (sin Postgres instalado)
# detrás del PostgREST de verdad. Requiere POSTGREST_BIN y `npm --prefix spike/data install`.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGRST="${POSTGREST_BIN:-postgrest}"
SECRET="it-secret-it-secret-it-secret-0123456789"
PORT="${PGLITE_PORT:-55432}"
LOG="${TMPDIR:-/tmp}/spike-data"; mkdir -p "$LOG"
DB_URL="postgres://postgres:postgres@127.0.0.1:$PORT/postgres?sslmode=disable"
T0=$(date +%s%N)
node spike/data/pglite-server.mjs --it-users > "$LOG/pglite.log" 2>&1 &
PGL=$!
trap 'kill $PGL ${PG_PID:-} ${PX_PID:-} 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do grep -q escuchando "$LOG/pglite.log" && break; sleep 0.1; done
cat "$LOG/pglite.log"
PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PORT/postgres?sslmode=disable" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn \
  PGRST_DB_POOL="${PGRST_POOL:-1}" PGRST_DB_CHANNEL_ENABLED=false PGRST_DB_PREPARED_STATEMENTS=false \
  "$PGRST" > "$LOG/postgrest.log" 2>&1 &
PG_PID=$!
POSTGREST_URL=http://127.0.0.1:3000 PROXY_PORT=54321 node supabase/tests/it-proxy.mjs > "$LOG/proxy.log" 2>&1 &
PX_PID=$!
for _ in $(seq 1 100); do curl -sf http://127.0.0.1:3000/ >/dev/null && break; sleep 0.1; done
echo "pila lista (PGlite + PostgREST + proxy) en $(( ($(date +%s%N) - T0) / 1000000 )) ms"
export PGSSLMODE=disable
SUPABASE_IT_URL=http://127.0.0.1:54321 SUPABASE_IT_JWT_SECRET="$SECRET" SUPABASE_IT_DB_URL="$DB_URL" \
  npx vitest run --no-file-parallelism ${IT_FILES:-src/lib/admin/service.supabase.test.ts src/lib/playbook/playbook.supabase.test.ts src/lib/partner/partner.supabase.test.ts src/lib/evidence/evidence.supabase.test.ts src/lib/notify/notify.supabase.test.ts src/lib/accounts/accounts.supabase.test.ts src/lib/commissions/commissions.supabase.test.ts}
