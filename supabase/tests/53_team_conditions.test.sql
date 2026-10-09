-- Condiciones del equipo (20261109000000): quien no tiene condiciones propias ve las del plan por defecto, solo si el
-- espacio lo marca (show_to_team). Si el admin ya decidió algo para esa persona, manda lo suyo (también si las ocultó).
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('66666666-6666-4666-8666-666666666666', 'nuevo@enjoy.test') on conflict do nothing;
insert into public.membership (user_id, tenant_id, role) values ('66666666-6666-4666-8666-666666666666', '00000000-0000-4000-8000-000000000e01', 'rep') on conflict do nothing;
delete from public.commission_plan where tenant_id = '00000000-0000-4000-8000-000000000e01' and is_default;
insert into public.commission_plan (id, tenant_id, name, is_default, rules) values
  ('90000000-0000-4000-8000-000000000053', '00000000-0000-4000-8000-000000000e01', 'Equipo', true, '[{"id":"tx","label":"70 %","when":{},"pay":{"type":"percent","bps":7000}}]');
-- Alguien con condiciones ya acordadas (las suyas mandan).
insert into public.member_conditions (tenant_id, user_id, visible, note, agreed_at) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', true, 'Revisamos en enero', now())
  on conflict (tenant_id, user_id) do update set visible = true, note = 'Revisamos en enero';

set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select pg_temp.assert((public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'visible')::boolean = false, 'sin marcar el plan del equipo: como antes, no se enseñan');
reset role;

update public.commission_plan set show_to_team = true, team_note = 'El 70 % durante 6 meses' where tenant_id = '00000000-0000-4000-8000-000000000e01' and is_default;

set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select pg_temp.assert((public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'visible')::boolean, 'sin condiciones propias: ve las del equipo');
select pg_temp.assert((public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'team')::boolean, 'marcadas como del equipo');
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'note' = 'El 70 % durante 6 meses', 'con la nota del equipo');
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->'plan'->>'name' = 'Equipo', 'con el plan por defecto');
reset role;

-- El admin las oculta para esta persona: manda lo suyo.
insert into public.member_conditions (tenant_id, user_id, visible) values ('00000000-0000-4000-8000-000000000e01', '66666666-6666-4666-8666-666666666666', false);
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select pg_temp.assert((public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'visible')::boolean = false, 'ocultas por el admin: no se ven');
reset role;
-- Quien ya tenía las suyas acordadas sigue viendo las suyas (con su nota), no las del equipo.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->>'note' = 'Revisamos en enero', 'las acordadas mandan');
select pg_temp.assert(public.my_conditions('00000000-0000-4000-8000-000000000e01')->'team' is null, 'y no se marcan como del equipo');
reset role;
delete from public.commission_plan where id = '90000000-0000-4000-8000-000000000053';
delete from public.member_conditions where user_id = '66666666-6666-4666-8666-666666666666';
