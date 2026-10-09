-- CRM fase 3 (docs/CRM_DINAMICO.md §10): interacciones de cada uno, visibles para el equipo y no para otro espacio.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.account (id, tenant_id, name, instagram, next_step_at, next_channel) values
  ('49000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Sala 49', 'https://www.instagram.com/sala49/', now(), 'instagram');
do $$ begin
  update public.account set next_channel = 'paloma' where id = '49000000-0000-4000-8000-0000000000a1';
  raise exception 'ASSERT FAILED: vía que no existe';
exception when check_violation then null; end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
insert into public.crm_activity (tenant_id, account_id, channel, outcome, note) values
  ('00000000-0000-4000-8000-000000000e01', '49000000-0000-4000-8000-0000000000a1', 'instagram', 'no_reply', 'Primer mensaje');
select pg_temp.assert((select user_id from public.crm_activity where note = 'Primer mensaje') = '11111111-1111-4111-8111-111111111111', 'queda quién la hizo');
do $$ begin
  insert into public.crm_activity (tenant_id, account_id, user_id, channel, outcome) values
    ('00000000-0000-4000-8000-000000000e01', '49000000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', 'phone', 'replied');
  raise exception 'ASSERT FAILED: apuntar en nombre de otro';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- comercial de otro espacio
select pg_temp.assert((select count(*) from public.crm_activity) = 0, 'otro espacio no ve interacciones');
delete from public.crm_activity;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select pg_temp.assert((select count(*) from public.crm_activity where note = 'Primer mensaje') = 1, 'el de otro espacio no borra nada');
delete from public.account where id = '49000000-0000-4000-8000-0000000000a1';
select pg_temp.assert((select count(*) from public.crm_activity where note = 'Primer mensaje') = 0, 'se van con la empresa');
reset role;
