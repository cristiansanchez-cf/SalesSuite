-- Migración 20261224: el asistente reconoce al equipo por su teléfono (con o sin prefijo) y su estado es solo del servidor.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('82828282-0000-4000-8000-000000000001', 'rep82@enjoy.test'), ('82828282-0000-4000-8000-000000000002', 'dj82@enjoy.test');
update public.users set phone = '699 00 01 11' where id = '82828282-0000-4000-8000-000000000001';
update public.users set phone = '+34 699 111 222' where id = '82828282-0000-4000-8000-000000000002';
insert into public.membership (user_id, tenant_id, role) values
  ('82828282-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('82828282-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'partner');

select pg_temp.assert((select count(*) from public.assistant_member_by_phone('34699000111') where user_id = '82828282-0000-4000-8000-000000000001') = 1, 'sin prefijo en Mi cuenta: le reconoce');
select pg_temp.assert((select count(*) from public.assistant_member_by_phone('699000111')) = 1, 'igual sin prefijo');
select pg_temp.assert((select count(*) from public.assistant_member_by_phone('34699111222')) = 0, 'un colaborador no usa el asistente');
select pg_temp.assert((select count(*) from public.assistant_member_by_phone('743567')) = 0, 'menos de 9 cifras no vale');

insert into public.wa_assistant_state (tenant_id, user_id) values ('00000000-0000-4000-8000-000000000e01', '82828282-0000-4000-8000-000000000001');
set role authenticated;
set request.jwt.claim.sub = '82828282-0000-4000-8000-000000000001';
do $$ begin
  perform 1 from public.wa_assistant_state;
  raise exception 'ASSERT FAILED: el estado no se lee con sesión';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.assistant_member_by_phone('34699000111');
  raise exception 'ASSERT FAILED: buscar teléfonos con sesión';
exception when insufficient_privilege then null; end $$;
reset role;
reset request.jwt.claim.sub;
delete from public.wa_assistant_state;
delete from public.membership where user_id::text like '82828282-%';
