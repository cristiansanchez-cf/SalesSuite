-- Tope de investigaciones al día (migración 20270130): por persona y por espacio; si no cabe, no suma.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
insert into auth.users (id, email) values ('96969696-0000-4000-8000-000000000001', 'a96@test'), ('96969696-0000-4000-8000-000000000002', 'b96@test');
insert into public.membership (user_id, tenant_id, role) values
  ('96969696-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('96969696-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep');
set role authenticated;
set request.jwt.claim.sub = '96969696-0000-4000-8000-000000000001';
select pg_temp.assert(public.bump_research('00000000-0000-4000-8000-000000000e01', 2, 3) = 'ok', '1');
select pg_temp.assert(public.bump_research('00000000-0000-4000-8000-000000000e01', 2, 3) = 'ok', '2');
select pg_temp.assert(public.bump_research('00000000-0000-4000-8000-000000000e01', 2, 3) = 'user', 'la tercera de la misma persona no cabe');
set request.jwt.claim.sub = '96969696-0000-4000-8000-000000000002';
select pg_temp.assert(public.bump_research('00000000-0000-4000-8000-000000000e01', 2, 3) = 'ok', 'otra persona: la tercera del espacio');
select pg_temp.assert(public.bump_research('00000000-0000-4000-8000-000000000e01', 2, 3) = 'tenant', 'el espacio ya ha hecho las del día');
reset role;
select pg_temp.assert((select sum(n) = 3 from public.usage_counter where kind = 'research' and tenant_id = '00000000-0000-4000-8000-000000000e01'), 'las que no caben no suman');
