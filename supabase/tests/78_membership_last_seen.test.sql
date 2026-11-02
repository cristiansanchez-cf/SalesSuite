-- Migración 20261219: cada persona apunta su visita al espacio (una vez por hora); no la de otro ni en otro espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('78787878-0000-4000-8000-000000000001', 'visto78@enjoy.test'),
  ('78787878-0000-4000-8000-000000000002', 'pendiente78@enjoy.test');
insert into public.membership (user_id, tenant_id, role) values
  ('78787878-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('78787878-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');

set role authenticated;
set request.jwt.claim.sub = '78787878-0000-4000-8000-000000000001';
select public.touch_membership('00000000-0000-4000-8000-000000000e01');
-- En otro espacio no es miembro: no pasa nada.
select public.touch_membership('00000000-0000-4000-8000-000000000a01');
reset role;
select pg_temp.assert((select last_seen_at is not null from public.membership where user_id = '78787878-0000-4000-8000-000000000001'), 'apunta su visita');
select pg_temp.assert((select last_seen_at is null from public.membership where user_id = '78787878-0000-4000-8000-000000000002'), 'la de otro no');

-- Una vez por hora: dentro de la hora no se reescribe.
update public.membership set last_seen_at = now() - interval '10 minutes' where user_id = '78787878-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '78787878-0000-4000-8000-000000000001';
select public.touch_membership('00000000-0000-4000-8000-000000000e01');
reset role;
select pg_temp.assert((select last_seen_at < now() - interval '5 minutes' from public.membership where user_id = '78787878-0000-4000-8000-000000000001'), 'como mucho una vez por hora');

-- Sin sesión no se puede llamar.
set role anon;
do $$ begin
  perform public.touch_membership('00000000-0000-4000-8000-000000000e01');
  raise exception 'ASSERT FAILED: anon apunta visitas';
exception when insufficient_privilege then null; end $$;
reset role;

delete from auth.users where email in ('visto78@enjoy.test', 'pendiente78@enjoy.test');
delete from public.users where email in ('visto78@enjoy.test', 'pendiente78@enjoy.test');
