-- Enlace de calendario: cada uno el suyo; rotar lo cambia; nadie ve el de otro; el anónimo, nada.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values ('89898989-0000-4000-8000-000000000001', 'cal89@test'), ('89898989-0000-4000-8000-000000000002', 'otro89@test');

set role authenticated;
set request.jwt.claim.sub = '89898989-0000-4000-8000-000000000001';
create temp table t89 (tok text);
grant all on t89 to authenticated;
insert into t89 select public.my_calendar_token();
select pg_temp.assert((select length(tok) = 48 from t89), 'crea su enlace');
select pg_temp.assert((select public.my_calendar_token() = tok from t89), 'pedirlo otra vez da el mismo');
select pg_temp.assert((select public.my_calendar_token(true) <> tok from t89), 'rotar lo cambia');
set request.jwt.claim.sub = '89898989-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 0 from public.calendar_feed), 'no ve el de otro');
reset role;
select pg_temp.assert((select count(*) = 1 from public.calendar_feed where user_id = '89898989-0000-4000-8000-000000000001'), 'uno por persona');
set role authenticated;
set request.jwt.claim.sub = '89898989-0000-4000-8000-000000000001';
select public.drop_my_calendar();
reset role;
select pg_temp.assert((select count(*) = 0 from public.calendar_feed where user_id = '89898989-0000-4000-8000-000000000001'), 'desconectar lo borra');

set role anon;
do $$ begin
  perform public.my_calendar_token();
  raise exception 'ASSERT FAILED: el anónimo pide enlace';
exception when insufficient_privilege then null; end $$;
reset role;
