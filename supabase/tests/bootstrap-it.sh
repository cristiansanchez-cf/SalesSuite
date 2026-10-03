#!/usr/bin/env bash
# Prueba del script de alta contra PostgREST local (lo llama run-it.sh con el entorno levantado).
set -euo pipefail
DB_URL="$1"; API="$2"; SECRET="$3"
KEY=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'service_role',exp:Math.floor(Date.now()/1000)+3600});
console.log(h+'.'+c.createHmac('sha256',process.argv[1]).update(h).digest('base64url'))" "$SECRET")
q() { psql "$DB_URL" -Atqc "$1"; }
run() { PUBLIC_SUPABASE_URL="$API" SUPABASE_SERVICE_ROLE_KEY="$KEY" npx tsx scripts/tenant-bootstrap.ts supabase/tests/tenant-fixture --skip-assets --skip-invites "$@"; }
check() { [ "$1" = "$2" ] && echo "ok: $3" || { echo "FAIL: $3 (esperado '$2', obtenido '$1')"; exit 1; }; }

run > /dev/null
T=$(q "select id from public.tenant where slug='acme-it'")
check "$(q "select count(*) from public.domain where tenant_id='$T'")" "2" "2 dominios"
check "$(q "select hostname from public.domain where tenant_id='$T' and is_primary")" "pitch.acme-it.test" "dominio primario"
check "$(q "select count(*) from public.module_version where tenant_id='$T' and status='published'")" "2" "2 módulos publicados"
check "$(q "select theme_tokens->'colors'->>'primary' from public.tenant where id='$T'")" "#123456" "tema"
check "$(q "select brand->>'logoUrl' from public.tenant where id='$T'")" "$API/storage/v1/object/public/tenant-assets/$T/brand/logo.svg" "logo con URL de Storage"
check "$(q "select role from public.membership m join public.users u on u.id=m.user_id where u.email='rep@enjoy.test' and m.tenant_id='$T'")" "admin" "usuario existente → admin"
check "$(q "select count(*) from public.membership where tenant_id='$T'")" "1" "sin cuenta + --skip-invites → no se crea membership"

run > /dev/null
check "$(q "select count(*) from public.module_version where tenant_id='$T'")" "2" "idempotente: 2ª ejecución no crea versiones"

sed -i 's/"Hola {company}"/"Hola de nuevo {company}"/' supabase/tests/tenant-fixture/tenant.json
run > /dev/null
git checkout -q supabase/tests/tenant-fixture/tenant.json 2>/dev/null || sed -i 's/"Hola de nuevo {company}"/"Hola {company}"/' supabase/tests/tenant-fixture/tenant.json
check "$(q "select max(version) from public.module_version v join public.module m on m.id=v.module_id where m.tenant_id='$T' and m.key='hero'")" "2" "cambio de contenido → v2 publicada"

# dominio de otro tenant → error
cp supabase/tests/tenant-fixture/tenant.json /tmp/tenant-it.json
sed -i 's/acme-it.cofundo.app/enjoy.cofundo.app/' supabase/tests/tenant-fixture/tenant.json
if run > /dev/null 2>&1; then echo "FAIL: robar dominio de otro tenant"; cp /tmp/tenant-it.json supabase/tests/tenant-fixture/tenant.json; exit 1; fi
cp /tmp/tenant-it.json supabase/tests/tenant-fixture/tenant.json
echo "ok: no se puede asignar un dominio de otro tenant"
