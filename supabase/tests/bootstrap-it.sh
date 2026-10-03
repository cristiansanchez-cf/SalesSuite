#!/usr/bin/env bash
# Prueba del script de alta contra PostgREST local (lo llama run-it.sh con el entorno levantado).
set -euo pipefail
DB_URL="$1"; API="$2"; SECRET="$3"
KEY=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'service_role',exp:Math.floor(Date.now()/1000)+3600});
console.log(h+'.'+c.createHmac('sha256',process.argv[1]).update(h).digest('base64url'))" "$SECRET")
FIX=supabase/tests/tenant-fixture/tenant.json
BK=$(mktemp)
cp "$FIX" "$BK"
trap 'cp "$BK" "$FIX"; rm -f "$BK"' EXIT   # el JSON de prueba siempre vuelve a su estado original
restore() { cp "$BK" "$FIX"; }
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
restore
check "$(q "select max(version) from public.module_version v join public.module m on m.id=v.module_id where m.tenant_id='$T' and m.key='hero'")" "2" "cambio de contenido → v2 publicada"

# dominio de otro tenant → error
sed -i 's/acme-it.cofundo.app/enjoy.cofundo.app/' "$FIX"
if run > /dev/null 2>&1; then echo "FAIL: robar dominio de otro tenant"; exit 1; fi
restore
echo "ok: no se puede asignar un dominio de otro tenant"

# playbook importado
check "$(q "select count(*) from public.play where tenant_id='$T'")" "2" "playbook importado (2 jugadas)"
check "$(q "select technique_refs->0->>'id' from public.play where tenant_id='$T' and key='obj-precio'")" "707" "referencia al Cerebro importada"
check "$(q "select count(*) from public.play_revision where tenant_id='$T'")" "2" "revisión inicial por jugada"
run > /dev/null
check "$(q "select max(version) from public.play where tenant_id='$T'")" "1" "idempotente: reimportar sin cambios no versiona"
sed -i 's/Pregunta con qué lo comparan./Pregunta con qué lo comparan y calla./' "$FIX"
run > /dev/null
restore
check "$(q "select version from public.play where tenant_id='$T' and key='obj-precio'")" "2" "cambio de texto → v2 con revisión"

# mapa de mercado importado
check "$(q "select count(*) from public.segment where tenant_id='$T'")" "1" "sector importado"
check "$(q "select role || '|' || array_to_string(objections, ',') from public.persona where tenant_id='$T' and key='jefe-tienda'")" "guardian|tiempo" "actor con papel y objeciones"
check "$(q "select angle from public.persona_module pm join public.persona p on p.id=pm.persona_id where p.key='jefe-tienda'")" "Montaje en 10 minutos" "ángulo módulo↔actor"
check "$(q "select priority from public.segment_module sm join public.segment s on s.id=sm.segment_id where s.key='retail'")" "1" "encaje módulo↔sector"
check "$(q "select array_to_string(personas, ',') from public.play where tenant_id='$T' and key='obj-precio'")" "jefe-tienda" "jugada dirigida a un actor"
run > /dev/null
check "$(q "select count(*) from public.persona_module pm join public.persona p on p.id=pm.persona_id where p.tenant_id='$T'")" "1" "reimportar no duplica ángulos"
