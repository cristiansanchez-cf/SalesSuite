-- Condiciones opcionales: invisibles hasta que el admin las marca como acordadas; cada uno ve solo las suyas.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('55555555-5555-4555-8555-555555555555', 'dj@enjoy.test') on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values ('55555555-5555-4555-8555-555555555555', '00000000-0000-4000-8000-000000000e01', 'partner') on conflict do nothing;
insert into public.partner_profile (tenant_id, user_id, module_ids) values ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', '{}') on conflict do nothing;
insert into public.commission_plan (id, tenant_id, name, is_default, rules) values
  ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'General', true, '[{"id":"todo-igual","label":"Todo igual: 30 %","when":{},"pay":{"type":"percent","bps":3000}}]'),
  ('90000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'Colaboradores', false, '[{"id":"dj","label":"20 %","when":{},"pay":{"type":"percent","bps":2000}}]');
insert into public.commission_plan_member (tenant_id, user_id, plan_id) values ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', '90000000-0000-4000-8000-000000000002');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep, sin condiciones acordadas
select pg_temp.assert((public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'visible')::boolean = false, 'sin acordar: no se enseñan');
do $$ begin
  insert into public.member_conditions (tenant_id, user_id, visible) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', true);
  raise exception 'ASSERT FAILED: el comercial se marca las condiciones';
exception when insufficient_privilege then null; end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin
insert into public.member_conditions (tenant_id, user_id, visible, note, agreed_at) values
  ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', true, 'Revisamos en enero', now()),
  ('00000000-0000-4000-8000-000000000e01', '55555555-5555-4555-8555-555555555555', true, null, now());
reset role;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->'plan'->>'name' = 'General', 'el comercial ve el plan general');
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'note' = 'Revisamos en enero', 'con la nota del admin');
select pg_temp.assert((select count(*) from public.member_conditions) = 1, 'solo ve las suyas');
reset role;
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';  -- colaborador con plan propio
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->'plan'->>'name' = 'Colaboradores', 'el colaborador ve su plan (sin leer la tabla de planes)');
do $$ begin
  perform public.my_conditions('00000000-0000-4000-8000-000000000a01');
  raise exception 'ASSERT FAILED: condiciones de otra empresa';
exception when insufficient_privilege then null; end $$;
reset role;

-- Historial: cada cambio quedó registrado con el plan que aplicaba; el comercial no puede escribirlo.
select pg_temp.assert((select count(*) from public.member_conditions_history where user_id = '11111111-1111-4111-8111-111111111111') >= 1, 'historial del comercial');
select pg_temp.assert((select plan->>'name' from public.member_conditions_history where user_id = '55555555-5555-4555-8555-555555555555' order by changed_at desc limit 1) = 'Colaboradores', 'foto del plan del colaborador');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.member_conditions_history where user_id <> '11111111-1111-4111-8111-111111111111') = 0, 'solo ve su historial');
do $$ begin
  insert into public.member_conditions_history (tenant_id, user_id, visible) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', true);
  raise exception 'ASSERT FAILED: el comercial escribe su historial';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.member_conditions_history;
delete from public.member_conditions;
delete from public.commission_plan_member;
delete from public.commission_plan;
delete from auth.users where id = '55555555-5555-4555-8555-555555555555';
