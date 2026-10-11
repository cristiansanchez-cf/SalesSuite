-- Buscar clientes (docs/CRM_DINAMICO.md §19): las búsquedas son del equipo interno del espacio; quien buscó (o un/a
-- gerente) apunta lo importado; un partner y otro espacio no ven nada; borrar, solo admin.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('60000000-0000-4000-8000-0000000000f1', 'partner60@enjoy.test') on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values ('60000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000e01', 'partner') on conflict do nothing;
insert into public.partner_profile (tenant_id, user_id) values ('00000000-0000-4000-8000-000000000e01', '60000000-0000-4000-8000-0000000000f1') on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
insert into public.crm_sweep (id, tenant_id, query, zone_label, results)
  values ('60000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'discotecas', 'Valencia', '[{"placeId":"p1","name":"Sol"},{"placeId":"p2","name":"Luna"}]');
select pg_temp.assert((select found from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1') = 2, 'cuenta los resultados');
update public.crm_sweep set imported = '{"p1":"x"}' where id = '60000000-0000-4000-8000-0000000000a1';
select pg_temp.assert((select imported ->> 'p1' from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1') = 'x', 'quien buscó apunta lo importado');
do $$ begin
  insert into public.crm_sweep (tenant_id, query, results) values ('00000000-0000-4000-8000-000000000e01', 'x', (select jsonb_agg(jsonb_build_object('placeId', g)) from generate_series(1, 61) g));
  raise exception 'ASSERT FAILED: más de 60 resultados';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.crm_sweep (tenant_id, query, created_by) values ('00000000-0000-4000-8000-000000000e01', 'x', '22222222-2222-4222-8222-222222222222');
  raise exception 'ASSERT FAILED: a nombre de otro';
exception when insufficient_privilege then null; end $$;
-- Borrar: solo admin (el comercial no borra nada, sin error).
delete from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1';
select pg_temp.assert(exists (select 1 from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1'), 'el comercial no borra');

set request.jwt.claim.sub = '60000000-0000-4000-8000-0000000000f1';  -- partner
select pg_temp.assert((select count(*) from public.crm_sweep) = 0, 'un partner no ve las búsquedas');
do $$ begin
  insert into public.crm_sweep (tenant_id, query) values ('00000000-0000-4000-8000-000000000e01', 'x');
  raise exception 'ASSERT FAILED: un partner busca';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- de otro espacio
select pg_temp.assert((select count(*) from public.crm_sweep) = 0, 'otro espacio no ve nada');
update public.crm_sweep set imported = '{}' where id = '60000000-0000-4000-8000-0000000000a1';

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
select pg_temp.assert((select imported ->> 'p1' from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1') = 'x', 'otro espacio no tocó nada');
delete from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1';
select pg_temp.assert(not exists (select 1 from public.crm_sweep where id = '60000000-0000-4000-8000-0000000000a1'), 'el admin borra');
reset role;
delete from auth.users where id = '60000000-0000-4000-8000-0000000000f1';
