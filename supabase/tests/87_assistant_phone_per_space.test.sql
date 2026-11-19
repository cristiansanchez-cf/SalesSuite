-- Un móvil por empresa para el asistente (membership.assistant_phone; vacío = el de Mi cuenta). Cada uno solo cambia
-- los suyos; el anónimo, nada.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('87878787-0000-4000-8000-000000000001', 'varias87@test');
update public.users set phone = '+34 644 000 111' where id = '87878787-0000-4000-8000-000000000001';
insert into public.membership (user_id, tenant_id, role) values
  ('87878787-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'admin'),
  ('87878787-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000b01', 'rep');

-- Ella misma: en Enjoy escribe desde otro móvil.
set role authenticated;
set request.jwt.claim.sub = '87878787-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 2 from public.my_assistant_phones()), 've sus dos empresas');
select pg_temp.assert(public.set_my_assistant_phone('00000000-0000-4000-8000-000000000e01', '+34694000222'), 'pone el móvil de Enjoy');
select pg_temp.assert(not public.set_my_assistant_phone('00000000-0000-4000-8000-000000000a01', '+34600000000'), 'en una empresa que no es suya, no');
do $$ begin
  perform public.assistant_member_by_phone('34694000222');
  raise exception 'ASSERT FAILED: un usuario llama a la búsqueda por teléfono';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.assert((select array_agg(tenant_id) = '{00000000-0000-4000-8000-000000000e01}' from public.assistant_member_by_phone('34694000222') where user_id = '87878787-0000-4000-8000-000000000001'),
  'desde el móvil de Enjoy: solo Enjoy');
select pg_temp.assert((select array_agg(tenant_id) = '{00000000-0000-4000-8000-000000000b01}' from public.assistant_member_by_phone('34644000111') where user_id = '87878787-0000-4000-8000-000000000001'),
  'desde el de Mi cuenta: las demás (no Enjoy)');

set role anon;
do $$ begin
  perform public.set_my_assistant_phone('00000000-0000-4000-8000-000000000e01', null);
  raise exception 'ASSERT FAILED: el anónimo cambia móviles';
exception when insufficient_privilege then null; end $$;
reset role;
