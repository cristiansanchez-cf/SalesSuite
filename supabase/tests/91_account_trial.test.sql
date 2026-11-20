-- En prueba (docs/CLIENTS.md §En prueba): quien la lleva la pone en prueba con fecha de fin; la reserva dura toda la
-- prueba; otro comercial no puede; una en marcha por empresa (cambiar fechas actualiza la misma); se acaba una vez.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('91919191-0000-4000-8000-000000000001', 'rep91@test'), ('91919191-0000-4000-8000-000000000002', 'otro91@test'), ('91919191-0000-4000-8000-000000000003', 'admin91@test');
insert into public.membership (user_id, tenant_id, role) values
  ('91919191-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('91919191-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'rep'),
  ('91919191-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000e01', 'admin');
insert into public.account (id, tenant_id, name, owner_id, claimed_until) values
  ('91919191-aaaa-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'Sala Prueba 91', '91919191-0000-4000-8000-000000000001', now() + interval '5 days');
create temp table r91 (id uuid);
grant all on r91 to authenticated;

set role authenticated;
set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000002';
do $$ begin
  perform public.trial_start('91919191-aaaa-4000-8000-000000000001', current_date, current_date + 60, null);
  raise exception 'ASSERT FAILED: otro comercial la pone en prueba';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000001';
do $$ begin
  perform public.trial_start('91919191-aaaa-4000-8000-000000000001', current_date, current_date - 1, null);
  raise exception 'ASSERT FAILED: acaba antes de empezar';
exception when check_violation then null; end $$;
insert into r91 select public.trial_start('91919191-aaaa-4000-8000-000000000001', current_date, current_date + 60, '2 meses por el trato');
reset role;
select pg_temp.assert((select claimed_until > now() + interval '60 days' from public.account where id = '91919191-aaaa-4000-8000-000000000001'), 'reservada toda la prueba');
select pg_temp.assert((select status = 'open' from public.account where id = '91919191-aaaa-4000-8000-000000000001'), 'en prueba no es cliente todavía');

set role authenticated;
set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000001';
select pg_temp.assert((select public.trial_start('91919191-aaaa-4000-8000-000000000001', current_date, current_date + 75, null)) = (select id from r91), 'cambiar fechas: la misma prueba');
select pg_temp.assert((select ends_on = current_date + 75 and note = '2 meses por el trato' from public.account_trial where id = (select id from r91)), 'fechas nuevas, nota de antes');
-- El equipo la ve; nadie escribe directo.
set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 1 from public.account_trial where account_id = '91919191-aaaa-4000-8000-000000000001'), 'el equipo la ve');
do $$ begin
  update public.account_trial set ends_on = current_date where account_id = '91919191-aaaa-4000-8000-000000000001';
  if found then raise exception 'ASSERT FAILED: se edita directo'; end if;
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.trial_end((select id from r91), 'leaves');
  raise exception 'ASSERT FAILED: otro comercial la acaba';
exception when insufficient_privilege then null; end $$;
-- El admin: «Se queda».
set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000003';
select public.trial_end((select id from r91), 'stays');
select public.trial_end((select id from r91), 'leaves');
reset role;
select pg_temp.assert((select outcome = 'stays' and ended_at is not null from public.account_trial where id = (select id from r91)), 'acabada una vez: se queda');
-- Acabada, se puede empezar otra.
set role authenticated;
set request.jwt.claim.sub = '91919191-0000-4000-8000-000000000001';
select pg_temp.assert((select public.trial_start('91919191-aaaa-4000-8000-000000000001', null, current_date + 10, null)) <> (select id from r91), 'otra prueba nueva');
reset role;
