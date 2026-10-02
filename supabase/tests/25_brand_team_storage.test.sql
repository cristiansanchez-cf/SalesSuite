\set ON_ERROR_STOP on
-- Requiere los usuarios creados en 20_rls.test.sql.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- resolve_tenant expone la marca
set role anon;
select pg_temp.assert((select brand from public.resolve_tenant(p_slug => 'enjoy')) is not null, 'resolve_tenant devuelve brand');
reset role;

-- ---------------------------------------------------------------- tema/marca
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep
update public.tenant set brand = '{"logoAlt":"hack"}' where slug = 'enjoy';
select pg_temp.assert((select brand->>'logoAlt' from public.tenant where slug = 'enjoy') is distinct from 'hack', 'rep no edita marca');
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin
update public.tenant set brand = '{"logoAlt":"Enjoy"}' where slug = 'enjoy';
select pg_temp.assert((select brand->>'logoAlt' from public.tenant where slug = 'enjoy') = 'Enjoy', 'admin edita marca');
do $$ begin
  update public.tenant set slug = 'hacked' where slug = 'enjoy';
  raise exception 'ASSERT FAILED: admin cambió el slug';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.tenant set status = 'suspended' where slug = 'enjoy';
  raise exception 'ASSERT FAILED: admin cambió el status';
exception when insufficient_privilege then null; end $$;
-- admin no toca otro tenant
update public.tenant set brand = '{"logoAlt":"x"}' where slug = 'retheme-test';
reset role;
select pg_temp.assert((select brand->>'logoAlt' from public.tenant where slug = 'retheme-test') = 'ReTheme', 'admin no edita otro tenant');

-- ---------------------------------------------------------------- último admin
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  update public.membership set role = 'rep' where user_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'ASSERT FAILED: se degradó al último admin';
exception when check_violation then null; end $$;
do $$ begin
  delete from public.membership where user_id = '22222222-2222-4222-8222-222222222222';
  raise exception 'ASSERT FAILED: se borró al último admin';
exception when check_violation then null; end $$;
-- promover al rep y entonces sí puede degradarse el otro
update public.membership set role = 'admin' where user_id = '11111111-1111-4111-8111-111111111111';
update public.membership set role = 'rep' where user_id = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select role::text from public.membership where user_id = '22222222-2222-4222-8222-222222222222') = 'rep', 'con otro admin, se puede degradar');
reset role;
-- restaurar
update public.membership set role = 'admin' where user_id = '22222222-2222-4222-8222-222222222222';
update public.membership set role = 'rep' where user_id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------- storage
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin Enjoy
insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/logo.svg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000a01/logo.svg');
  raise exception 'ASSERT FAILED: admin subió a la carpeta de otro tenant';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', 'logo.svg');
  raise exception 'ASSERT FAILED: subida fuera de carpeta de tenant';
exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep
do $$ begin
  insert into storage.objects (bucket_id, name) values ('tenant-assets', '00000000-0000-4000-8000-000000000e01/x.png');
  raise exception 'ASSERT FAILED: rep subió assets';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.assert((select public from storage.buckets where id = 'tenant-assets'), 'bucket público de lectura');
