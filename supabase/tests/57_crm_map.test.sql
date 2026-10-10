-- Mapa (docs/CRM_DINAMICO.md §16): el punto de una ciudad lo pone un/a admin del espacio; un comercial lo ve pero no lo cambia.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.zone (id, tenant_id, name, kind) values ('57000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Ciudad 57', 'city');
update public.zone set lat = 39.47, lng = -0.37 where id = '57000000-0000-4000-8000-0000000000b1';
select pg_temp.assert((select lat = 39.47 and lng = -0.37 from public.zone where id = '57000000-0000-4000-8000-0000000000b1'), 'el admin la sitúa');
do $$ begin
  update public.zone set lat = 120 where id = '57000000-0000-4000-8000-0000000000b1';
  raise exception 'ASSERT FAILED: latitud imposible';
exception when check_violation then null; end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
update public.zone set lat = 0, lng = 0 where id = '57000000-0000-4000-8000-0000000000b1';
select pg_temp.assert((select lat = 39.47 from public.zone where id = '57000000-0000-4000-8000-0000000000b1'), 'un comercial la ve pero no la mueve');
reset role;
delete from public.zone where id = '57000000-0000-4000-8000-0000000000b1';
