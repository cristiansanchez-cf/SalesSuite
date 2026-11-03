-- Migración 20261223: la caché de perfiles listados la ve y la escribe solo el equipo de su espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('81818181-0000-4000-8000-000000000001', 'rep81@enjoy.test'), ('81818181-0000-4000-8000-000000000002', 'fuera81@otro.test');
insert into public.membership (user_id, tenant_id, role) values
  ('81818181-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('81818181-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000a01', 'rep');

set role authenticated;
set request.jwt.claim.sub = '81818181-0000-4000-8000-000000000001';
insert into public.social_profile_cache (tenant_id, profile, result) values ('00000000-0000-4000-8000-000000000e01', 'instagram:clubsol', '{"posts":[]}');
update public.social_profile_cache set result = '{"posts":[1]}', fetched_at = now() where profile = 'instagram:clubsol';
select pg_temp.assert((select count(*) from public.social_profile_cache) = 1, 'el equipo la ve y la cambia');
do $$ begin
  insert into public.social_profile_cache (tenant_id, profile, result) values ('00000000-0000-4000-8000-000000000a01', 'instagram:x', '{}');
  raise exception 'ASSERT FAILED: en un espacio ajeno';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.social_profile_cache (tenant_id, profile, result) values ('00000000-0000-4000-8000-000000000e01', 'https://evil', '{}');
  raise exception 'ASSERT FAILED: clave rara';
exception when check_violation then null; end $$;
set request.jwt.claim.sub = '81818181-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.social_profile_cache) = 0, 'otro espacio no la ve');
reset role;
reset request.jwt.claim.sub;
delete from public.social_profile_cache;
