\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

-- borrador creado por plataforma
insert into public.play (tenant_id, kind, title, status) values ('00000000-0000-4000-8000-000000000e01', 'tip', 'Borrador secreto', 'draft');

-- ---------------------------------------------------------------- rep Enjoy
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.play) = 19, 'rep ve las 19 jugadas oficiales (no borradores)');
do $$ begin
  insert into public.play (tenant_id, kind, title) values ('00000000-0000-4000-8000-000000000e01', 'tip', 'hack');
  raise exception 'ASSERT FAILED: rep creó jugada oficial';
exception when insufficient_privilege then null; end $$;
update public.play set title = 'hack' where key = 'empresa-pitch';
select pg_temp.assert((select title from public.play where key = 'empresa-pitch') = 'Enjoy en una frase', 'rep no edita jugadas');

insert into public.play_contribution (id, tenant_id, type, kind, title, body, status, author_id)
values ('44444444-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', 'tip', 'tip', 'Truco', 'Funciona', 'shared', '11111111-1111-4111-8111-111111111111');
insert into public.play_contribution (id, tenant_id, type, play_id, title, body, status, author_id)
values ('44444444-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000e01', 'change',
        (select id from public.play where key = 'empresa-obj-precio'), 'Mejora', 'Texto mejor', 'pending', '11111111-1111-4111-8111-111111111111');
do $$ begin
  insert into public.play_contribution (tenant_id, type, title, body, status, author_id)
  values ('00000000-0000-4000-8000-000000000e01', 'tip', 'x', 'y', 'accepted', '11111111-1111-4111-8111-111111111111');
  raise exception 'ASSERT FAILED: rep se auto-aceptó un aporte';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.play_contribution (tenant_id, type, title, body, status, author_id)
  values ('00000000-0000-4000-8000-000000000e01', 'tip', 'x', 'y', 'shared', '22222222-2222-4222-8222-222222222222');
  raise exception 'ASSERT FAILED: rep aportó a nombre de otro';
exception when insufficient_privilege then null; end $$;
update public.play_contribution set status = 'accepted' where id = '44444444-0000-4000-8000-000000000002';
select pg_temp.assert((select status::text from public.play_contribution where id = '44444444-0000-4000-8000-000000000002') = 'pending', 'rep no revisa su propio aporte');

insert into public.play_feedback (tenant_id, user_id, target_type, target_id, verdict)
values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'play', (select id from public.play where key = 'exp-pitch'), 'worked');
do $$ begin
  insert into public.play_feedback (tenant_id, user_id, target_type, target_id, verdict)
  values ('00000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222222222', 'play', (select id from public.play where key = 'exp-pitch'), 'worked');
  raise exception 'ASSERT FAILED: voto a nombre de otro';
exception when insufficient_privilege then null; end $$;
insert into public.learning_progress (tenant_id, user_id, topic) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'general');
reset role;

-- feedback a un objetivo de otro tenant: rechazado por trigger
do $$ begin
  insert into public.play (id, tenant_id, kind, title) values ('55555555-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000a01', 'tip', 'otro');
  insert into public.play_feedback (tenant_id, user_id, target_type, target_id, verdict)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'play', '55555555-0000-4000-8000-000000000001', 'worked');
  raise exception 'ASSERT FAILED: feedback cruzado entre tenants';
exception when foreign_key_violation then null; end $$;

-- ---------------------------------------------------------------- otro miembro / admin / otro tenant
-- (el rep 2 de Enjoy no existe en el seed: usamos el admin para "ve pendientes" y el de otro tenant para aislamiento)
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin
select pg_temp.assert((select count(*) from public.play_contribution where status = 'pending') = 1, 'admin ve la mejora pendiente');
select pg_temp.assert((select count(*) from public.play) = 20, 'admin ve también el borrador');
select pg_temp.assert((select count(*) from public.learning_progress) = 1, 'admin ve el progreso del equipo');
update public.play_contribution set status = 'accepted', reviewed_by = '22222222-2222-4222-8222-222222222222', reviewed_at = now()
where id = '44444444-0000-4000-8000-000000000002';
select pg_temp.assert((select status::text from public.play_contribution where id = '44444444-0000-4000-8000-000000000002') = 'accepted', 'admin revisa');
select pg_temp.assert((select count(*) from public.learning_progress where user_id = '22222222-2222-4222-8222-222222222222') = 0, 'progreso propio vacío');
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- rep de otro tenant
select pg_temp.assert((select count(*) from public.play where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant no ve jugadas de Enjoy');
select pg_temp.assert((select count(*) from public.play_contribution where tenant_id = '00000000-0000-4000-8000-000000000e01') = 0, 'otro tenant no ve aportes de Enjoy');
select pg_temp.assert((select count(*) from public.learning_progress) = 0, 'otro tenant no ve progreso ajeno');
do $$ begin
  insert into public.play_contribution (tenant_id, type, title, body, status, author_id)
  values ('00000000-0000-4000-8000-000000000e01', 'tip', 'x', 'y', 'shared', '33333333-3333-4333-8333-333333333333');
  raise exception 'ASSERT FAILED: aporte en tenant ajeno';
exception when insufficient_privilege then null; end $$;
reset role;

-- el autor puede retirar su truco compartido
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from public.play_contribution where id = '44444444-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) from public.play_contribution where id = '44444444-0000-4000-8000-000000000001') = 0, 'autor retira su truco');
-- pero no el aceptado
delete from public.play_contribution where id = '44444444-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) from public.play_contribution where id = '44444444-0000-4000-8000-000000000002') = 1, 'no retira lo ya revisado');
reset role;
