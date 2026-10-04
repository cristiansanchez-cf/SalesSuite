-- Combinaciones guardadas: las ve el equipo del espacio; las borra quien la hizo o un admin; nadie guarda en nombre de otro.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
insert into public.proposal_template (tenant_id, segment_id, name, mode, answers)
  values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-0000005e0002', 'José María', 'full', '{angulo:a,dj}');
select pg_temp.assert((select count(*) from public.proposal_template where name = 'José María') = 1, 'quien la guarda la ve');
do $$ begin
  insert into public.proposal_template (tenant_id, segment_id, name, created_by)
    values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-0000005e0002', 'Otra', '22222222-2222-4222-8222-222222222222');
  raise exception 'ASSERT FAILED: guarda en nombre de otro';
exception when insufficient_privilege then null; end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
select pg_temp.assert((select count(*) from public.proposal_template where name = 'José María') = 1, 'el equipo la ve');
delete from public.proposal_template where name = 'José María';
select pg_temp.assert((select count(*) from public.proposal_template) = 0, 'el admin la borra');
reset role;
