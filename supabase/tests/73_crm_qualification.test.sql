-- Migración 20261204: la cualificación es del espacio (§45). Enjoy, la de ocio nocturno; los demás, ninguna.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- Las migraciones van antes del seed: aquí ya existe Enjoy. Se vuelve a pasar (dos veces: no rompe ni duplica).
update public.crm_settings set qualification = null where tenant_id = '00000000-0000-4000-8000-000000000e01';
\i supabase/migrations/20261204000000_crm_qualification.sql
\i supabase/migrations/20261204000000_crm_qualification.sql
select pg_temp.assert((select qualification = 'nightlife' from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'Enjoy, con la de ocio nocturno');
select pg_temp.assert((select count(*) = 1 from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'una sola fila de Enjoy');
select pg_temp.assert(not exists (select 1 from public.crm_settings s join public.tenant t on t.id = s.tenant_id where t.slug <> 'enjoy' and s.qualification is not null),
  'los demás espacios (Oquea, re-tema…), sin cualificación');
do $$ begin
  update public.crm_settings set qualification = 'buceo' where tenant_id = '00000000-0000-4000-8000-000000000e01';
  raise exception 'ASSERT FAILED: un paquete que no existe';
exception when check_violation then null; end $$;

-- La lee cualquiera del espacio; la cambia solo su admin (RLS de crm_settings).
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
select pg_temp.assert((select qualification = 'nightlife' from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'el comercial la lee');
update public.crm_settings set qualification = null where tenant_id = '00000000-0000-4000-8000-000000000e01';
reset role;
select pg_temp.assert((select qualification = 'nightlife' from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'el comercial no la quita');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- de otro espacio
select pg_temp.assert(not exists (select 1 from public.crm_settings where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'otro espacio no la ve');
reset role;
\echo '73_crm_qualification OK'
