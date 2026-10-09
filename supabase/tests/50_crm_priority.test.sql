-- Prioridad (docs/CRM_DINAMICO.md §11): cualificar y completar con Google sin reservar la empresa, solo libre o mía,
-- y Google solo rellena huecos.
\set ON_ERROR_STOP on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- admin de Enjoy
insert into public.account (id, tenant_id, name, website) values
  ('50000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000e01', 'Libre 50', 'https://a-mano.test'),
  ('50000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000e01', 'Ajena 50', null);
update public.account set owner_id = '22222222-2222-4222-8222-222222222222', claimed_until = now() + interval '10 days' where id = '50000000-0000-4000-8000-0000000000a2';

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- rep de Enjoy
select public.account_qualify('50000000-0000-4000-8000-0000000000a1', '{"kind":"venue","nights":"4+"}');
select public.account_research('50000000-0000-4000-8000-0000000000a1', '{"placeId":"p1","phone":"+34 961","website":"https://google.test","hours":["viernes: 23–6"],"lat":39.4,"lng":-0.3}');
select pg_temp.assert((select qualification->>'nights' from public.account where id = '50000000-0000-4000-8000-0000000000a1') = '4+', 'cualifica una libre');
select pg_temp.assert((select owner_id from public.account where id = '50000000-0000-4000-8000-0000000000a1') is null, 'sin reservarla');
select pg_temp.assert((select website from public.account where id = '50000000-0000-4000-8000-0000000000a1') = 'https://a-mano.test', 'Google no pisa lo escrito a mano');
select pg_temp.assert((select phone = '+34 961' and hours[1] = 'viernes: 23–6' and lat = 39.4 from public.account where id = '50000000-0000-4000-8000-0000000000a1'), 'rellena huecos, horario y ubicación');
do $$ begin
  perform public.account_qualify('50000000-0000-4000-8000-0000000000a2', '{"nights":"1"}');
  raise exception 'ASSERT FAILED: cualifica la de otro';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.account_research('50000000-0000-4000-8000-0000000000a2', '{"phone":"x"}');
  raise exception 'ASSERT FAILED: completa la de otro';
exception when insufficient_privilege then null; end $$;

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- otro espacio
do $$ begin
  perform public.account_qualify('50000000-0000-4000-8000-0000000000a1', '{}');
  raise exception 'ASSERT FAILED: otro espacio cualifica';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select count(*) from public.crm_settings) = 0, 'otro espacio no ve los pesos');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ begin
  insert into public.crm_settings (tenant_id, priority_weights) values ('00000000-0000-4000-8000-000000000e01', '{"recurrence":100}');
  raise exception 'ASSERT FAILED: un comercial cambia los pesos';
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.account where id in ('50000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a2');
