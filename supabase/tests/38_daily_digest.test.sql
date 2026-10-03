-- Resumen diario: cada persona cambia SUS preferencias; la zona horaria se valida; el registro de envíos es solo del cron.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

select pg_temp.assert((select daily_digest and timezone = 'Europe/Madrid' from public.users where id = '11111111-1111-4111-8111-111111111111'), 'por defecto: activado, Madrid');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update public.users set daily_digest = false, timezone = 'Asia/Seoul' where id = '11111111-1111-4111-8111-111111111111';
update public.users set daily_digest = false where id = '22222222-2222-4222-8222-222222222222';  -- otra persona: la RLS no lo deja
-- Bienvenida terminada (users.onboarding): cada uno la suya, y siempre un objeto.
update public.users set onboarding = '{"00000000-0000-4000-8000-000000000e01": "2026-10-05T08:00:00Z"}' where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  update public.users set onboarding = '[]' where id = '11111111-1111-4111-8111-111111111111';
  raise exception 'ASSERT FAILED: onboarding no es un objeto';
exception when check_violation then null; end $$;
do $$ begin
  update public.users set timezone = 'x; drop table users' where id = '11111111-1111-4111-8111-111111111111';
  raise exception 'ASSERT FAILED: zona horaria inválida aceptada';
exception when check_violation then null; end $$;
do $$ begin
  perform 1 from public.daily_digest_log;
  raise exception 'ASSERT FAILED: un usuario lee el registro de envíos';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.assert((select not daily_digest and timezone = 'Asia/Seoul' from public.users where id = '11111111-1111-4111-8111-111111111111'), 'cambia lo suyo');
select pg_temp.assert((select daily_digest from public.users where id = '22222222-2222-4222-8222-222222222222'), 'no cambia lo de otros');
select pg_temp.assert((select onboarding ? '00000000-0000-4000-8000-000000000e01' from public.users where id = '11111111-1111-4111-8111-111111111111'), 'bienvenida marcada por la propia persona');

insert into public.daily_digest_log (user_id, tenant_id, day, emailed) values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000e01', '2026-10-05', true);
do $$ begin
  insert into public.daily_digest_log (user_id, tenant_id, day) values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000e01', '2026-10-05');
  raise exception 'ASSERT FAILED: dos envíos el mismo día';
exception when unique_violation then null; end $$;

delete from public.daily_digest_log;
update public.users set daily_digest = true, timezone = 'Europe/Madrid', onboarding = '{}' where id = '11111111-1111-4111-8111-111111111111';
