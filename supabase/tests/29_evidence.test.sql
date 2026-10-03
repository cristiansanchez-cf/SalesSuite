-- Qué ha funcionado: facetas por tenant y cierres documentados.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep Enjoy
select pg_temp.assert((select count(*) from public.situation_facet) = 3, 'rep lee las facetas');
select pg_temp.assert((select count(*) from public.win_story) = 5, 'rep lee los cierres compartidos');
update public.situation_facet set label = 'hack';
select pg_temp.assert((select count(*) from public.situation_facet where label = 'hack') = 0, 'rep no edita facetas');
-- Documenta su cierre de un dossier suyo; no de uno ajeno.
insert into public.dossier (id, tenant_id, author_id, title) values ('88888888-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'Mío');
insert into public.win_story (tenant_id, dossier_id, author_id, outcome, title, what_worked)
values ('00000000-0000-4000-8000-000000000e01', '88888888-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'won', 'Mío', 'x');
do $$ begin
  insert into public.win_story (tenant_id, dossier_id, author_id, outcome, title, what_worked)
  values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000d05501', '11111111-1111-4111-8111-111111111111', 'won', 'Ajeno', 'x');
  raise exception 'ASSERT FAILED: cierre de un dossier ajeno';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.win_story (tenant_id, author_id, outcome, title, what_worked)
  values ('00000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222222222', 'won', 'Suplantado', 'x');
  raise exception 'ASSERT FAILED: cierre a nombre de otro';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.win_story (tenant_id, author_id, outcome, title, status, what_worked)
  values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'won', 'Oculto', 'hidden', 'x');
  raise exception 'ASSERT FAILED: rep crea un cierre oculto';
exception when insufficient_privilege then null; end $$;
-- Ganado sin «qué funcionó» → no.
do $$ begin
  insert into public.win_story (tenant_id, author_id, outcome, title) values ('00000000-0000-4000-8000-000000000e01', '11111111-1111-4111-8111-111111111111', 'won', 'Vacío');
  raise exception 'ASSERT FAILED: ganado sin explicación';
exception when check_violation then null; end $$;
-- No oculta cierres ajenos.
update public.win_story set status = 'hidden' where title = 'Club Aurora (ejemplo)';
select pg_temp.assert((select status::text from public.win_story where title = 'Club Aurora (ejemplo)') = 'shared', 'rep no oculta cierres ajenos');
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- otro tenant
select pg_temp.assert((select count(*) from public.win_story) = 0, 'otro tenant no ve cierres de Enjoy');
select pg_temp.assert((select count(*) from public.situation_facet) = 0, 'otro tenant no ve facetas de Enjoy');
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin
update public.win_story set status = 'hidden' where title = 'Mío';
insert into public.situation_facet (tenant_id, key, label, options) values ('00000000-0000-4000-8000-000000000e01', 'tipo-centro', 'Tipo de centro', '[{"key":"familiar","label":"Familiar"}]');
reset role;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select pg_temp.assert((select count(*) from public.win_story where title = 'Mío') = 1, 'el autor sigue viendo su cierre oculto');
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select count(*) from public.situation_facet) = 4, 'admin crea facetas');
reset role;

delete from public.win_story where title = 'Mío';
delete from public.dossier where id = '88888888-0000-4000-8000-000000000001';
delete from public.situation_facet where key = 'tipo-centro';
