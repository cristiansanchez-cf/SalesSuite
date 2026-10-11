-- «Trabaja con» (docs/CRM_DINAMICO.md §22): enlaces entre empresas del mismo espacio, uno por pareja, solo del espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- comercial de Enjoy
insert into public.account (id, tenant_id, name) values
  ('63000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Rooftop 63'),
  ('63000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Promotora 63');
insert into public.account_link (tenant_id, a_id, b_id, note) values
  ('00000000-0000-4000-8000-000000000e01', '63000000-0000-4000-8000-0000000000a1', '63000000-0000-4000-8000-0000000000a2', 'los jueves');
select pg_temp.assert((select created_by = '11111111-1111-4111-8111-111111111111' from public.account_link where a_id = '63000000-0000-4000-8000-0000000000a1'), 'quién lo enlazó');
do $$ begin
  insert into public.account_link (tenant_id, a_id, b_id) values ('00000000-0000-4000-8000-000000000e01', '63000000-0000-4000-8000-0000000000a2', '63000000-0000-4000-8000-0000000000a1');
  raise exception 'ASSERT FAILED: la misma pareja al revés';
exception when unique_violation then null; end $$;
do $$ begin
  insert into public.account_link (tenant_id, a_id, b_id) values ('00000000-0000-4000-8000-000000000e01', '63000000-0000-4000-8000-0000000000a1', '63000000-0000-4000-8000-0000000000a1');
  raise exception 'ASSERT FAILED: consigo misma';
exception when check_violation then null; end $$;

-- De otro espacio: no lo ve, no enlaza en el nuestro.
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.assert((select count(*) = 0 from public.account_link), 'otro espacio no lo ve');
do $$ begin
  insert into public.account_link (tenant_id, a_id, b_id) values ('00000000-0000-4000-8000-000000000e01', '63000000-0000-4000-8000-0000000000a2', '63000000-0000-4000-8000-0000000000a1');
  raise exception 'ASSERT FAILED: enlaza en otro espacio';
exception when insufficient_privilege then null; end $$;
with d as (delete from public.account_link returning 1) select pg_temp.assert((select count(*) = 0 from d), 'ni lo borra');

-- Al borrar una empresa, se va su enlace.
reset role;
select pg_temp.assert((select count(*) = 1 from public.account_link where a_id = '63000000-0000-4000-8000-0000000000a1'), 'sigue ahí');
delete from public.account where id = '63000000-0000-4000-8000-0000000000a2';
select pg_temp.assert((select count(*) = 0 from public.account_link where a_id = '63000000-0000-4000-8000-0000000000a1'), 'se borra con la empresa');
delete from public.account where id = '63000000-0000-4000-8000-0000000000a1';

-- Dónde trabaja (§24): días y frecuencia válidos; nada inventado.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.account (id, tenant_id, name) values
  ('63000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e01', 'Sala 63b'),
  ('63000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000e01', 'Promo 63b');
insert into public.account_link (tenant_id, a_id, b_id, days, freq, role) values
  ('00000000-0000-4000-8000-000000000e01', '63000000-0000-4000-8000-0000000000b1', '63000000-0000-4000-8000-0000000000b2', '{fri,sat}', 'regular', 'resident');
do $$ begin
  update public.account_link set days = '{viernes}' where a_id = '63000000-0000-4000-8000-0000000000b1';
  raise exception 'ASSERT FAILED: día inventado';
exception when check_violation then null; end $$;
do $$ begin
  update public.account_link set freq = 'siempre' where a_id = '63000000-0000-4000-8000-0000000000b1';
  raise exception 'ASSERT FAILED: frecuencia inventada';
exception when check_violation then null; end $$;
do $$ begin
  update public.account set tiktok = 'javascript:alert(1)' where id = '63000000-0000-4000-8000-0000000000b2';
  raise exception 'ASSERT FAILED: tiktok javascript:';
exception when check_violation then null; end $$;
reset role;
delete from public.account where id::text like '63000000-0000-4000-8000-0000000000b%';
