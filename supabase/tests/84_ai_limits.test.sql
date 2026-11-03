-- Tope de IA por empresa: lo cambia solo el superadmin; el equipo solo lee el suyo (con lo gastado este mes).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('a9a9a9a9-0000-4000-8000-000000000003', 'super.limits@cofundo.test');
insert into public.platform_admin (user_id) values ('a9a9a9a9-0000-4000-8000-000000000003');
insert into public.usage_event (tenant_id, feature, provider, cost_usd) values ('00000000-0000-4000-8000-000000000e01', 'crm.research', 'anthropic', 1.25);

set role authenticated;
-- El admin del espacio: lee su tope (sin fila: 40 por persona y sin tope de gasto) con lo gastado, pero no lo cambia.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select ai_per_user_day = 40 and ai_month_usd is null and month_usd >= 1.25 from public.ai_limits('00000000-0000-4000-8000-000000000e01')), 'sin tope: 40 al día y lo gastado');
do $$ begin
  begin perform public.platform_set_limits('00000000-0000-4000-8000-000000000e01', 1000, null); raise exception 'ASSERT FAILED: el admin cambia su tope'; exception when insufficient_privilege then null; end;
  begin perform * from public.platform_limits(); raise exception 'ASSERT FAILED: el admin ve los topes de todos'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.tenant_limits; raise exception 'ASSERT FAILED: el admin lee la tabla'; exception when insufficient_privilege then null; end;
  -- Ni el de otro espacio.
  begin perform * from public.ai_limits('00000000-0000-4000-8000-000000000a01'); raise exception 'ASSERT FAILED: lee el tope de otro espacio'; exception when insufficient_privilege then null; end;
end $$;
-- El superadmin lo cambia.
set request.jwt.claim.sub = 'a9a9a9a9-0000-4000-8000-000000000003';
select public.platform_set_limits('00000000-0000-4000-8000-000000000e01', 120, 50);
select public.platform_set_limits('00000000-0000-4000-8000-000000000e01', 150, 60.5);
select pg_temp.assert((select ai_per_user_day = 150 and ai_month_usd = 60.5 from public.platform_limits() where tenant_id = '00000000-0000-4000-8000-000000000e01'), 'el superadmin fija el tope');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select ai_per_user_day = 150 and ai_month_usd = 60.5 from public.ai_limits('00000000-0000-4000-8000-000000000e01')), 'y el servidor del espacio lo ve');
reset role;
delete from public.tenant_limits where tenant_id = '00000000-0000-4000-8000-000000000e01';
delete from public.usage_event where feature = 'crm.research' and cost_usd = 1.25;
delete from public.platform_admin where user_id = 'a9a9a9a9-0000-4000-8000-000000000003';
